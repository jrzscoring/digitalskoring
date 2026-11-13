import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  useFirestoreSync,
  type LocalStorePayload,
  sanitizeForRtdb,
  sanitizeId,
} from '../hooks/useFirestoreSync';
import { auth, db, googleProvider, handleFirestoreError, OperationType, rtdb, userRtdbProjectId } from '../lib/firebase';
import type {
  ArenaData,
  Corner,
  DewanActionType,
  JudgeId,
  MatchData,
  MatchEvent,
  MatchStatus,
} from '../types/silat';
import {
  applyDewanAction,
  determineOfficialWinner,
  evaluateJudgeConsensus,
  formatMatchTime,
  getRemainingTimerMs,
} from '../utils/ipsiRules';
import { playArenaGong, playConsensusChime } from '../utils/soundEffects';

const LOCAL_STORAGE_KEY = 'silat_ipsi2026_arena_v1';
const BROADCAST_CHANNEL_NAME = 'silat_ipsi2026_sync_v1';

function clampStr(val: string, maxLen: number, fallback = '-'): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function createDefaultSeed(): LocalStorePayload {
  const defaultArenaId = 'gelanggang-a';
  const defaultMatchId = 'partai-01';
  const defaultMatch: MatchData = {
    id: defaultMatchId,
    arenaId: defaultArenaId,
    ownerId: 'local-operator',
    matchNumber: 'Partai 01',
    weightClass: 'Kelas B Putra (50-55 kg)',
    stage: 'Final',
    blueName: 'Ahmad Fauzi',
    blueContingent: 'DKI Jakarta',
    redName: 'Budi Santoso',
    redContingent: 'Jawa Barat',
    roundDurationSec: 120,
    currentRound: 1,
    status: 'waiting',
    timerRemainingMs: 120000,
    timerStartedAtMs: 0,
    blueScore: 0,
    redScore: 0,
    bluePunches: 0,
    blueKicks: 0,
    blueFalls: 0,
    blueBinaan: 0,
    blueTeguran1: 0,
    blueTeguran2: 0,
    bluePeringatan: 0,
    redPunches: 0,
    redKicks: 0,
    redFalls: 0,
    redBinaan: 0,
    redTeguran1: 0,
    redTeguran2: 0,
    redPeringatan: 0,
    winner: '',
    winMethod: '',
  };

  return {
    arena: {
      id: defaultArenaId,
      name: 'Gelanggang A',
      tournamentName: 'Kejuaraan Nasional Pencak Silat IPSI 2026',
      ownerId: 'local-operator',
      activeMatchId: defaultMatchId,
    },
    matches: [defaultMatch],
    eventsByMatch: {
      [defaultMatchId]: [],
    },
  };
}

function loadLocalStore(): LocalStorePayload {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      const seed = createDefaultSeed();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as LocalStorePayload;
    if (!parsed?.arena || !Array.isArray(parsed.matches) || parsed.matches.length === 0) {
      return createDefaultSeed();
    }
    return parsed;
  } catch {
    return createDefaultSeed();
  }
}

export interface CreateMatchInput {
  matchNumber: string;
  weightClass: string;
  stage: string;
  blueName: string;
  blueContingent: string;
  redName: string;
  redContingent: string;
  roundDurationSec: number;
  setAsActive?: boolean;
}

interface ArenaContextValue {
  mode: 'local' | 'firebase' | 'rtdb';
  rtdbConnected: boolean;
  rtdbProjectId: string | null;
  user: User | null;
  authReady: boolean;
  syncError: string | null;
  arena: ArenaData;
  matches: MatchData[];
  activeMatch: MatchData;
  events: MatchEvent[];
  liveTimerMs: number;
  signInGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  updateArenaMeta: (name: string, tournamentName: string) => Promise<void>;
  joinArenaById: (arenaId: string) => Promise<boolean>;
  addOperatorUid: (uid: string, role: 'Sekretaris' | 'Dewan' | 'Timer' | 'Juri' | 'Scoreboard') => Promise<void>;
  createMatch: (input: CreateMatchInput) => Promise<void>;
  updateMatchMeta: (matchId: string, input: Partial<CreateMatchInput>) => Promise<void>;
  setActiveMatch: (matchId: string) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  resetMatch: (matchId: string) => Promise<void>;
  sendJudgeVote: (judgeId: JudgeId, corner: Corner, points: 1 | 2) => Promise<{ awarded: boolean }>;
  clearJudgeVote: (judgeId: JudgeId) => Promise<void>;
  triggerDewanAction: (action: DewanActionType, corner: Corner) => Promise<void>;
  undoLastEvent: () => Promise<void>;
  declareWinner: (winner: Corner | 'draw', winMethod: string) => Promise<void>;
  autoAdjudicateWinner: () => Promise<void>;
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  setRound: (round: number) => Promise<void>;
  startBreakTimer: (seconds?: number) => Promise<void>;
}

