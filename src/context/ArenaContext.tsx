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
  writeBatch,
} from 'firebase/firestore';
import {
  useFirestoreSync,
  type LocalStorePayload,
  sanitizeForRtdb,
  sanitizeId,
} from '../hooks/useFirestoreSync';
import { auth, db, googleProvider, handleFirestoreError, OperationType, rtdb, userRtdbProjectId } from '../lib/firebase';
import {
  clonePayload,
  enqueueFirestoreOp,
  getPendingFirestoreOps,
  isBrowserOnline,
  isOfflineNetworkError,
  isPermissionDeniedError,
  markRtdbBackupSynced,
  readOfflineBackup,
  saveFirestoreSnapshotBackup,
  saveRtdbLocalBackup,
  type PendingFirestoreOp,
} from '../utils/offlineSync';
import type {
  ArenaCourt,
  ArenaData,
  AthleteAgeCategory,
  AthleteData,
  AthleteGender,
  BracketMatchSlot,
  BracketMode,
  CompetitionCategory,
  Corner,
  DewanActionType,
  JudgeId,
  JurusCategory,
  JurusCornerData,
  JurusJudgeCornerScore,
  JurusMatchState,
  JurusPenaltyType,
  MatchData,
  MatchEvent,
  MatchStatus,
  PemasalanPoolSize,
  VerificationKind,
  VerificationVoteChoice,
  VerificationVoteValue,
} from '../types/silat';
import { buildTournamentBracketSlots } from '../utils/bracketBuilder';
import {
  JURUS_DEFAULT_DURATION_SEC,
  JURUS_PENALTY_LABELS,
  applyDewanAction,
  computeCornerJurusSummary,
  createInitialJurusState,
  createVerificationState,
  determineOfficialWinner,
  ensureJurusState,
  evaluateJudgeConsensus,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchTime,
  getJurusType,
  getRemainingTimerMs,
  isJurusMatch,
  normalizeJurusType,
} from '../utils/ipsiRules';
import { playArenaGong, playConsensusChime } from '../utils/soundEffects';

const LOCAL_STORAGE_KEY = 'silat_ipsi2026_arena_v1';
const BROADCAST_CHANNEL_NAME = 'silat_ipsi2026_sync_v1';

function clampStr(val: string, maxLen: number, fallback = '-'): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function isRealAthleteName(name?: string): boolean {
  return Boolean(name && name !== 'BYE' && name !== 'Menunggu Pemenang');
}

function isSlotReadyForMatch(slot: BracketMatchSlot): boolean {
  return isRealAthleteName(slot.blueName) && isRealAthleteName(slot.redName);
}

const TWO_ROUND_AGE_CATEGORIES = new Set<string>([
  'Usia Dini 1',
  'Usia Dini 2',
  'Usia Dini',
  'Pra Remaja',
  'Master',
]);

function resolveTotalRoundsForBracket(
  bracketMode: BracketMode,
  ageCategory?: string,
  pool?: AthleteData[]
): 2 | 3 {
  if (bracketMode === 'pemasalan') return 2;
  if (ageCategory && ageCategory !== 'Semua') {
    return TWO_ROUND_AGE_CATEGORIES.has(ageCategory) ? 2 : 3;
  }
  if (pool && pool.length > 0 && pool.every((a) => TWO_ROUND_AGE_CATEGORIES.has(a.ageCategory || ''))) {
    return 2;
  }
  return 3;
}

function getNextMatchNumber(existingMatches: MatchData[]): string {
  let maxNum = 0;
  for (const m of existingMatches) {
    const numMatch = m.matchNumber.match(/(\d+)/);
    if (numMatch) {
      const parsed = Number(numMatch[1]);
      if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
    }
  }
  const next = Math.max(maxNum + 1, existingMatches.length + 1);
  return `Partai ${String(next).padStart(2, '0')}`;
}

function buildMatchFromSlot(
  slot: BracketMatchSlot,
  matchNumber: string,
  arenaId: string,
  ownerId: string,
  totalRounds: 1 | 2 | 3,
  seedSuffix: string
): MatchData {
  const matchId = sanitizeId(`partai-${Date.now().toString(36)}-${seedSuffix}`);
  const isJurus =
    slot.competitionCategory === 'Jurus' ||
    isJurusMatch({ weightClass: slot.weightClass });
  const durationSec = isJurus ? JURUS_DEFAULT_DURATION_SEC : 120;
  const resolvedRounds: 1 | 2 | 3 = isJurus ? 1 : totalRounds;

  const base: MatchData = {
    id: matchId,
    arenaId,
    ownerId,
    matchNumber,
    weightClass: `${slot.weightClass} (${slot.gender})`,
    stage: slot.stage,
    competitionCategory: isJurus ? 'Jurus' : 'Tanding',
    blueName: slot.blueName,
    blueContingent: slot.blueContingent || '-',
    redName: slot.redName,
    redContingent: slot.redContingent || '-',
    roundDurationSec: durationSec,
    currentRound: 1,
    totalRounds: resolvedRounds,
    status: 'waiting',
    timerRemainingMs: durationSec * 1000,
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

  if (isJurus) {
    base.jurusType = normalizeJurusType(slot.weightClass);
    base.activePerformerCorner = 'blue';
    base.jurusState = createInitialJurusState();
  }

  return base;
}

function syncBracketOnWinner(
  brackets: BracketMatchSlot[],
  matches: MatchData[],
  finishedMatch: MatchData,
  winner: Corner,
  arenaId: string,
  ownerId: string
): {
  nextBrackets: BracketMatchSlot[];
  createdMatch: MatchData | null;
  updatedExistingMatch: { id: string; patch: Partial<MatchData> } | null;
  updatedSlots: BracketMatchSlot[];
} {
  let slot = brackets.find((b) => b.matchId === finishedMatch.id);
  if (!slot) {
    slot = brackets.find(
      (b) =>
        b.stage === finishedMatch.stage &&
        `${b.weightClass} (${b.gender})` === finishedMatch.weightClass &&
        b.blueName === finishedMatch.blueName &&
        b.redName === finishedMatch.redName
    );
  }
  if (!slot) {
    return { nextBrackets: brackets, createdMatch: null, updatedExistingMatch: null, updatedSlots: [] };
  }

  const wName = winner === 'blue' ? slot.blueName : slot.redName;
  const wCont = winner === 'blue' ? slot.blueContingent : slot.redContingent;
  if (!isRealAthleteName(wName)) {
    return { nextBrackets: brackets, createdMatch: null, updatedExistingMatch: null, updatedSlots: [] };
  }

  const nextSlot = brackets.find(
    (b) =>
      b.weightClass === slot.weightClass &&
      b.gender === slot.gender &&
      (b.poolIndex ?? 0) === (slot.poolIndex ?? 0) &&
      b.roundIndex === slot.roundIndex + 1 &&
      b.slotIndex === Math.floor(slot.slotIndex / 2)
  );

  const updatedSlot: BracketMatchSlot = {
    ...slot,
    matchId: slot.matchId || finishedMatch.id,
    winnerSide: winner,
    winnerName: wName,
    winnerContingent: wCont,
  };

  let updatedNextSlot: BracketMatchSlot | null = null;
  let createdMatch: MatchData | null = null;
  let updatedExistingMatch: { id: string; patch: Partial<MatchData> } | null = null;

  if (nextSlot) {
    updatedNextSlot =
      slot.slotIndex % 2 === 0
        ? { ...nextSlot, blueName: wName, blueContingent: wCont }
        : { ...nextSlot, redName: wName, redContingent: wCont };

    if (isSlotReadyForMatch(updatedNextSlot)) {
      const existingNextMatch = updatedNextSlot.matchId
        ? matches.find((m) => m.id === updatedNextSlot!.matchId)
        : undefined;

      if (existingNextMatch && existingNextMatch.status !== 'finished') {
        updatedExistingMatch = {
          id: existingNextMatch.id,
          patch: {
            blueName: updatedNextSlot.blueName,
            blueContingent: updatedNextSlot.blueContingent || '-',
            redName: updatedNextSlot.redName,
            redContingent: updatedNextSlot.redContingent || '-',
          },
        };
      } else if (!existingNextMatch) {
        const rounds =
          finishedMatch.totalRounds ??
          resolveTotalRoundsForBracket(updatedNextSlot.bracketMode || 'prestasi', updatedNextSlot.ageCategory);
        createdMatch = buildMatchFromSlot(
          updatedNextSlot,
          getNextMatchNumber(matches),
          arenaId,
          ownerId,
          rounds,
          `adv-${Date.now().toString(36)}`
        );
        updatedNextSlot = { ...updatedNextSlot, matchId: createdMatch.id };
      }
    }
  }

  const updatedSlots: BracketMatchSlot[] = [updatedSlot];
  if (updatedNextSlot) updatedSlots.push(updatedNextSlot);

  const nextBrackets = brackets.map((b) => {
    if (b.id === updatedSlot.id) return updatedSlot;
    if (updatedNextSlot && b.id === updatedNextSlot.id) return updatedNextSlot;
    return b;
  });

  return { nextBrackets, createdMatch, updatedExistingMatch, updatedSlots };
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
    totalRounds: 3,
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
      venue: '',
      eventDate: '',
      logoLeft: '',
      logoRight: '',
      ownerId: 'local-operator',
      activeMatchId: defaultMatchId,
    },
    matches: [defaultMatch],
    eventsByMatch: {
      [defaultMatchId]: [],
    },
    athletes: [],
    brackets: [],
  };
}