const ArenaContext = createContext<ArenaContextValue | null>(null);

export function ArenaProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [localStore, setLocalStore] = useState<LocalStorePayload>(() => loadLocalStore());
  const [joinedArenaId, setJoinedArenaId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const a = params.get('arena');
    return a ? sanitizeId(a) : null;
  });

  const channelRef = useRef<BroadcastChannel | null>(null);
  const gongFiredForRoundRef = useRef<string | null>(null);
  const rtdbArenaId = joinedArenaId || localStore.arena.id || 'gelanggang-a';

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // BroadcastChannel + localStorage listener for instant multi-tab sync in local mode
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (ev) => {
        if (ev.data?.type === 'SYNC_STATE' && ev.data.payload) {
          setLocalStore(ev.data.payload as LocalStorePayload);
        }
      };
    }

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === LOCAL_STORAGE_KEY && ev.newValue) {
        try {
          setLocalStore(JSON.parse(ev.newValue) as LocalStorePayload);
        } catch {
          // ignore parse error
        }
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      channelRef.current?.close();
    };
  }, []);

  const handleRtdbSync = useCallback((normalized: LocalStorePayload) => {
    setLocalStore(normalized);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      channelRef.current?.postMessage({ type: 'SYNC_STATE', payload: normalized });
    } catch {
      // ignore storage errors
    }
  }, []);

  const currentLocalActiveMatchId =
    localStore.matches.find((m) => m.id === localStore.arena.activeMatchId)?.id ||
    localStore.matches[0]?.id ||
    '';

  const {
    cloudArena,
    cloudMatches,
    cloudEvents,
    rtdbConnected,
    syncError,
    setSyncError,
  } = useFirestoreSync({
    user,
    authReady,
    joinedArenaId,
    rtdbArenaId,
    activeMatchId: currentLocalActiveMatchId,
    getSeedPayload: loadLocalStore,
    onRtdbSync: handleRtdbSync,
  });

  const mode: 'local' | 'firebase' | 'rtdb' =
    user && cloudArena ? 'firebase' : rtdb && rtdbConnected ? 'rtdb' : 'local';

  const commitLocalStore = useCallback(
    (updater: (prev: LocalStorePayload) => LocalStorePayload) => {
      setLocalStore((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
          channelRef.current?.postMessage({ type: 'SYNC_STATE', payload: next });
        } catch {
          // ignore storage quota errors
        }
        if (rtdb && !(user && cloudArena)) {
          const targetId = joinedArenaId || next.arena.id || 'gelanggang-a';
          set(ref(rtdb, `silat_arenas/${targetId}`), sanitizeForRtdb(next)).catch((err) => {
            setSyncError(`Gagal menulis ke Firebase RTDB: ${err?.message || 'Unknown error'}`);
          });
        }
        return next;
      });
    },
    [user, cloudArena, joinedArenaId, setSyncError]
  );

  const arena = mode === 'firebase' && cloudArena ? cloudArena : localStore.arena;
  const matches = mode === 'firebase' && cloudMatches.length > 0 ? cloudMatches : localStore.matches;
  const activeMatch = useMemo(() => {
    return matches.find((m) => m.id === arena.activeMatchId) || matches[0];
  }, [matches, arena.activeMatchId]);

  const events = useMemo(() => {
    if (mode === 'firebase') return cloudEvents;
    return localStore.eventsByMatch[activeMatch.id] || [];
  }, [mode, cloudEvents, localStore.eventsByMatch, activeMatch.id]);

  // Live synced timer ticker (updates every 100ms while active or break)
  const [liveTimerMs, setLiveTimerMs] = useState<number>(() => getRemainingTimerMs(activeMatch));

  useEffect(() => {
    setLiveTimerMs(getRemainingTimerMs(activeMatch));
    if (activeMatch.status !== 'active' && activeMatch.status !== 'break') {
      return;
    }

    const interval = window.setInterval(() => {
      const rem = getRemainingTimerMs(activeMatch, Date.now());
      setLiveTimerMs(rem);

      const roundKey = `${activeMatch.id}-r${activeMatch.currentRound}-${activeMatch.status}`;
      if (rem === 0 && gongFiredForRoundRef.current !== roundKey) {
        gongFiredForRoundRef.current = roundKey;
        playArenaGong();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [activeMatch]);

  const signInGoogle = useCallback(async () => {
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
    }
  }, []);

  const signOutGoogle = useCallback(async () => {
    await firebaseSignOut(auth);
    setJoinedArenaId(null);
  }, []);

  const recordEvent = useCallback(
    async (
      matchId: string,
      evInput: Omit<MatchEvent, 'id' | 'arenaId' | 'matchId' | 'ownerId' | 'createdAt' | 'createdAtMs'>
    ) => {
      const eventId = sanitizeId(`ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${matchId}/events/${eventId}`;
        try {
          await setDoc(doc(db, 'arenas', cloudArena.id, 'matches', matchId, 'events', eventId), {
            id: eventId,
            arenaId: cloudArena.id,
            matchId,
            ownerId: cloudArena.ownerId,
            actorRole: clampStr(evInput.actorRole, 32, 'Sistem'),
            corner: evInput.corner,
            type: clampStr(evInput.type, 32, 'info'),
            pointsDelta: evInput.pointsDelta,
            round: evInput.round,
            matchTimeFormatted: clampStr(evInput.matchTimeFormatted, 16, '00:00'),
            description: clampStr(evInput.description, 200, '-'),
            undone: false,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else {
        const newEvent: MatchEvent = {
          id: eventId,
          arenaId: arena.id,
          matchId,
          ownerId: arena.ownerId,
          ...evInput,
          createdAtMs: Date.now(),
        };
        commitLocalStore((prev) => ({
          ...prev,
          eventsByMatch: {
            ...prev.eventsByMatch,
            [matchId]: [newEvent, ...(prev.eventsByMatch[matchId] || [])].slice(0, 100),
          },
        }));
      }
    },
    [mode, cloudArena, arena.id, arena.ownerId, commitLocalStore]
  );

  const updateArenaMeta = useCallback(
    async (name: string, tournamentName: string) => {
      const safeName = clampStr(name, 80, 'Gelanggang A');
      const safeTournament = clampStr(tournamentName, 120, 'Kejuaraan Pencak Silat IPSI 2026');
      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id), {
            name: safeName,
            tournamentName: safeTournament,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          arena: { ...prev.arena, name: safeName, tournamentName: safeTournament },
        }));
      }
    },
    [mode, cloudArena, commitLocalStore]
  );

  const joinArenaById = useCallback(
    async (arenaIdInput: string): Promise<boolean> => {
      const safeId = sanitizeId(arenaIdInput);
      if (!user) {
        if (rtdb) {
          setJoinedArenaId(safeId);
          setSyncError(null);
          return true;
        }
        setSyncError('Silakan masuk Google terlebih dahulu untuk bergabung ke Arena Firestore.');
        return false;
      }
      try {
        const snap = await getDoc(doc(db, 'arenas', safeId));
        if (!snap.exists()) {
          setSyncError(`Gelanggang "${safeId}" tidak ditemukan atau akses ditolak.`);
          return false;
        }
        setJoinedArenaId(safeId);
        setSyncError(null);
        return true;
      } catch (err) {
        setSyncError('Akses gelanggang ditolak. Pastikan UID Anda telah didaftarkan Sekretaris.');
        return false;
      }
    },
    [user]
  );

  const addOperatorUid = useCallback(
    async (uid: string, role: 'Sekretaris' | 'Dewan' | 'Timer' | 'Juri' | 'Scoreboard') => {
      if (mode !== 'firebase' || !cloudArena || !user) return;
      const safeUid = sanitizeId(uid);
      const path = `arenas/${cloudArena.id}/operators/${safeUid}`;
      try {
        await setDoc(doc(db, 'arenas', cloudArena.id, 'operators', safeUid), {
          uid: safeUid,
          arenaId: cloudArena.id,
          ownerId: cloudArena.ownerId,
          role,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [mode, cloudArena, user]
  );

  const createMatch = useCallback(
    async (input: CreateMatchInput) => {
      const matchId = sanitizeId(`partai-${Date.now().toString(36)}`);
      const roundSec = Math.min(300, Math.max(30, Math.round(input.roundDurationSec || 120)));
      const newMatch: MatchData = {
        id: matchId,
        arenaId: arena.id,
        ownerId: user?.uid || arena.ownerId,
        matchNumber: clampStr(input.matchNumber, 32, 'Partai Baru'),
        weightClass: clampStr(input.weightClass, 80, 'Kelas Bebas'),
        stage: clampStr(input.stage, 40, 'Penyisihan'),
        blueName: clampStr(input.blueName, 80, 'Pesilat Biru'),
        blueContingent: clampStr(input.blueContingent, 80, 'Kontingen Biru'),
        redName: clampStr(input.redName, 80, 'Pesilat Merah'),
        redContingent: clampStr(input.redContingent, 80, 'Kontingen Merah'),
        roundDurationSec: roundSec,
        currentRound: 1,
        status: 'waiting',
        timerRemainingMs: roundSec * 1000,
        timerStartedAtMs: 0,
        blueScore: 0,
        redScore: 0,
        bluePunches: 0,
        blueKicks: 0,
        blueFalls: 0,
        blueBinaan: 0,
        blueTeguran1: 0,
        blueTeguran2: 0,
        bluePeringatan: 0,
        redPunches: 0,
        redKicks: 0,
        redFalls: 0,
        redBinaan: 0,
        redTeguran1: 0,
        redTeguran2: 0,
        redPeringatan: 0,
        winner: '',
        winMethod: '',
      };

      if (mode === 'firebase' && cloudArena && user) {
        const path = `arenas/${cloudArena.id}/matches/${matchId}`;
        try {
          await setDoc(doc(db, 'arenas', cloudArena.id, 'matches', matchId), {
            ...newMatch,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (input.setAsActive !== false) {
            await updateDoc(doc(db, 'arenas', cloudArena.id), {
              activeMatchId: matchId,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          arena:
            input.setAsActive !== false
              ? { ...prev.arena, activeMatchId: matchId }
              : prev.arena,
          matches: [...prev.matches, newMatch],
          eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
        }));
      }
    },
    [arena.id, arena.ownerId, mode, cloudArena, user, commitLocalStore]
  );

  const updateMatchMeta = useCallback(
    async (matchId: string, input: Partial<CreateMatchInput>) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target) return;
      const roundSec = input.roundDurationSec
        ? Math.min(300, Math.max(30, Math.round(input.roundDurationSec)))
        : target.roundDurationSec;

      const patch: Partial<MatchData> = {
        matchNumber: input.matchNumber ? clampStr(input.matchNumber, 32) : target.matchNumber,
        weightClass: input.weightClass ? clampStr(input.weightClass, 80) : target.weightClass,
        stage: input.stage ? clampStr(input.stage, 40) : target.stage,
        blueName: input.blueName ? clampStr(input.blueName, 80) : target.blueName,
        blueContingent: input.blueContingent ? clampStr(input.blueContingent, 80) : target.blueContingent,
        redName: input.redName ? clampStr(input.redName, 80) : target.redName,
        redContingent: input.redContingent ? clampStr(input.redContingent, 80) : target.redContingent,
        roundDurationSec: roundSec,
        timerRemainingMs:
          target.status === 'waiting' ? roundSec * 1000 : target.timerRemainingMs,
      };

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${matchId}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', matchId), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m)),
        }));
      }
    },
    [matches, mode, cloudArena, commitLocalStore]
  );

  const setActiveMatch = useCallback(
    async (matchId: string) => {
      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id), {
            activeMatchId: matchId,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          arena: { ...prev.arena, activeMatchId: matchId },
        }));
      }
    },
    [mode, cloudArena, commitLocalStore]
  );

  const deleteMatch = useCallback(
    async (matchId: string) => {
      if (matches.length <= 1) return;
      const fallback = matches.find((m) => m.id !== matchId) || matches[0];
      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${matchId}`;
        try {
          if (cloudArena.activeMatchId === matchId) {
            await updateDoc(doc(db, 'arenas', cloudArena.id), {
              activeMatchId: fallback.id,
              updatedAt: serverTimestamp(),
            });
          }
          await deleteDoc(doc(db, 'arenas', cloudArena.id, 'matches', matchId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
      } else {
        commitLocalStore((prev) => {
          const remaining = prev.matches.filter((m) => m.id !== matchId);
          return {
            ...prev,
            arena:
              prev.arena.activeMatchId === matchId
                ? { ...prev.arena, activeMatchId: remaining[0].id }
                : prev.arena,
            matches: remaining,
          };
        });
      }
    },
    [matches, mode, cloudArena, commitLocalStore]
  );

  const resetMatch = useCallback(
    async (matchId: string) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target) return;
      const resetPatch = {
        currentRound: 1,
        status: 'waiting' as MatchStatus,
        timerRemainingMs: target.roundDurationSec * 1000,
        timerStartedAtMs: 0,
        blueScore: 0,
        redScore: 0,
        bluePunches: 0,
        blueKicks: 0,
        blueFalls: 0,
        blueBinaan: 0,
        blueTeguran1: 0,
        blueTeguran2: 0,
        bluePeringatan: 0,
        redPunches: 0,
        redKicks: 0,
        redFalls: 0,
        redBinaan: 0,
        redTeguran1: 0,
        redTeguran2: 0,
        redPeringatan: 0,
        judge1Vote: { corner: 'none' as const, points: 0, timestampMs: 0, round: 1 },
        judge2Vote: { corner: 'none' as const, points: 0, timestampMs: 0, round: 1 },
        judge3Vote: { corner: 'none' as const, points: 0, timestampMs: 0, round: 1 },
        winner: '' as const,
        winMethod: '',
      };

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${matchId}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', matchId), {
            ...resetPatch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...resetPatch } : m)),
          eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
        }));
      }
    },
    [matches, mode, cloudArena, commitLocalStore]
  );

  const sendJudgeVote = useCallback(
    async (judgeId: JudgeId, corner: Corner, points: 1 | 2): Promise<{ awarded: boolean }> => {
      if (activeMatch.status === 'finished') return { awarded: false };

      const nowMs = Date.now();
      const res = evaluateJudgeConsensus(
        {
          judge1Vote: activeMatch.judge1Vote,
          judge2Vote: activeMatch.judge2Vote,
          judge3Vote: activeMatch.judge3Vote,
        },
        {
          judgeId,
          corner,
          points,
          timestampMs: nowMs,
          round: activeMatch.currentRound,
        }
      );

      const patch: Partial<MatchData> = {
        ...res.updatedVotes,
      };

      if (res.consensusAwarded) {
        playConsensusChime();
        const isBlue = res.consensusAwarded.corner === 'blue';
        if (res.consensusAwarded.points === 1) {
          if (isBlue) {
            patch.blueScore = activeMatch.blueScore + 1;
            patch.bluePunches = activeMatch.bluePunches + 1;
          } else {
            patch.redScore = activeMatch.redScore + 1;
            patch.redPunches = activeMatch.redPunches + 1;
          }
        } else {
          if (isBlue) {
            patch.blueScore = activeMatch.blueScore + 2;
            patch.blueKicks = activeMatch.blueKicks + 1;
          } else {
            patch.redScore = activeMatch.redScore + 2;
            patch.redKicks = activeMatch.redKicks + 1;
          }
        }
      }

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
        }));
      }

      if (res.consensusAwarded) {
        const label = res.consensusAwarded.points === 1 ? 'Pukulan (+1)' : 'Tendangan (+2)';
        const cornerLabel = res.consensusAwarded.corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
        const jStr = res.consensusAwarded.judges.map((j) => `J${j}`).join('+');
        await recordEvent(activeMatch.id, {
          actorRole: `Konsensus ${jStr}`,
          corner: res.consensusAwarded.corner,
          type: res.consensusAwarded.points === 1 ? 'punch' : 'kick',
          pointsDelta: res.consensusAwarded.points,
          round: activeMatch.currentRound,
          matchTimeFormatted: formatMatchTime(getRemainingTimerMs(activeMatch, nowMs)),
          description: `${label} Sah untuk ${cornerLabel} (${jStr})`,
          undone: false,
        });
      }

      return { awarded: Boolean(res.consensusAwarded) };
    },
    [activeMatch, mode, cloudArena, commitLocalStore, recordEvent]
  );

  const clearJudgeVote = useCallback(
    async (judgeId: JudgeId) => {
      if (activeMatch.status === 'finished') return;
      const voteKey = judgeId === 1 ? 'judge1Vote' : judgeId === 2 ? 'judge2Vote' : 'judge3Vote';
      const emptyVote = { corner: 'none' as const, points: 0, timestampMs: 0, round: activeMatch.currentRound };

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            [voteKey]: emptyVote,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) =>
            m.id === activeMatch.id ? { ...m, [voteKey]: emptyVote } : m
          ),
        }));
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore]
  );

  const triggerDewanAction = useCallback(
    async (action: DewanActionType, corner: Corner) => {
      if (activeMatch.status === 'finished') return;
      const result = applyDewanAction(activeMatch, action, corner);
      const timeStr = formatMatchTime(getRemainingTimerMs(activeMatch, Date.now()));

      if (result.autoDisqualified) {
        playArenaGong();
      }

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            ...result.patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) =>
            m.id === activeMatch.id ? { ...m, ...result.patch } : m
          ),
        }));
      }

      await recordEvent(activeMatch.id, {
        actorRole: 'Dewan / Wasit',
        corner,
        type: action,
        pointsDelta: result.pointsDelta,
        round: activeMatch.currentRound,
        matchTimeFormatted: timeStr,
        description: result.description,
        undone: false,
      });
    },
    [activeMatch, mode, cloudArena, commitLocalStore, recordEvent]
  );

  const undoLastEvent = useCallback(async () => {
    const lastActive = events.find((e) => !e.undone);
    if (!lastActive || activeMatch.status === 'finished') return;

    const patch: Partial<MatchData> = {};
    const isBlue = lastActive.corner === 'blue';

    if (lastActive.corner === 'blue' || lastActive.corner === 'red') {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      patch[scoreKey] = activeMatch[scoreKey] - lastActive.pointsDelta;

      switch (lastActive.type) {
        case 'punch':
          patch[isBlue ? 'bluePunches' : 'redPunches'] = Math.max(0, activeMatch[isBlue ? 'bluePunches' : 'redPunches'] - 1);
          break;
        case 'kick':
          patch[isBlue ? 'blueKicks' : 'redKicks'] = Math.max(0, activeMatch[isBlue ? 'blueKicks' : 'redKicks'] - 1);
          break;
        case 'fall':
          patch[isBlue ? 'blueFalls' : 'redFalls'] = Math.max(0, activeMatch[isBlue ? 'blueFalls' : 'redFalls'] - 1);
          break;
        case 'binaan':
          patch[isBlue ? 'blueBinaan' : 'redBinaan'] = Math.max(0, activeMatch[isBlue ? 'blueBinaan' : 'redBinaan'] - 1);
          break;
        case 'teguran1':
          patch[isBlue ? 'blueTeguran1' : 'redTeguran1'] = Math.max(0, activeMatch[isBlue ? 'blueTeguran1' : 'redTeguran1'] - 1);
          break;
        case 'teguran2':
          patch[isBlue ? 'blueTeguran2' : 'redTeguran2'] = Math.max(0, activeMatch[isBlue ? 'blueTeguran2' : 'redTeguran2'] - 1);
          break;
        case 'peringatan1':
          patch[isBlue ? 'bluePeringatan' : 'redPeringatan'] = 0;
          break;
        case 'peringatan2':
          patch[isBlue ? 'bluePeringatan' : 'redPeringatan'] = 1;
          break;
      }
    }

    if (mode === 'firebase' && cloudArena) {
      const matchPath = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
      const evPath = `${matchPath}/events/${lastActive.id}`;
      try {
        await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id, 'events', lastActive.id), {
          undone: true,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, evPath);
      }
    } else {
      commitLocalStore((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
        eventsByMatch: {
          ...prev.eventsByMatch,
          [activeMatch.id]: (prev.eventsByMatch[activeMatch.id] || []).map((e) =>
            e.id === lastActive.id ? { ...e, undone: true } : e
          ),
        },
      }));
    }
  }, [events, activeMatch, mode, cloudArena, commitLocalStore]);

  const declareWinner = useCallback(
    async (winner: Corner | 'draw', winMethod: string) => {
      const remaining = getRemainingTimerMs(activeMatch, Date.now());
      const patch: Partial<MatchData> = {
        status: 'finished',
        timerRemainingMs: remaining,
        timerStartedAtMs: 0,
        winner,
        winMethod: clampStr(winMethod, 64, 'Menang Angka'),
      };
      playArenaGong();

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
        }));
      }

      const winnerLabel =
        winner === 'blue' ? `Sudut Biru (${activeMatch.blueName})` : winner === 'red' ? `Sudut Merah (${activeMatch.redName})` : 'Seri';
      await recordEvent(activeMatch.id, {
        actorRole: 'Dewan',
        corner: winner === 'draw' ? 'neutral' : winner,
        type: 'winner',
        pointsDelta: 0,
        round: activeMatch.currentRound,
        matchTimeFormatted: formatMatchTime(remaining),
        description: `Pengesahan Pemenang: ${winnerLabel} — ${winMethod}`,
        undone: false,
      });
    },
    [activeMatch, mode, cloudArena, commitLocalStore, recordEvent]
  );

  const autoAdjudicateWinner = useCallback(async () => {
    const decision = determineOfficialWinner(activeMatch);
    await declareWinner(decision.winner, decision.winMethod);
  }, [activeMatch, declareWinner]);

  const startTimer = useCallback(async () => {
    if (activeMatch.status === 'finished') return;
    const rem = getRemainingTimerMs(activeMatch, Date.now());
    const initialMs = rem > 0 ? rem : activeMatch.roundDurationSec * 1000;
    const patch: Partial<MatchData> = {
      status: 'active',
      timerRemainingMs: initialMs,
      timerStartedAtMs: Date.now(),
    };
    if (activeMatch.status === 'waiting') {
      playArenaGong();
    }

    if (mode === 'firebase' && cloudArena) {
      const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
      try {
        await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      commitLocalStore((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      }));
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore]);

  const pauseTimer = useCallback(async () => {
    if (activeMatch.status !== 'active' && activeMatch.status !== 'break') return;
    const rem = getRemainingTimerMs(activeMatch, Date.now());
    const patch: Partial<MatchData> = {
      status: 'paused',
      timerRemainingMs: rem,
      timerStartedAtMs: 0,
    };

    if (mode === 'firebase' && cloudArena) {
      const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
      try {
        await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      commitLocalStore((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      }));
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore]);

  const resetTimer = useCallback(async () => {
    if (activeMatch.status === 'finished') return;
    const patch: Partial<MatchData> = {
      status: 'waiting',
      timerRemainingMs: activeMatch.roundDurationSec * 1000,
      timerStartedAtMs: 0,
    };
    gongFiredForRoundRef.current = null;

    if (mode === 'firebase' && cloudArena) {
      const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
      try {
        await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      commitLocalStore((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      }));
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore]);

  const setRound = useCallback(
    async (round: number) => {
      if (activeMatch.status === 'finished') return;
      const safeRound = Math.min(3, Math.max(1, round));
      const patch: Partial<MatchData> = {
        currentRound: safeRound,
        status: 'waiting',
        timerRemainingMs: activeMatch.roundDurationSec * 1000,
        timerStartedAtMs: 0,
      };
      gongFiredForRoundRef.current = null;

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
        }));
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore]
  );

  const startBreakTimer = useCallback(
    async (seconds: number = 60) => {
      if (activeMatch.status === 'finished') return;
      const patch: Partial<MatchData> = {
        status: 'break',
        timerRemainingMs: seconds * 1000,
        timerStartedAtMs: Date.now(),
      };
      gongFiredForRoundRef.current = null;

      if (mode === 'firebase' && cloudArena) {
        const path = `arenas/${cloudArena.id}/matches/${activeMatch.id}`;
        try {
          await updateDoc(doc(db, 'arenas', cloudArena.id, 'matches', activeMatch.id), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        commitLocalStore((prev) => ({
          ...prev,
          matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
        }));
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore]
  );

  const value: ArenaContextValue = {
    mode,
    rtdbConnected,
    rtdbProjectId: userRtdbProjectId,
    user,
    authReady,
    syncError,
    arena,
    matches,
    activeMatch,
    events,
    liveTimerMs,
    signInGoogle,
    signOutGoogle,
    updateArenaMeta,
    joinArenaById,
    addOperatorUid,
    createMatch,
    updateMatchMeta,
    setActiveMatch,
    deleteMatch,
    resetMatch,
    sendJudgeVote,
    clearJudgeVote,
    triggerDewanAction,
    undoLastEvent,
    declareWinner,
    autoAdjudicateWinner,
    startTimer,
    pauseTimer,
    resetTimer,
    setRound,
    startBreakTimer,
  };

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena(): ArenaContextValue {
  const ctx = useContext(ArenaContext);
  if (!ctx) throw new Error('useArena must be used within ArenaProvider');
  return ctx;
}