function loadLocalStore(preferredArenaId?: string | null): LocalStorePayload {
  try {
    if (preferredArenaId) {
      const backup = readOfflineBackup(preferredArenaId);
      if (backup?.payload?.arena && Array.isArray(backup.payload.matches) && backup.payload.matches.length > 0) {
        return backup.payload;
      }
    }
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
  competitionCategory?: CompetitionCategory;
  jurusType?: JurusCategory;
  totalRounds?: 1 | 2 | 3;
  blueName: string;
  blueContingent: string;
  redName: string;
  redContingent: string;
  roundDurationSec: number;
  setAsActive?: boolean;
}

export interface UpdateArenaMetaInput {
  tournamentName: string;
  venue: string;
  eventDate: string;
  logoLeft: string;
  logoRight: string;
  name?: string;
}

export interface AddAthleteInput {
  name: string;
  contingent: string;
  weightClass: string;
  gender: AthleteGender;
  ageCategory: AthleteAgeCategory;
  competitionCategory: CompetitionCategory;
  gelanggang: ArenaCourt;
}

export interface GenerateBracketInput {
  weightClass: string;
  gender: AthleteGender;
  bracketMode: BracketMode;
  poolSize?: PemasalanPoolSize;
  ageCategory?: AthleteAgeCategory | 'Semua';
  competitionCategory?: CompetitionCategory;
  gelanggang?: ArenaCourt | 'Semua';
}

interface ArenaContextValue {
  mode: 'local' | 'firebase' | 'rtdb';
  rtdbConnected: boolean;
  rtdbProjectId: string | null;
  isOnline: boolean;
  pendingSyncCount: number;
  user: User | null;
  authReady: boolean;
  syncError: string | null;
  arena: ArenaData;
  matches: MatchData[];
  activeMatch: MatchData;
  events: MatchEvent[];
  getMatchEvents: (matchId: string) => MatchEvent[];
  athletes: AthleteData[];
  brackets: BracketMatchSlot[];
  liveTimerMs: number;
  signInGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  updateArenaMeta: (meta: UpdateArenaMetaInput) => Promise<void>;
  joinArenaById: (arenaId: string) => Promise<boolean>;
  addOperatorUid: (uid: string, role: 'Sekretaris' | 'Dewan' | 'Timer' | 'Juri' | 'Scoreboard') => Promise<void>;
  createMatch: (input: CreateMatchInput) => Promise<void>;
  updateMatchMeta: (matchId: string, input: Partial<CreateMatchInput>) => Promise<void>;
  setActiveMatch: (matchId: string) => Promise<void>;
  setMatchTotalRounds: (matchId: string, totalRounds: 2 | 3) => Promise<void>;
  applyLotingMatchAssignments: (
    updates: Array<{
      matchId: string;
      blueName: string;
      blueContingent: string;
      redName: string;
      redContingent: string;
    }>
  ) => Promise<number>;
  deleteMatch: (matchId: string) => Promise<void>;
  resetMatch: (matchId: string) => Promise<void>;
  addAthlete: (input: AddAthleteInput) => Promise<void>;
  importAthletes: (inputs: AddAthleteInput[]) => Promise<number>;
  deleteAthlete: (athleteId: string) => Promise<void>;
  clearAthletes: () => Promise<void>;
  generateBracket: (
    input: GenerateBracketInput
  ) => Promise<{ createdSlots: number; poolCount: number; error?: string }>;
  activateBracketMatch: (slotId: string) => Promise<void>;
  advanceBracketWinner: (slotId: string, winnerSide: Corner) => Promise<void>;
  clearBracket: (weightClass: string, gender: AthleteGender) => Promise<void>;
  sendJudgeVote: (judgeId: JudgeId, corner: Corner, points: 1 | 2) => Promise<{ awarded: boolean }>;
  clearJudgeVote: (judgeId: JudgeId) => Promise<void>;
  triggerDewanAction: (action: DewanActionType, corner: Corner) => Promise<void>;
  startVerification: (kind: VerificationKind) => Promise<void>;
  castVerificationVote: (judgeId: JudgeId, choice: VerificationVoteChoice) => Promise<void>;
  cancelVerification: () => Promise<void>;
  resolveVerification: () => Promise<void>;
  submitVerification: (
    kind: 'jatuhan' | 'pelanggaran',
    corner: Corner | 'neutral',
    outcome: 'sah' | 'tidak_sah',
    description: string,
    applyFallPoint?: boolean
  ) => Promise<void>;
  undoLastEvent: () => Promise<void>;
  declareWinner: (winner: Corner | 'draw', winMethod: string) => Promise<void>;
  autoAdjudicateWinner: () => Promise<void>;
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  setRound: (round: number) => Promise<void>;
  startBreakTimer: (seconds?: number) => Promise<void>;
  setActivePerformerCorner: (corner: Corner) => Promise<void>;
  recordJurusWrongMove: (judgeId: JudgeId, corner: Corner, delta: 1 | -1) => Promise<void>;
  setJurusStaminaScore: (judgeId: JudgeId, corner: Corner, valueHundredths: number) => Promise<void>;
  setJurusCreativeScore: (
    judgeId: JudgeId,
    corner: Corner,
    component: 'attackScore' | 'harmonyScore' | 'soulScore',
    valueHundredths: number
  ) => Promise<void>;
  toggleJurusJudgeSubmit: (judgeId: JudgeId, corner: Corner) => Promise<void>;
  triggerJurusDewanPenalty: (
    corner: Corner,
    penaltyKey: JurusPenaltyType,
    delta: 1 | -1
  ) => Promise<void>;
  recordJurusElapsedAndSwitch: (nextCorner?: Corner) => Promise<void>;
}

const ArenaContext = createContext<ArenaContextValue | null>(null);

export function ArenaProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [joinedArenaId, setJoinedArenaId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const a = params.get('arena');
    return a ? sanitizeId(a) : null;
  });
  const [localStore, setLocalStore] = useState<LocalStorePayload>(() => loadLocalStore(joinedArenaId));
  const localStoreRef = useRef<LocalStorePayload>(localStore);
  const [pendingOpsCount, setPendingOpsCount] = useState<number>(0);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const gongFiredForRoundRef = useRef<string | null>(null);
  const autoFinishedMatchRef = useRef<string | null>(null);
  const autoAdjudicateRef = useRef<() => Promise<void>>(async () => {});
  const rtdbArenaId = joinedArenaId || localStore.arena.id || 'gelanggang-a';

  // Keep synchronous ref aligned with localStore
  useEffect(() => {
    localStoreRef.current = localStore;
  }, [localStore]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // BroadcastChannel + localStorage listener for instant multi-tab sync in local/offline mode
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (ev) => {
        if (ev.data?.type === 'SYNC_STATE' && ev.data.payload) {
          const payload = ev.data.payload as LocalStorePayload;
          localStoreRef.current = payload;
          setLocalStore(payload);
        }
      };
    }

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === LOCAL_STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue) as LocalStorePayload;
          localStoreRef.current = parsed;
          setLocalStore(parsed);
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

  const persistLocalMirror = useCallback((next: LocalStorePayload) => {
    localStoreRef.current = next;
    setLocalStore(next);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      channelRef.current?.postMessage({ type: 'SYNC_STATE', payload: next });
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const handleRtdbSync = useCallback(
    (normalized: LocalStorePayload) => {
      persistLocalMirror(normalized);
    },
    [persistLocalMirror]
  );

  const handleFirestoreMirror = useCallback(
    (mirrored: LocalStorePayload) => {
      persistLocalMirror(mirrored);
    },
    [persistLocalMirror]
  );

  const getSeedForSync = useCallback(() => loadLocalStore(joinedArenaId), [joinedArenaId]);

  const currentLocalActiveMatchId =
    localStore.matches.find((m) => m.id === localStore.arena.activeMatchId)?.id ||
    localStore.matches[0]?.id ||
    '';

  const {
    cloudArena,
    cloudMatches,
    cloudEvents,
    cloudAthletes,
    cloudBrackets,
    rtdbConnected,
    isOnline,
    syncError,
    setSyncError,
  } = useFirestoreSync({
    user,
    authReady,
    joinedArenaId,
    rtdbArenaId,
    activeMatchId: currentLocalActiveMatchId,
    getSeedPayload: getSeedForSync,
    onRtdbSync: handleRtdbSync,
    onFirestoreMirror: handleFirestoreMirror,
    onPendingOpsCountChange: setPendingOpsCount,
  });

  const mode: 'local' | 'firebase' | 'rtdb' =
    user && cloudArena ? 'firebase' : rtdb && rtdbConnected ? 'rtdb' : 'local';

  const commitLocalBackupOnly = useCallback(
    (updater: (prev: LocalStorePayload) => LocalStorePayload): LocalStorePayload => {
      const next = updater(localStoreRef.current);
      persistLocalMirror(next);
      return next;
    },
    [persistLocalMirror]
  );

  const commitLocalStore = useCallback(
    (updater: (prev: LocalStorePayload) => LocalStorePayload) => {
      const next = updater(localStoreRef.current);
      persistLocalMirror(next);
      if (rtdb && !(user && cloudArena)) {
        const targetId = joinedArenaId || next.arena.id || 'gelanggang-a';
        const backupRecord = saveRtdbLocalBackup(targetId, next, true);
        if (isBrowserOnline() && rtdbConnected) {
          set(ref(rtdb, `silat_arenas/${targetId}`), sanitizeForRtdb(next))
            .then(() => {
              markRtdbBackupSynced(targetId, backupRecord.lastUpdatedAtMs);
              setSyncError(null);
            })
            .catch((err) => {
              if (!isOfflineNetworkError(err)) {
                setSyncError(`Gagal menulis ke Firebase RTDB: ${err?.message || 'Unknown error'}`);
              }
            });
        }
      }
    },
    [persistLocalMirror, user, cloudArena, joinedArenaId, rtdbConnected, setSyncError]
  );

  type QueuedOpInput = Omit<PendingFirestoreOp, 'id' | 'createdAtMs'>;

  const executeFirestoreWithFallback = useCallback(
    async (
      arenaId: string,
      ops: QueuedOpInput[],
      localUpdater: (prev: LocalStorePayload) => LocalStorePayload
    ): Promise<LocalStorePayload> => {
      const nextLocal = commitLocalBackupOnly(localUpdater);
      if (ops.length === 0) return nextLocal;

      const queueRemaining = (startIndex: number) => {
        let updatedOps: PendingFirestoreOp[] = [];
        for (let i = startIndex; i < ops.length; i += 1) {
          updatedOps = enqueueFirestoreOp(arenaId, ops[i], nextLocal);
        }
        setPendingOpsCount(updatedOps.length);
      };

      if (!isBrowserOnline() || getPendingFirestoreOps(arenaId).length > 0) {
        queueRemaining(0);
        return nextLocal;
      }

      const buildPayload = (op: QueuedOpInput): Record<string, unknown> => {
        const payloadData: Record<string, unknown> = op.data ? { ...op.data } : {};
        if (op.timestampMode === 'create') {
          payloadData.createdAt = serverTimestamp();
          payloadData.updatedAt = serverTimestamp();
        } else if (op.timestampMode === 'update') {
          payloadData.updatedAt = serverTimestamp();
        } else if (op.timestampMode === 'createdAtOnly') {
          payloadData.createdAt = serverTimestamp();
        }
        return payloadData;
      };

      const canUseBulkBatch =
        ops.length > 5 && ops.every((o) => o.opType === 'set' || o.opType === 'delete');

      if (canUseBulkBatch) {
        const chunkSize = 400;
        for (let start = 0; start < ops.length; start += chunkSize) {
          const chunk = ops.slice(start, start + chunkSize);
          const batch = writeBatch(db);
          for (const op of chunk) {
            const docRef = doc(db, op.pathSegments.join('/'));
            if (op.opType === 'delete') {
              batch.delete(docRef);
            } else {
              batch.set(docRef, buildPayload(op));
            }
          }
          try {
            await batch.commit();
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              queueRemaining(start);
              return nextLocal;
            }
            if (isPermissionDeniedError(err) || !isOfflineNetworkError(err)) {
              const first = chunk[0];
              handleFirestoreError(
                err,
                first.opType === 'delete' ? OperationType.DELETE : OperationType.WRITE,
                first.pathSegments.join('/')
              );
            }
          }
        }
      } else {
        for (let i = 0; i < ops.length; i += 1) {
          const op = ops[i];
          const path = op.pathSegments.join('/');
          const docRef = doc(db, path);
          const payloadData = buildPayload(op);

          try {
            if (op.opType === 'delete') {
              await deleteDoc(docRef);
            } else if (op.opType === 'set') {
              await setDoc(docRef, payloadData);
            } else {
              await updateDoc(docRef, payloadData);
            }
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              queueRemaining(i);
              return nextLocal;
            }
            if (isPermissionDeniedError(err) || !isOfflineNetworkError(err)) {
              const opEnum =
                op.opType === 'delete'
                  ? OperationType.DELETE
                  : op.opType === 'set'
                  ? OperationType.CREATE
                  : OperationType.UPDATE;
              handleFirestoreError(err, opEnum, path);
            }
          }
        }
      }

      if (getPendingFirestoreOps(arenaId).length === 0) {
        saveFirestoreSnapshotBackup(arenaId, clonePayload(nextLocal));
        setPendingOpsCount(0);
      }

      return nextLocal;
    },
    [commitLocalBackupOnly]
  );

  const useLocalFallbackForFirebase =
    mode === 'firebase' && (!isOnline || pendingOpsCount > 0 || !cloudArena);

  const arena =
    mode === 'firebase' && !useLocalFallbackForFirebase && cloudArena
      ? cloudArena
      : localStore.arena;
  const matches =
    mode === 'firebase' && !useLocalFallbackForFirebase && cloudMatches.length > 0
      ? cloudMatches
      : localStore.matches;
  const activeMatch = useMemo(() => {
    return matches.find((m) => m.id === arena.activeMatchId) || matches[0];
  }, [matches, arena.activeMatchId]);

  const events = useMemo(() => {
    if (mode === 'firebase' && !useLocalFallbackForFirebase) return cloudEvents;
    return localStore.eventsByMatch[activeMatch.id] || [];
  }, [mode, useLocalFallbackForFirebase, cloudEvents, localStore.eventsByMatch, activeMatch.id]);

  const getMatchEvents = useCallback(
    (matchId: string): MatchEvent[] => {
      if (mode === 'firebase' && !useLocalFallbackForFirebase) {
        return matchId === activeMatch.id ? cloudEvents : localStore.eventsByMatch[matchId] || [];
      }
      return localStore.eventsByMatch[matchId] || [];
    },
    [mode, useLocalFallbackForFirebase, activeMatch.id, cloudEvents, localStore.eventsByMatch]
  );

  const athletes = useMemo(() => {
    if (mode === 'firebase' && !useLocalFallbackForFirebase) return cloudAthletes;
    return localStore.athletes || [];
  }, [mode, useLocalFallbackForFirebase, cloudAthletes, localStore.athletes]);

  const brackets = useMemo(() => {
    if (mode === 'firebase' && !useLocalFallbackForFirebase) return cloudBrackets;
    return localStore.brackets || [];
  }, [mode, useLocalFallbackForFirebase, cloudBrackets, localStore.brackets]);

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

        const totalRounds = activeMatch.totalRounds ?? 3;
        if (
          !isJurusMatch(activeMatch) &&
          activeMatch.status === 'active' &&
          activeMatch.currentRound >= totalRounds &&
          autoFinishedMatchRef.current !== `${activeMatch.id}-r${activeMatch.currentRound}`
        ) {
          autoFinishedMatchRef.current = `${activeMatch.id}-r${activeMatch.currentRound}`;
          void autoAdjudicateRef.current();
        }
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
      const newEvent: MatchEvent = {
        id: eventId,
        arenaId: arena.id,
        matchId,
        ownerId: cloudArena?.ownerId || arena.ownerId,
        ...evInput,
        createdAtMs: Date.now(),
      };
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        eventsByMatch: {
          ...prev.eventsByMatch,
          [matchId]: [newEvent, ...(prev.eventsByMatch[matchId] || [])].slice(0, 100),
        },
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'matches', matchId, 'events', eventId],
              data: {
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
              },
              timestampMode: 'createdAtOnly',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [mode, cloudArena, arena.id, arena.ownerId, commitLocalStore, executeFirestoreWithFallback]
  );

  const updateArenaMeta = useCallback(
    async (meta: UpdateArenaMetaInput) => {
      const safeName = clampStr(meta.name || arena.name || 'Gelanggang A', 80, 'Gelanggang A');
      const safeTournament = clampStr(meta.tournamentName, 120, 'Kejuaraan Pencak Silat IPSI 2026');
      const safeVenue = meta.venue.trim().slice(0, 120);
      const safeEventDate = meta.eventDate.trim().slice(0, 80);
      const safeLogoLeft = meta.logoLeft.trim().slice(0, 250000);
      const safeLogoRight = meta.logoRight.trim().slice(0, 250000);

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        arena: {
          ...prev.arena,
          name: safeName,
          tournamentName: safeTournament,
          venue: safeVenue,
          eventDate: safeEventDate,
          logoLeft: safeLogoLeft,
          logoRight: safeLogoRight,
        },
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id],
              data: {
                name: safeName,
                tournamentName: safeTournament,
                venue: safeVenue,
                eventDate: safeEventDate,
                logoLeft: safeLogoLeft,
                logoRight: safeLogoRight,
              },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [arena.name, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
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
      const isJurus =
        input.competitionCategory === 'Jurus' ||
        Boolean(input.jurusType) ||
        isJurusMatch({ weightClass: input.weightClass });
      const resolvedJurusType = isJurus
        ? input.jurusType || normalizeJurusType(input.weightClass)
        : undefined;
      const defaultDuration = isJurus ? JURUS_DEFAULT_DURATION_SEC : 120;
      const roundSec = Math.min(
        300,
        Math.max(30, Math.round(input.roundDurationSec || defaultDuration))
      );
      const resolvedTotalRounds: 1 | 2 | 3 = isJurus
        ? 1
        : input.totalRounds === 2
        ? 2
        : 3;

      const newMatch: MatchData = {
        id: matchId,
        arenaId: arena.id,
        ownerId: user?.uid || arena.ownerId,
        matchNumber: clampStr(input.matchNumber, 32, 'Partai Baru'),
        weightClass: clampStr(
          input.weightClass,
          80,
          resolvedJurusType || 'Kelas Bebas'
        ),
        stage: clampStr(input.stage, 40, 'Penyisihan'),
        competitionCategory: isJurus ? 'Jurus' : 'Tanding',
        ...(isJurus
          ? {
              jurusType: resolvedJurusType,
              activePerformerCorner: 'blue' as Corner,
              jurusState: createInitialJurusState(),
            }
          : {}),
        blueName: clampStr(input.blueName, 80, 'Pesilat Biru'),
        blueContingent: clampStr(input.blueContingent, 80, 'Kontingen Biru'),
        redName: clampStr(input.redName, 80, 'Pesilat Merah'),
        redContingent: clampStr(input.redContingent, 80, 'Kontingen Merah'),
        roundDurationSec: roundSec,
        currentRound: 1,
        totalRounds: resolvedTotalRounds,
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

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        arena:
          input.setAsActive !== false
            ? { ...prev.arena, activeMatchId: matchId }
            : prev.arena,
        matches: [...prev.matches, newMatch],
        eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
      });

      if (mode === 'firebase' && cloudArena && user) {
        const ops: QueuedOpInput[] = [
          {
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
            data: { ...newMatch },
            timestampMode: 'create',
          },
        ];
        if (input.setAsActive !== false) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id],
            data: { activeMatchId: matchId },
            timestampMode: 'update',
          });
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [arena.id, arena.ownerId, mode, cloudArena, user, commitLocalStore, executeFirestoreWithFallback]
  );

  const updateMatchMeta = useCallback(
    async (matchId: string, input: Partial<CreateMatchInput>) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target) return;
      const nextCompCategory: CompetitionCategory =
        input.competitionCategory ??
        (input.jurusType ? 'Jurus' : target.competitionCategory || (isJurusMatch(target) ? 'Jurus' : 'Tanding'));
      const isJurus = nextCompCategory === 'Jurus';
      const roundSec = input.roundDurationSec
        ? Math.min(300, Math.max(30, Math.round(input.roundDurationSec)))
        : target.roundDurationSec;

      const patch: Partial<MatchData> = {
        matchNumber: input.matchNumber ? clampStr(input.matchNumber, 32) : target.matchNumber,
        weightClass: input.weightClass ? clampStr(input.weightClass, 80) : target.weightClass,
        stage: input.stage ? clampStr(input.stage, 40) : target.stage,
        competitionCategory: nextCompCategory,
        blueName: input.blueName ? clampStr(input.blueName, 80) : target.blueName,
        blueContingent: input.blueContingent ? clampStr(input.blueContingent, 80) : target.blueContingent,
        redName: input.redName ? clampStr(input.redName, 80) : target.redName,
        redContingent: input.redContingent ? clampStr(input.redContingent, 80) : target.redContingent,
        roundDurationSec: roundSec,
        totalRounds: isJurus ? 1 : input.totalRounds ?? target.totalRounds ?? 3,
        timerRemainingMs:
          target.status === 'waiting' ? roundSec * 1000 : target.timerRemainingMs,
      };

      if (isJurus) {
        patch.jurusType = input.jurusType || target.jurusType || normalizeJurusType(patch.weightClass);
        patch.activePerformerCorner = target.activePerformerCorner || 'blue';
        patch.jurusState = target.jurusState || createInitialJurusState();
      }

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m)),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
              data: { ...patch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [matches, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const setActiveMatch = useCallback(
    async (matchId: string) => {
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        arena: { ...prev.arena, activeMatchId: matchId },
      });
      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id],
              data: { activeMatchId: matchId },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const setMatchTotalRounds = useCallback(
    async (matchId: string, totalRounds: 2 | 3) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target || target.status === 'finished') return;
      const safeCurrentRound = Math.min(totalRounds, Math.max(1, target.currentRound));
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId ? { ...m, totalRounds, currentRound: safeCurrentRound } : m
        ),
      });
      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
              data: { totalRounds, currentRound: safeCurrentRound },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [matches, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const applyLotingMatchAssignments = useCallback(
    async (
      updates: Array<{
        matchId: string;
        blueName: string;
        blueContingent: string;
        redName: string;
        redContingent: string;
      }>
    ): Promise<number> => {
      if (updates.length === 0) return 0;
      const normalizedMap = new Map<
        string,
        { blueName: string; blueContingent: string; redName: string; redContingent: string }
      >();

      for (const u of updates) {
        const existing = matches.find((m) => m.id === u.matchId);
        if (!existing || existing.status === 'finished') continue;
        const nextBlueName = clampStr(u.blueName, 80, existing.blueName);
        const nextBlueCont = clampStr(u.blueContingent, 80, existing.blueContingent);
        const nextRedName = clampStr(u.redName, 80, existing.redName);
        const nextRedCont = clampStr(u.redContingent, 80, existing.redContingent);
        if (
          nextBlueName !== existing.blueName ||
          nextBlueCont !== existing.blueContingent ||
          nextRedName !== existing.redName ||
          nextRedCont !== existing.redContingent
        ) {
          normalizedMap.set(u.matchId, {
            blueName: nextBlueName,
            blueContingent: nextBlueCont,
            redName: nextRedName,
            redContingent: nextRedCont,
          });
        }
      }

      if (normalizedMap.size === 0) return 0;

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => {
          const patch = normalizedMap.get(m.id);
          return patch ? { ...m, ...patch } : m;
        }),
        brackets: (prev.brackets || []).map((b) => {
          if (!b.matchId || b.winnerSide) return b;
          const patch = normalizedMap.get(b.matchId);
          return patch ? { ...b, ...patch } : b;
        }),
      });

      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = [];
        for (const [matchId, patch] of normalizedMap.entries()) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
            data: { ...patch },
            timestampMode: 'update',
          });
        }
        for (const slot of brackets) {
          if (!slot.matchId || slot.winnerSide) continue;
          const patch = normalizedMap.get(slot.matchId);
          if (patch) {
            ops.push({
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
              data: { ...patch },
              timestampMode: 'update',
            });
          }
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }

      return normalizedMap.size;
    },
    [matches, brackets, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const deleteMatch = useCallback(
    async (matchId: string) => {
      if (matches.length <= 1) return;
      const fallback = matches.find((m) => m.id !== matchId) || matches[0];
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => {
        const remaining = prev.matches.filter((m) => m.id !== matchId);
        return {
          ...prev,
          arena:
            prev.arena.activeMatchId === matchId
              ? { ...prev.arena, activeMatchId: remaining[0]?.id || fallback.id }
              : prev.arena,
          matches: remaining.length > 0 ? remaining : prev.matches,
        };
      };
      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = [];
        if (arena.activeMatchId === matchId) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id],
            data: { activeMatchId: fallback.id },
            timestampMode: 'update',
          });
        }
        ops.push({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
          timestampMode: 'none',
        });
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [matches, mode, cloudArena, arena.activeMatchId, commitLocalStore, executeFirestoreWithFallback]
  );

  const resetMatch = useCallback(
    async (matchId: string) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target) return;
      const resetPatch: Partial<MatchData> = {
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
        finishedAtMs: 0,
        ...(isJurusMatch(target)
          ? {
              activePerformerCorner: 'blue' as Corner,
              jurusState: createInitialJurusState(),
            }
          : {}),
      };
      gongFiredForRoundRef.current = null;
      autoFinishedMatchRef.current = null;

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...resetPatch } : m)),
        eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
              data: { ...resetPatch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [matches, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
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

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { ...patch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }

      await recordEvent(activeMatch.id, {
        actorRole: `Juri ${judgeId}`,
        corner,
        type: 'judge_press',
        pointsDelta: 0,
        round: activeMatch.currentRound,
        matchTimeFormatted: formatMatchTime(getRemainingTimerMs(activeMatch, nowMs)),
        description: points === 1 ? 'P' : 'T',
        undone: false,
      });

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
    [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback, recordEvent]
  );

  const clearJudgeVote = useCallback(
    async (judgeId: JudgeId) => {
      if (activeMatch.status === 'finished') return;
      const voteKey = judgeId === 1 ? 'judge1Vote' : judgeId === 2 ? 'judge2Vote' : 'judge3Vote';
      const emptyVote = { corner: 'none' as const, points: 0, timestampMs: 0, round: activeMatch.currentRound };
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === activeMatch.id ? { ...m, [voteKey]: emptyVote } : m
        ),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { [voteKey]: emptyVote },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const triggerDewanAction = useCallback(
    async (action: DewanActionType, corner: Corner) => {
      if (activeMatch.status === 'finished') return;
      const result = applyDewanAction(activeMatch, action, corner);
      const timeStr = formatMatchTime(getRemainingTimerMs(activeMatch, Date.now()));

      if (result.autoDisqualified) {
        playArenaGong();
      }

      const finalPatch: Partial<MatchData> = result.autoDisqualified
        ? { ...result.patch, finishedAtMs: Date.now() }
        : result.patch;

      const buildUpdatedPayload = (prev: LocalStorePayload): LocalStorePayload => {
        const updatedMatchObj = { ...activeMatch, ...finalPatch };
        const updatedMatchesBase = prev.matches.map((m) =>
          m.id === activeMatch.id ? { ...m, ...finalPatch } : m
        );
        if (result.autoDisqualified && (result.patch.winner === 'blue' || result.patch.winner === 'red')) {
          const syncRes = syncBracketOnWinner(
            prev.brackets || [],
            updatedMatchesBase,
            updatedMatchObj,
            result.patch.winner,
            prev.arena.id,
            user?.uid || prev.arena.ownerId
          );
          let finalMatches = updatedMatchesBase;
          if (syncRes.createdMatch) {
            finalMatches = [...finalMatches, syncRes.createdMatch];
          } else if (syncRes.updatedExistingMatch) {
            finalMatches = finalMatches.map((m) =>
              m.id === syncRes.updatedExistingMatch!.id
                ? { ...m, ...syncRes.updatedExistingMatch!.patch }
                : m
            );
          }
          return {
            ...prev,
            matches: finalMatches,
            brackets: syncRes.nextBrackets,
            eventsByMatch: syncRes.createdMatch
              ? { ...prev.eventsByMatch, [syncRes.createdMatch.id]: [] }
              : prev.eventsByMatch,
          };
        }
        return {
          ...prev,
          matches: updatedMatchesBase,
        };
      };

      if (Object.keys(finalPatch).length > 0) {
        if (mode === 'firebase' && cloudArena) {
          const ops: QueuedOpInput[] = [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { ...finalPatch },
              timestampMode: 'update',
            },
          ];
          if (result.autoDisqualified && (result.patch.winner === 'blue' || result.patch.winner === 'red')) {
            const syncRes = syncBracketOnWinner(
              brackets,
              matches,
              { ...activeMatch, ...finalPatch },
              result.patch.winner,
              cloudArena.id,
              user?.uid || cloudArena.ownerId
            );
            for (const uSlot of syncRes.updatedSlots) {
              ops.push({
                opType: 'update',
                pathSegments: ['arenas', cloudArena.id, 'brackets', uSlot.id],
                data: {
                  winnerSide: uSlot.winnerSide || '',
                  winnerName: uSlot.winnerName || '',
                  winnerContingent: uSlot.winnerContingent || '',
                  blueName: uSlot.blueName,
                  blueContingent: uSlot.blueContingent,
                  redName: uSlot.redName,
                  redContingent: uSlot.redContingent,
                  matchId: uSlot.matchId || '',
                },
                timestampMode: 'update',
              });
            }
            if (syncRes.createdMatch) {
              ops.push({
                opType: 'set',
                pathSegments: ['arenas', cloudArena.id, 'matches', syncRes.createdMatch.id],
                data: { ...syncRes.createdMatch },
                timestampMode: 'create',
              });
            } else if (syncRes.updatedExistingMatch) {
              ops.push({
                opType: 'update',
                pathSegments: ['arenas', cloudArena.id, 'matches', syncRes.updatedExistingMatch.id],
                data: { ...syncRes.updatedExistingMatch.patch },
                timestampMode: 'update',
              });
            }
          }
          await executeFirestoreWithFallback(cloudArena.id, ops, buildUpdatedPayload);
        } else {
          commitLocalStore(buildUpdatedPayload);
        }
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
    [activeMatch, brackets, matches, mode, cloudArena, user, commitLocalStore, executeFirestoreWithFallback, recordEvent]
  );

  const submitVerification = useCallback(
    async (
      kind: 'jatuhan' | 'pelanggaran',
      corner: Corner | 'neutral',
      outcome: 'sah' | 'tidak_sah',
      description: string,
      applyFallPoint = false
    ) => {
      if (activeMatch.status === 'finished') return;
      const timeStr = formatMatchTime(getRemainingTimerMs(activeMatch, Date.now()));
      await recordEvent(activeMatch.id, {
        actorRole: 'Verifikasi Dewan',
        corner,
        type: `verifikasi_${kind}`,
        pointsDelta: 0,
        round: activeMatch.currentRound,
        matchTimeFormatted: timeStr,
        description,
        undone: false,
      });

      if (kind === 'jatuhan' && outcome === 'sah' && applyFallPoint && (corner === 'blue' || corner === 'red')) {
        await triggerDewanAction('fall', corner);
      }
    },
    [activeMatch, recordEvent, triggerDewanAction]
  );

  const startVerification = useCallback(
    async (kind: VerificationKind) => {
      if (activeMatch.status === 'finished') return;
      const nextVerification = createVerificationState(kind, true, Date.now());
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === activeMatch.id ? { ...m, verification: nextVerification } : m
        ),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { verification: nextVerification },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch.id, activeMatch.status, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const castVerificationVote = useCallback(
    async (judgeId: JudgeId, choice: VerificationVoteChoice) => {
      if (activeMatch.status === 'finished' || !activeMatch.verification?.active) return;
      const voteKey: 'j1Vote' | 'j2Vote' | 'j3Vote' =
        judgeId === 1 ? 'j1Vote' : judgeId === 2 ? 'j2Vote' : 'j3Vote';

      const nextBase = {
        ...activeMatch.verification,
        [voteKey]: choice,
      };
      if (evaluateVerificationConsensus(nextBase).hasConsensus) {
        playConsensusChime();
      }

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.id !== activeMatch.id || !m.verification?.active) return m;
          return {
            ...m,
            verification: {
              ...m.verification,
              [voteKey]: choice,
            },
          };
        }),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { [`verification.${voteKey}`]: choice },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch.id, activeMatch.status, activeMatch.verification, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const cancelVerification = useCallback(async () => {
    const current = activeMatch.verification;
    if (!current) return;
    const closedVerification = createVerificationState(current.kind, false, current.requestedAtMs || 0);
    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) =>
        m.id === activeMatch.id ? { ...m, verification: closedVerification } : m
      ),
    });

    if (mode === 'firebase' && cloudArena) {
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { verification: closedVerification },
            timestampMode: 'update',
          },
        ],
        localUpdater
      );
    } else {
      commitLocalStore(localUpdater);
    }
  }, [activeMatch.id, activeMatch.verification, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const resolveVerification = useCallback(async () => {
    const current = activeMatch.verification;
    if (!current || !current.active || activeMatch.status === 'finished') return;

    const summary = evaluateVerificationConsensus(current);
    if (!summary.canProcess) return;

    const formatVoteShort = (v: VerificationVoteValue) =>
      v === 'blue' ? 'Biru' : v === 'red' ? 'Merah' : v === 'invalid' ? 'Tidak Sah' : '-';
    const jurySummary = `J1:${formatVoteShort(current.j1Vote)} J2:${formatVoteShort(current.j2Vote)} J3:${formatVoteShort(current.j3Vote)}`;
    const kindLabel = current.kind === 'jatuhan' ? 'Jatuhan' : 'Pelanggaran';

    const closedVerification = createVerificationState(current.kind, false, current.requestedAtMs || 0);
    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) =>
        m.id === activeMatch.id ? { ...m, verification: closedVerification } : m
      ),
    });

    if (mode === 'firebase' && cloudArena) {
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { verification: closedVerification },
            timestampMode: 'update',
          },
        ],
        localUpdater
      );
    } else {
      commitLocalStore(localUpdater);
    }

    if (summary.consensus === 'blue' || summary.consensus === 'red') {
      const winnerCorner: Corner = summary.consensus;
      const cornerLabel =
        winnerCorner === 'blue'
          ? `Sudut Biru (${activeMatch.blueName})`
          : `Sudut Merah (${activeMatch.redName})`;
      const description = `Verifikasi ${kindLabel}: SAH · ${cornerLabel} [${jurySummary}]`;
      await submitVerification(
        current.kind,
        winnerCorner,
        'sah',
        description,
        false
      );
    } else {
      const description = `Verifikasi ${kindLabel}: TIDAK SAH [${jurySummary}]`;
      await submitVerification(current.kind, 'neutral', 'tidak_sah', description, false);
    }
  }, [
    activeMatch.id,
    activeMatch.status,
    activeMatch.verification,
    activeMatch.blueName,
    activeMatch.redName,
    mode,
    cloudArena,
    commitLocalStore,
    executeFirestoreWithFallback,
    submitVerification,
  ]);

  const undoLastEvent = useCallback(async () => {
    const lastActive = events.find(
      (e) => !e.undone && e.type !== 'judge_press' && !e.type.startsWith('jurus_')
    );
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
        case 'cancel_fall':
          if (lastActive.pointsDelta !== 0) {
            patch[isBlue ? 'blueFalls' : 'redFalls'] = activeMatch[isBlue ? 'blueFalls' : 'redFalls'] + 1;
          }
          break;
        case 'binaan':
        case 'binaan1':
        case 'binaan2':
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

    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      eventsByMatch: {
        ...prev.eventsByMatch,
        [activeMatch.id]: (prev.eventsByMatch[activeMatch.id] || []).map((e) =>
          e.id === lastActive.id ? { ...e, undone: true } : e
        ),
      },
    });

    if (mode === 'firebase' && cloudArena) {
      const ops: QueuedOpInput[] = [];
      if (Object.keys(patch).length > 0) {
        ops.push({
          opType: 'update',
          pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
          data: { ...patch },
          timestampMode: 'update',
        });
      }
      ops.push({
        opType: 'update',
        pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id, 'events', lastActive.id],
        data: { undone: true },
        timestampMode: 'none',
      });
      await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
    } else {
      commitLocalStore(localUpdater);
    }
  }, [events, activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const declareWinner = useCallback(
    async (winner: Corner | 'draw', winMethod: string) => {
      if (activeMatch.status === 'finished' && activeMatch.winner !== 'draw') {
        return;
      }
      const remaining = getRemainingTimerMs(activeMatch, Date.now());
      const patch: Partial<MatchData> = {
        status: 'finished',
        timerRemainingMs: remaining,
        timerStartedAtMs: 0,
        winner,
        winMethod: clampStr(winMethod, 64, 'Menang Angka'),
        finishedAtMs: Date.now(),
      };
      playArenaGong();

      const buildWinnerPayload = (prev: LocalStorePayload): LocalStorePayload => {
        const currentTarget = prev.matches.find((m) => m.id === activeMatch.id);
        if (!currentTarget || (currentTarget.status === 'finished' && currentTarget.winner !== 'draw')) {
          return prev;
        }
        const updatedMatchObj = { ...currentTarget, ...patch };
        const updatedMatchesBase = prev.matches.map((m) =>
          m.id === activeMatch.id ? updatedMatchObj : m
        );
        if (winner === 'blue' || winner === 'red') {
          const syncRes = syncBracketOnWinner(
            prev.brackets || [],
            updatedMatchesBase,
            updatedMatchObj,
            winner,
            prev.arena.id,
            user?.uid || prev.arena.ownerId
          );
          let finalMatches = updatedMatchesBase;
          if (syncRes.createdMatch) {
            finalMatches = [...finalMatches, syncRes.createdMatch];
          } else if (syncRes.updatedExistingMatch) {
            finalMatches = finalMatches.map((m) =>
              m.id === syncRes.updatedExistingMatch!.id
                ? { ...m, ...syncRes.updatedExistingMatch!.patch }
                : m
            );
          }
          return {
            ...prev,
            matches: finalMatches,
            brackets: syncRes.nextBrackets,
            eventsByMatch: syncRes.createdMatch
              ? { ...prev.eventsByMatch, [syncRes.createdMatch.id]: [] }
              : prev.eventsByMatch,
          };
        }
        return {
          ...prev,
          matches: updatedMatchesBase,
        };
      };

      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { ...patch },
            timestampMode: 'update',
          },
        ];
        if (winner === 'blue' || winner === 'red') {
          const syncRes = syncBracketOnWinner(
            brackets,
            matches,
            { ...activeMatch, ...patch },
            winner,
            cloudArena.id,
            user?.uid || cloudArena.ownerId
          );
          for (const uSlot of syncRes.updatedSlots) {
            ops.push({
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'brackets', uSlot.id],
              data: {
                winnerSide: uSlot.winnerSide || '',
                winnerName: uSlot.winnerName || '',
                winnerContingent: uSlot.winnerContingent || '',
                blueName: uSlot.blueName,
                blueContingent: uSlot.blueContingent,
                redName: uSlot.redName,
                redContingent: uSlot.redContingent,
                matchId: uSlot.matchId || '',
              },
              timestampMode: 'update',
            });
          }
          if (syncRes.createdMatch) {
            ops.push({
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'matches', syncRes.createdMatch.id],
              data: { ...syncRes.createdMatch },
              timestampMode: 'create',
            });
          } else if (syncRes.updatedExistingMatch) {
            ops.push({
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', syncRes.updatedExistingMatch.id],
              data: { ...syncRes.updatedExistingMatch.patch },
              timestampMode: 'update',
            });
          }
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, buildWinnerPayload);
      } else {
        let skipped = false;
        commitLocalStore((prev) => {
          const currentTarget = prev.matches.find((m) => m.id === activeMatch.id);
          if (!currentTarget || (currentTarget.status === 'finished' && currentTarget.winner !== 'draw')) {
            skipped = true;
            return prev;
          }
          return buildWinnerPayload(prev);
        });
        if (skipped) return;
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
    [activeMatch, brackets, matches, mode, cloudArena, user, commitLocalStore, executeFirestoreWithFallback, recordEvent]
  );

  const autoAdjudicateWinner = useCallback(async () => {
    const decision = determineOfficialWinner(activeMatch);
    await declareWinner(decision.winner, decision.winMethod);
  }, [activeMatch, declareWinner]);

  useEffect(() => {
    autoAdjudicateRef.current = autoAdjudicateWinner;
  }, [autoAdjudicateWinner]);

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

    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
    });

    if (mode === 'firebase' && cloudArena) {
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { ...patch },
            timestampMode: 'update',
          },
        ],
        localUpdater
      );
    } else {
      commitLocalStore(localUpdater);
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const pauseTimer = useCallback(async () => {
    if (activeMatch.status !== 'active' && activeMatch.status !== 'break') return;
    const nowMs = Date.now();
    const rem = getRemainingTimerMs(activeMatch, nowMs);
    const patch: Partial<MatchData> = {
      status: 'paused',
      timerRemainingMs: rem,
      timerStartedAtMs: 0,
    };

    if (isJurusMatch(activeMatch) && activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0) {
      const segMs = Math.max(0, nowMs - activeMatch.timerStartedAtMs);
      const performer: Corner = activeMatch.activePerformerCorner || 'blue';
      const jState = ensureJurusState(activeMatch);
      const nextState: JurusMatchState = {
        ...jState,
        [performer]: {
          ...jState[performer],
          recordedElapsedMs: Math.min(600000, jState[performer].recordedElapsedMs + segMs),
        },
      };
      const jurusType = getJurusType(activeMatch);
      const summary = computeCornerJurusSummary(jurusType, nextState[performer]);
      patch.jurusState = nextState;
      if (performer === 'blue') {
        patch.blueScore = summary.finalScore;
      } else {
        patch.redScore = summary.finalScore;
      }
    }

    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
    });

    if (mode === 'firebase' && cloudArena) {
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { ...patch },
            timestampMode: 'update',
          },
        ],
        localUpdater
      );
    } else {
      commitLocalStore(localUpdater);
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const resetTimer = useCallback(async () => {
    if (activeMatch.status === 'finished') return;
    const patch: Partial<MatchData> = {
      status: 'waiting',
      timerRemainingMs: activeMatch.roundDurationSec * 1000,
      timerStartedAtMs: 0,
    };
    if (isJurusMatch(activeMatch)) {
      const performer: Corner = activeMatch.activePerformerCorner || 'blue';
      const jState = ensureJurusState(activeMatch);
      patch.jurusState = {
        ...jState,
        [performer]: {
          ...jState[performer],
          recordedElapsedMs: 0,
        },
      };
    }
    gongFiredForRoundRef.current = null;

    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
    });

    if (mode === 'firebase' && cloudArena) {
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
            data: { ...patch },
            timestampMode: 'update',
          },
        ],
        localUpdater
      );
    } else {
      commitLocalStore(localUpdater);
    }
  }, [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const setRound = useCallback(
    async (round: number) => {
      if (activeMatch.status === 'finished') return;
      const maxRounds = activeMatch.totalRounds ?? 3;
      const safeRound = Math.min(maxRounds, Math.max(1, round));
      const patch: Partial<MatchData> = {
        currentRound: safeRound,
        status: 'waiting',
        timerRemainingMs: activeMatch.roundDurationSec * 1000,
        timerStartedAtMs: 0,
      };
      gongFiredForRoundRef.current = null;
      autoFinishedMatchRef.current = null;

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { ...patch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
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

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { ...patch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  // --- Jurus TGRS Real-Time Scoring & Timer Actions ---
  const commitJurusPatch = useCallback(
    async (patch: Partial<MatchData>) => {
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m)),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id],
              data: { ...patch },
              timestampMode: 'update',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [activeMatch.id, mode, cloudArena, executeFirestoreWithFallback, commitLocalStore]
  );

  const setActivePerformerCorner = useCallback(
    async (corner: Corner) => {
      if (activeMatch.status === 'finished') return;
      const jState = ensureJurusState(activeMatch);
      const jurusType = getJurusType(activeMatch);
      const summary = computeCornerJurusSummary(jurusType, jState[corner]);
      const patch: Partial<MatchData> = {
        activePerformerCorner: corner,
        jurusState: jState,
        ...(corner === 'blue'
          ? { blueScore: summary.finalScore }
          : { redScore: summary.finalScore }),
      };
      await commitJurusPatch(patch);
    },
    [activeMatch, commitJurusPatch]
  );

  const updateJudgeCornerScore = useCallback(
    async (
      judgeId: JudgeId,
      corner: Corner,
      mutator: (prevScore: JurusJudgeCornerScore) => JurusJudgeCornerScore,
      eventMeta?: { type: string; pointsDelta: number; description: string }
    ) => {
      if (activeMatch.status === 'finished') return;
      const jurusType = getJurusType(activeMatch);
      const jState = ensureJurusState(activeMatch);
      const judgeKey: keyof Pick<JurusCornerData, 'judge1' | 'judge2' | 'judge3'> =
        judgeId === 1 ? 'judge1' : judgeId === 2 ? 'judge2' : 'judge3';

      const nextJudgeScore = mutator(jState[corner][judgeKey]);
      const nextCornerData: JurusCornerData = {
        ...jState[corner],
        [judgeKey]: nextJudgeScore,
      };
      const nextState: JurusMatchState = {
        ...jState,
        [corner]: nextCornerData,
      };
      const summary = computeCornerJurusSummary(jurusType, nextCornerData);
      const patch: Partial<MatchData> = {
        jurusState: nextState,
        ...(corner === 'blue' ? { blueScore: summary.finalScore } : { redScore: summary.finalScore }),
      };
      await commitJurusPatch(patch);

      if (eventMeta) {
        await recordEvent(activeMatch.id, {
          actorRole: `Juri ${judgeId}`,
          corner,
          type: eventMeta.type,
          pointsDelta: eventMeta.pointsDelta,
          round: activeMatch.currentRound,
          matchTimeFormatted: formatMatchTime(getRemainingTimerMs(activeMatch, Date.now())),
          description: eventMeta.description,
          undone: false,
        });
      }
    },
    [activeMatch, commitJurusPatch, recordEvent]
  );

  const recordJurusWrongMove = useCallback(
    async (judgeId: JudgeId, corner: Corner, delta: 1 | -1) => {
      const cornerLabel = corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
      await updateJudgeCornerScore(
        judgeId,
        corner,
        (prev) => ({
          ...prev,
          wrongMoves: Math.min(200, Math.max(0, prev.wrongMoves + delta)),
        }),
        {
          type: 'jurus_wrong_move',
          pointsDelta: delta > 0 ? -1 : 1,
          description:
            delta > 0
              ? `Kesalahan Gerak (-0.01) ${cornerLabel} · Juri ${judgeId}`
              : `Batal Kesalahan Gerak (+0.01) ${cornerLabel} · Juri ${judgeId}`,
        }
      );
    },
    [updateJudgeCornerScore]
  );

  const setJurusStaminaScore = useCallback(
    async (judgeId: JudgeId, corner: Corner, valueHundredths: number) => {
      const clamped = Math.min(10, Math.max(0, Math.round(valueHundredths)));
      const cornerLabel = corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
      await updateJudgeCornerScore(
        judgeId,
        corner,
        (prev) => ({
          ...prev,
          staminaScore: clamped,
        }),
        {
          type: 'jurus_stamina',
          pointsDelta: clamped,
          description: `Kemantapan / Stamina (+${formatJurusScore(clamped)}) ${cornerLabel} · Juri ${judgeId}`,
        }
      );
    },
    [updateJudgeCornerScore]
  );

  const setJurusCreativeScore = useCallback(
    async (
      judgeId: JudgeId,
      corner: Corner,
      component: 'attackScore' | 'harmonyScore' | 'soulScore',
      valueHundredths: number
    ) => {
      const clamped = Math.min(30, Math.max(0, Math.round(valueHundredths)));
      await updateJudgeCornerScore(judgeId, corner, (prev) => ({
        ...prev,
        [component]: clamped,
      }));
    },
    [updateJudgeCornerScore]
  );

  const toggleJurusJudgeSubmit = useCallback(
    async (judgeId: JudgeId, corner: Corner) => {
      const jurusType = getJurusType(activeMatch);
      const jState = ensureJurusState(activeMatch);
      const judgeKey = judgeId === 1 ? 'judge1' : judgeId === 2 ? 'judge2' : 'judge3';
      const willSubmit = !jState[corner][judgeKey].submitted;
      const summaryAfter = computeCornerJurusSummary(jurusType, {
        ...jState[corner],
        [judgeKey]: { ...jState[corner][judgeKey], submitted: willSubmit },
      });
      const cornerLabel = corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
      const jIdx = judgeId - 1;
      await updateJudgeCornerScore(
        judgeId,
        corner,
        (prev) => ({
          ...prev,
          submitted: willSubmit,
        }),
        {
          type: 'jurus_judge_submit',
          pointsDelta: 0,
          description: willSubmit
            ? `Juri ${judgeId} Kunci Nilai ${cornerLabel}: ${formatJurusScore(summaryAfter.judgeTotals[jIdx])}`
            : `Juri ${judgeId} Buka Kunci Nilai ${cornerLabel}`,
        }
      );
    },
    [activeMatch, updateJudgeCornerScore]
  );

  const triggerJurusDewanPenalty = useCallback(
    async (corner: Corner, penaltyKey: JurusPenaltyType, delta: 1 | -1) => {
      if (activeMatch.status === 'finished') return;
      const jurusType = getJurusType(activeMatch);
      const jState = ensureJurusState(activeMatch);
      const prevCount = jState[corner].penalties[penaltyKey] || 0;
      const nextCount = Math.min(20, Math.max(0, prevCount + delta));
      if (nextCount === prevCount) return;

      const nextCornerData: JurusCornerData = {
        ...jState[corner],
        penalties: {
          ...jState[corner].penalties,
          [penaltyKey]: nextCount,
        },
      };
      const nextState: JurusMatchState = {
        ...jState,
        [corner]: nextCornerData,
      };
      const summary = computeCornerJurusSummary(jurusType, nextCornerData);
      const patch: Partial<MatchData> = {
        jurusState: nextState,
        ...(corner === 'blue' ? { blueScore: summary.finalScore } : { redScore: summary.finalScore }),
      };
      await commitJurusPatch(patch);

      const cornerLabel = corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
      const pLabel = JURUS_PENALTY_LABELS[penaltyKey];
      await recordEvent(activeMatch.id, {
        actorRole: 'Dewan Juri',
        corner,
        type: 'jurus_penalty',
        pointsDelta: delta > 0 ? -50 : 50,
        round: activeMatch.currentRound,
        matchTimeFormatted: formatMatchTime(getRemainingTimerMs(activeMatch, Date.now())),
        description:
          delta > 0
            ? `Potongan Dewan (-0.50) ${pLabel} — ${cornerLabel}`
            : `Batal Potongan (+0.50) ${pLabel} — ${cornerLabel}`,
        undone: false,
      });
    },
    [activeMatch, commitJurusPatch, recordEvent]
  );

  const recordJurusElapsedAndSwitch = useCallback(
    async (nextCorner?: Corner) => {
      if (activeMatch.status === 'finished') return;
      const nowMs = Date.now();
      const performer: Corner = activeMatch.activePerformerCorner || 'blue';
      const targetNext: Corner = nextCorner || (performer === 'blue' ? 'red' : 'blue');
      const jurusType = getJurusType(activeMatch);
      const jState = ensureJurusState(activeMatch);

      const runningSegMs =
        activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0
          ? Math.max(0, nowMs - activeMatch.timerStartedAtMs)
          : 0;
      const accumulatedMs = Math.min(600000, jState[performer].recordedElapsedMs + runningSegMs);

      const nextState: JurusMatchState = {
        ...jState,
        [performer]: {
          ...jState[performer],
          recordedElapsedMs: accumulatedMs,
          completed: true,
        },
      };
      const currentSummary = computeCornerJurusSummary(jurusType, nextState[performer]);
      const nextSummary = computeCornerJurusSummary(jurusType, nextState[targetNext]);

      const patch: Partial<MatchData> = {
        status: 'waiting',
        timerRemainingMs: activeMatch.roundDurationSec * 1000,
        timerStartedAtMs: 0,
        activePerformerCorner: targetNext,
        jurusState: nextState,
        blueScore: performer === 'blue' ? currentSummary.finalScore : nextSummary.finalScore,
        redScore: performer === 'red' ? currentSummary.finalScore : nextSummary.finalScore,
      };
      gongFiredForRoundRef.current = null;
      await commitJurusPatch(patch);

      const performerLabel = performer === 'blue' ? 'Sudut Biru' : 'Sudut Merah';
      await recordEvent(activeMatch.id, {
        actorRole: 'Timer',
        corner: performer,
        type: 'jurus_time_saved',
        pointsDelta: 0,
        round: activeMatch.currentRound,
        matchTimeFormatted: formatJurusElapsedMs(accumulatedMs),
        description: `Waktu Tampil ${performerLabel} tersimpan (${formatJurusElapsedMs(accumulatedMs)})`,
        undone: false,
      });
    },
    [activeMatch, commitJurusPatch, recordEvent]
  );

  const buildAthleteRecord = useCallback(
    (input: AddAthleteInput, idxSeed = 0): AthleteData => {
      const athleteId = sanitizeId(
        `ath-${Date.now().toString(36)}-${idxSeed}-${Math.random().toString(36).slice(2, 5)}`
      );
      const validAgeCategories: AthleteAgeCategory[] = [
        'Usia Dini 1',
        'Usia Dini 2',
        'Usia Dini',
        'Pra Remaja',
        'Remaja',
        'Dewasa',
        'Master',
      ];
      const validCompCategories: CompetitionCategory[] = ['Tanding', 'Jurus'];
      const validCourts: ArenaCourt[] = ['A', 'B', 'C', 'D'];
      return {
        id: athleteId,
        arenaId: arena.id,
        ownerId: user?.uid || arena.ownerId,
        name: clampStr(input.name, 80, 'Atlet Baru'),
        contingent: clampStr(input.contingent, 80, 'Kontingen'),
        weightClass: clampStr(input.weightClass, 80, 'Kelas Bebas'),
        gender: input.gender === 'Putri' ? 'Putri' : 'Putra',
        ageCategory: validAgeCategories.includes(input.ageCategory) ? input.ageCategory : 'Dewasa',
        competitionCategory: validCompCategories.includes(input.competitionCategory)
          ? input.competitionCategory
          : 'Tanding',
        gelanggang: validCourts.includes(input.gelanggang) ? input.gelanggang : 'A',
        createdAtMs: Date.now() + idxSeed,
      };
    },
    [arena.id, arena.ownerId, user]
  );

  const addAthlete = useCallback(
    async (input: AddAthleteInput) => {
      const newAthlete = buildAthleteRecord(input);
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        athletes: [...(prev.athletes || []), newAthlete],
      });

      if (mode === 'firebase' && cloudArena && user) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'athletes', newAthlete.id],
              timestampMode: 'createdAtOnly',
              data: {
                id: newAthlete.id,
                arenaId: cloudArena.id,
                ownerId: user.uid,
                name: newAthlete.name,
                contingent: newAthlete.contingent,
                weightClass: newAthlete.weightClass,
                gender: newAthlete.gender,
                ageCategory: newAthlete.ageCategory,
                competitionCategory: newAthlete.competitionCategory,
                gelanggang: newAthlete.gelanggang,
              },
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [buildAthleteRecord, mode, cloudArena, user, executeFirestoreWithFallback, commitLocalStore]
  );

  const importAthletes = useCallback(
    async (inputs: AddAthleteInput[]): Promise<number> => {
      if (inputs.length === 0) return 0;
      const records = inputs.map((item, idx) => buildAthleteRecord(item, idx));
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        athletes: [...(prev.athletes || []), ...records],
      });

      if (mode === 'firebase' && cloudArena && user) {
        const ops: QueuedOpInput[] = records.map((ath) => ({
          opType: 'set',
          pathSegments: ['arenas', cloudArena.id, 'athletes', ath.id],
          timestampMode: 'createdAtOnly',
          data: {
            id: ath.id,
            arenaId: cloudArena.id,
            ownerId: user.uid,
            name: ath.name,
            contingent: ath.contingent,
            weightClass: ath.weightClass,
            gender: ath.gender,
            ageCategory: ath.ageCategory,
            competitionCategory: ath.competitionCategory,
            gelanggang: ath.gelanggang,
          },
        }));
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
      return records.length;
    },
    [buildAthleteRecord, mode, cloudArena, user, executeFirestoreWithFallback, commitLocalStore]
  );

  const deleteAthlete = useCallback(
    async (athleteId: string) => {
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        athletes: (prev.athletes || []).filter((a) => a.id !== athleteId),
      });

      if (mode === 'firebase' && cloudArena) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'delete',
              pathSegments: ['arenas', cloudArena.id, 'athletes', athleteId],
              timestampMode: 'none',
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [mode, cloudArena, executeFirestoreWithFallback, commitLocalStore]
  );

  const clearAthletes = useCallback(async () => {
    const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
      ...prev,
      athletes: [],
    });

    if (mode === 'firebase' && cloudArena) {
      const ops: QueuedOpInput[] = athletes.map((ath) => ({
        opType: 'delete',
        pathSegments: ['arenas', cloudArena.id, 'athletes', ath.id],
        timestampMode: 'none',
      }));
      await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
    } else {
      commitLocalStore(localUpdater);
    }
  }, [athletes, mode, cloudArena, executeFirestoreWithFallback, commitLocalStore]);

  const clearBracket = useCallback(
    async (weightClass: string, gender: AthleteGender) => {
      const toRemove = brackets.filter((b) => b.weightClass === weightClass && b.gender === gender);
      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        brackets: (prev.brackets || []).filter(
          (b) => !(b.weightClass === weightClass && b.gender === gender)
        ),
      });

      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = toRemove.map((slot) => ({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
          timestampMode: 'none',
        }));
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [brackets, mode, cloudArena, executeFirestoreWithFallback, commitLocalStore]
  );

  const generateBracket = useCallback(
    async (
      input: GenerateBracketInput
    ): Promise<{ createdSlots: number; poolCount: number; error?: string }> => {
      const pool = athletes.filter((a) => {
        if (a.weightClass !== input.weightClass || a.gender !== input.gender) return false;
        if (input.competitionCategory && (a.competitionCategory || 'Tanding') !== input.competitionCategory) {
          return false;
        }
        if (
          input.ageCategory &&
          input.ageCategory !== 'Semua' &&
          (a.ageCategory || 'Dewasa') !== input.ageCategory
        ) {
          return false;
        }
        if (
          input.gelanggang &&
          input.gelanggang !== 'Semua' &&
          (a.gelanggang || 'A') !== input.gelanggang
        ) {
          return false;
        }
        return true;
      });

      if (pool.length < 2) {
        return {
          createdSlots: 0,
          poolCount: 0,
          error: 'Minimal 2 atlet terdaftar yang sesuai filter untuk membuat bagan bracket.',
        };
      }

      const idPrefix = sanitizeId(`br-${Date.now().toString(36)}`);
      const { slots: newSlots, poolCount } = buildTournamentBracketSlots(pool, {
        arenaId: arena.id,
        ownerId: user?.uid || arena.ownerId,
        weightClass: input.weightClass,
        gender: input.gender,
        bracketMode: input.bracketMode,
        poolSize: input.poolSize,
        ageCategory: input.ageCategory,
        competitionCategory: input.competitionCategory,
        gelanggang: input.gelanggang,
        idPrefix,
      });

      const bracketTotalRounds = resolveTotalRoundsForBracket(
        input.bracketMode,
        input.ageCategory,
        pool
      );
      const oldClearedMatchIds = new Set(
        brackets
          .filter((b) => b.weightClass === input.weightClass && b.gender === input.gender)
          .map((b) => b.matchId)
          .filter((id): id is string => Boolean(id))
      );

      await clearBracket(input.weightClass, input.gender);

      const remainingMatches = matches.filter((m) => {
        const hasEvents = (localStoreRef.current.eventsByMatch[m.id]?.length || 0) > 0;
        const isSeedUnused =
          m.id === 'partai-01' &&
          m.status === 'waiting' &&
          m.blueScore === 0 &&
          m.redScore === 0 &&
          !hasEvents;
        const isOldUnused =
          oldClearedMatchIds.has(m.id) &&
          m.status === 'waiting' &&
          m.blueScore === 0 &&
          m.redScore === 0 &&
          !hasEvents;
        return !isSeedUnused && !isOldUnused;
      });

      const toDeleteIds = matches
        .filter((m) => !remainingMatches.some((rm) => rm.id === m.id))
        .map((m) => m.id);

      const createdMatches: MatchData[] = [];
      const slotsWithMatches = newSlots.map((slot) => {
        if (isSlotReadyForMatch(slot) && !slot.winnerSide) {
          const m = buildMatchFromSlot(
            slot,
            getNextMatchNumber([...remainingMatches, ...createdMatches]),
            arena.id,
            user?.uid || arena.ownerId,
            bracketTotalRounds,
            String(createdMatches.length + 1)
          );
          createdMatches.push(m);
          return { ...slot, matchId: m.id };
        }
        return slot;
      });

      const nextMatchesAll = [...remainingMatches, ...createdMatches];
      const safeMatches = nextMatchesAll.length > 0 ? nextMatchesAll : matches;
      const keepActive = safeMatches.some((m) => m.id === arena.activeMatchId);
      const nextActiveMatchId = keepActive
        ? arena.activeMatchId
        : createdMatches[0]?.id || safeMatches[0]?.id || arena.activeMatchId;

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => {
        const nextEventsByMatch = { ...prev.eventsByMatch };
        for (const delId of toDeleteIds) {
          delete nextEventsByMatch[delId];
        }
        for (const m of createdMatches) {
          nextEventsByMatch[m.id] = [];
        }
        return {
          ...prev,
          arena: { ...prev.arena, activeMatchId: nextActiveMatchId },
          matches: safeMatches,
          eventsByMatch: nextEventsByMatch,
          brackets: [
            ...(prev.brackets || []).filter(
              (b) => !(b.weightClass === input.weightClass && b.gender === input.gender)
            ),
            ...slotsWithMatches,
          ],
        };
      };

      if (mode === 'firebase' && cloudArena && user) {
        const ops: QueuedOpInput[] = [];
        for (const delId of toDeleteIds) {
          ops.push({
            opType: 'delete',
            pathSegments: ['arenas', cloudArena.id, 'matches', delId],
            timestampMode: 'none',
          });
        }
        for (const m of createdMatches) {
          ops.push({
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'matches', m.id],
            timestampMode: 'create',
            data: { ...m },
          });
        }
        if (nextActiveMatchId !== cloudArena.activeMatchId && nextActiveMatchId) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id],
            timestampMode: 'update',
            data: { activeMatchId: nextActiveMatchId },
          });
        }
        for (const slot of slotsWithMatches) {
          ops.push({
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
            timestampMode: 'create',
            data: {
              ...slot,
              arenaId: cloudArena.id,
              ownerId: user.uid,
            },
          });
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }

      return { createdSlots: newSlots.length, poolCount };
    },
    [
      athletes,
      brackets,
      matches,
      arena.id,
      arena.ownerId,
      arena.activeMatchId,
      clearBracket,
      mode,
      cloudArena,
      user,
      executeFirestoreWithFallback,
      commitLocalStore,
    ]
  );

  const activateBracketMatch = useCallback(
    async (slotId: string) => {
      const slot = brackets.find((b) => b.id === slotId);
      if (!slot) return;
      if (!isSlotReadyForMatch(slot)) {
        return;
      }

      if (slot.matchId && matches.some((m) => m.id === slot.matchId)) {
        await setActiveMatch(slot.matchId);
        return;
      }

      const rounds = resolveTotalRoundsForBracket(
        slot.bracketMode || 'prestasi',
        slot.ageCategory
      );
      const newMatch = buildMatchFromSlot(
        slot,
        getNextMatchNumber(matches),
        arena.id,
        user?.uid || arena.ownerId,
        rounds,
        'act'
      );

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        arena: { ...prev.arena, activeMatchId: newMatch.id },
        matches: [...prev.matches, newMatch],
        eventsByMatch: { ...prev.eventsByMatch, [newMatch.id]: [] },
        brackets: (prev.brackets || []).map((b) =>
          b.id === slot.id ? { ...b, matchId: newMatch.id } : b
        ),
      });

      if (mode === 'firebase' && cloudArena && user) {
        await executeFirestoreWithFallback(
          cloudArena.id,
          [
            {
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'matches', newMatch.id],
              timestampMode: 'create',
              data: { ...newMatch },
            },
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id],
              timestampMode: 'update',
              data: { activeMatchId: newMatch.id },
            },
            {
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
              timestampMode: 'update',
              data: { matchId: newMatch.id },
            },
          ],
          localUpdater
        );
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [
      brackets,
      matches,
      arena.id,
      arena.ownerId,
      setActiveMatch,
      mode,
      cloudArena,
      user,
      executeFirestoreWithFallback,
      commitLocalStore,
    ]
  );

  const advanceBracketWinner = useCallback(
    async (slotId: string, winnerSide: Corner) => {
      const slot = brackets.find((b) => b.id === slotId);
      if (!slot) return;
      const wName = winnerSide === 'blue' ? slot.blueName : slot.redName;
      const wCont = winnerSide === 'blue' ? slot.blueContingent : slot.redContingent;
      if (!isRealAthleteName(wName)) return;

      const nextSlot = brackets.find(
        (b) =>
          b.weightClass === slot.weightClass &&
          b.gender === slot.gender &&
          (b.poolIndex ?? 0) === (slot.poolIndex ?? 0) &&
          b.roundIndex === slot.roundIndex + 1 &&
          b.slotIndex === Math.floor(slot.slotIndex / 2)
      );

      let updatedNext: BracketMatchSlot | null = null;
      let createdNextMatch: MatchData | null = null;
      let nextMatchId = '';

      if (nextSlot) {
        updatedNext =
          slot.slotIndex % 2 === 0
            ? { ...nextSlot, blueName: wName, blueContingent: wCont }
            : { ...nextSlot, redName: wName, redContingent: wCont };

        nextMatchId = updatedNext.matchId || '';
        if (isSlotReadyForMatch(updatedNext) && !nextMatchId) {
          const rounds = resolveTotalRoundsForBracket(
            updatedNext.bracketMode || 'prestasi',
            updatedNext.ageCategory
          );
          createdNextMatch = buildMatchFromSlot(
            updatedNext,
            getNextMatchNumber(matches),
            arena.id,
            user?.uid || arena.ownerId,
            rounds,
            'br'
          );
          nextMatchId = createdNextMatch.id;
        }
      }

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => {
        const nextBrackets = (prev.brackets || []).map((b) => {
          if (b.id === slot.id) {
            return { ...b, winnerSide, winnerName: wName, winnerContingent: wCont };
          }
          if (updatedNext && nextSlot && b.id === nextSlot.id) {
            return { ...updatedNext, matchId: nextMatchId || b.matchId || '' };
          }
          return b;
        });

        const nextEventsByMatch = { ...prev.eventsByMatch };
        const nextMatches =
          createdNextMatch && !prev.matches.some((m) => m.id === createdNextMatch.id)
            ? [...prev.matches, createdNextMatch]
            : prev.matches;
        if (createdNextMatch && !nextEventsByMatch[createdNextMatch.id]) {
          nextEventsByMatch[createdNextMatch.id] = [];
        }

        return {
          ...prev,
          matches: nextMatches,
          eventsByMatch: nextEventsByMatch,
          brackets: nextBrackets,
        };
      };

      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
            timestampMode: 'update',
            data: {
              winnerSide,
              winnerName: wName,
              winnerContingent: wCont,
            },
          },
        ];

        if (nextSlot && updatedNext) {
          if (createdNextMatch) {
            ops.push({
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'matches', createdNextMatch.id],
              timestampMode: 'create',
              data: { ...createdNextMatch },
            });
          }
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'brackets', nextSlot.id],
            timestampMode: 'update',
            data: {
              blueName: updatedNext.blueName,
              blueContingent: updatedNext.blueContingent,
              redName: updatedNext.redName,
              redContingent: updatedNext.redContingent,
              matchId: nextMatchId,
            },
          });
        }

        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [brackets, matches, arena.id, arena.ownerId, mode, cloudArena, user, executeFirestoreWithFallback, commitLocalStore]
  );

  const value: ArenaContextValue = {
    mode,
    isOnline,
    pendingSyncCount: pendingOpsCount,
    rtdbConnected,
    rtdbProjectId: userRtdbProjectId,
    user,
    authReady,
    syncError,
    arena,
    matches,
    activeMatch,
    events,
    getMatchEvents,
    athletes,
    brackets,
    liveTimerMs,
    signInGoogle,
    signOutGoogle,
    updateArenaMeta,
    joinArenaById,
    addOperatorUid,
    createMatch,
    updateMatchMeta,
    setActiveMatch,
    setMatchTotalRounds,
    applyLotingMatchAssignments,
    deleteMatch,
    resetMatch,
    addAthlete,
    importAthletes,
    deleteAthlete,
    clearAthletes,
    generateBracket,
    activateBracketMatch,
    advanceBracketWinner,
    clearBracket,
    sendJudgeVote,
    clearJudgeVote,
    triggerDewanAction,
    startVerification,
    castVerificationVote,
    cancelVerification,
    resolveVerification,
    submitVerification,
    undoLastEvent,
    declareWinner,
    autoAdjudicateWinner,
    startTimer,
    pauseTimer,
    resetTimer,
    setRound,
    startBreakTimer,
    setActivePerformerCorner,
    recordJurusWrongMove,
    setJurusStaminaScore,
    setJurusCreativeScore,
    toggleJurusJudgeSubmit,
    triggerJurusDewanPenalty,
    recordJurusElapsedAndSwitch,
  };

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena(): ArenaContextValue {
  const ctx = useContext(ArenaContext);
  if (!ctx) throw new Error('useArena must be used within ArenaProvider');
  return ctx;
}
