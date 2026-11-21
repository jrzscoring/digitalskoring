import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
  clearAllOfflineStorage,
  clonePayload,
  enqueueFirestoreOp,
  getPendingFirestoreOps,
  isBrowserOnline,
  isOfflineNetworkError,
  isPermissionDeniedError,
  isRtdbBackupDirty,
  markRtdbBackupSynced,
  mirrorRecordToIndexedDb,
  readLatestOfflineBackup,
  readOfflineBackup,
  readRecordFromIndexedDb,
  safeWriteLocalPayload,
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
  JurusJudgeId,
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
  getJurusJudgeCount,
  getJurusJudgeKey,
  getJurusJudgeScore,
  getJurusType,
  getRemainingTimerMs,
  hasJurusCornerActivity,
  isJurusMatch,
  normalizeJurusJudgeCount,
  normalizeJurusType,
} from '../utils/ipsiRules';
import { playArenaGong, playBreakBuzzer, playConsensusChime } from '../utils/soundEffects';

const LOCAL_STORAGE_KEY = 'silat_ipsi2026_arena_v1';
const BROADCAST_CHANNEL_NAME = 'silat_ipsi2026_sync_v1';

function clampStr(val: string, maxLen: number, fallback = '-'): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function findMatchingAthleteProfile(
  name: string,
  contingent: string,
  athletesList: AthleteData[]
): AthleteData | undefined {
  const normName = name.trim().toLowerCase();
  if (!normName || normName === 'bye' || normName === 'menunggu pemenang') return undefined;
  const normCont = contingent.trim().toLowerCase();
  const exact = athletesList.find(
    (a) =>
      a.name.trim().toLowerCase() === normName &&
      (!normCont || normCont === '-' || a.contingent.trim().toLowerCase() === normCont)
  );
  return exact || athletesList.find((a) => a.name.trim().toLowerCase() === normName);
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
  seedSuffix: string,
  athletesList: AthleteData[] = []
): MatchData {
  const matchId = sanitizeId(`partai-${Date.now().toString(36)}-${seedSuffix}`);
  const isJurus =
    slot.competitionCategory === 'Jurus' ||
    isJurusMatch({ weightClass: slot.weightClass });
  const durationSec = isJurus ? JURUS_DEFAULT_DURATION_SEC : 120;
  const resolvedRounds: 1 | 2 | 3 = isJurus ? 1 : totalRounds;
  const blueProfile = findMatchingAthleteProfile(slot.blueName, slot.blueContingent || '', athletesList);
  const redProfile = findMatchingAthleteProfile(slot.redName, slot.redContingent || '', athletesList);

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
    blueCountry: blueProfile?.country?.trim().slice(0, 64) || 'IDN',
    ...(blueProfile?.photo?.trim() ? { bluePhoto: blueProfile.photo.trim().slice(0, 250000) } : {}),
    redName: slot.redName,
    redContingent: slot.redContingent || '-',
    redCountry: redProfile?.country?.trim().slice(0, 64) || 'IDN',
    ...(redProfile?.photo?.trim() ? { redPhoto: redProfile.photo.trim().slice(0, 250000) } : {}),
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
  ownerId: string,
  athletesList: AthleteData[] = []
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
        const blueProfile = findMatchingAthleteProfile(
          updatedNextSlot.blueName,
          updatedNextSlot.blueContingent || '',
          athletesList
        );
        const redProfile = findMatchingAthleteProfile(
          updatedNextSlot.redName,
          updatedNextSlot.redContingent || '',
          athletesList
        );
        updatedExistingMatch = {
          id: existingNextMatch.id,
          patch: {
            blueName: updatedNextSlot.blueName,
            blueContingent: updatedNextSlot.blueContingent || '-',
            ...(blueProfile?.country ? { blueCountry: blueProfile.country.trim().slice(0, 64) } : {}),
            ...(blueProfile?.photo !== undefined ? { bluePhoto: blueProfile.photo.trim().slice(0, 250000) } : {}),
            redName: updatedNextSlot.redName,
            redContingent: updatedNextSlot.redContingent || '-',
            ...(redProfile?.country ? { redCountry: redProfile.country.trim().slice(0, 64) } : {}),
            ...(redProfile?.photo !== undefined ? { redPhoto: redProfile.photo.trim().slice(0, 250000) } : {}),
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
          `adv-${Date.now().toString(36)}`,
          athletesList
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
    blueCountry: 'IDN',
    redName: 'Budi Santoso',
    redContingent: 'Jawa Barat',
    redCountry: 'IDN',
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
      const latestBackup = readLatestOfflineBackup();
      if (latestBackup?.payload) {
        safeWriteLocalPayload(LOCAL_STORAGE_KEY, latestBackup.payload);
        return latestBackup.payload;
      }
      const seed = createDefaultSeed();
      safeWriteLocalPayload(LOCAL_STORAGE_KEY, seed);
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
  jurusJudgeCount?: number;
  totalRounds?: 1 | 2 | 3;
  blueName: string;
  blueContingent: string;
  blueCountry?: string;
  bluePhoto?: string;
  redName: string;
  redContingent: string;
  redCountry?: string;
  redPhoto?: string;
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
  country?: string;
  photo?: string;
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
  retrySyncNow: () => Promise<void>;
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
  setMatchJurusJudgeCount: (matchId: string, judgeCount: number) => Promise<void>;
  setMatchRoundDuration: (matchId: string, roundDurationSec: number) => Promise<void>;
  applyLotingMatchAssignments: (
    updates: Array<{
      matchId: string;
      blueName: string;
      blueContingent: string;
      blueCountry?: string;
      bluePhoto?: string;
      redName: string;
      redContingent: string;
      redCountry?: string;
      redPhoto?: string;
    }>
  ) => Promise<number>;
  deleteMatch: (matchId: string) => Promise<void>;
  resetMatch: (matchId: string) => Promise<void>;
  resetSystem: () => Promise<void>;
  exportArenaBackup: () => Promise<LocalStorePayload>;
  importArenaBackup: (payload: LocalStorePayload) => Promise<void>;
  addAthlete: (input: AddAthleteInput) => Promise<void>;
  updateAthlete: (athleteId: string, input: Partial<AddAthleteInput>) => Promise<void>;
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
  undoLastJudgeInput: (judgeId: JudgeId) => Promise<void>;
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
  resumeBreakTimer: () => Promise<void>;
  resetBreakTimer: () => Promise<void>;
  toggleJuriLock: (locked?: boolean) => Promise<void>;
  setActivePerformerCorner: (corner: Corner) => Promise<void>;
  recordJurusWrongMove: (judgeId: JurusJudgeId, corner: Corner, delta: 1 | -1) => Promise<void>;
  setJurusStaminaScore: (judgeId: JurusJudgeId, corner: Corner, valueHundredths: number) => Promise<void>;
  setJurusCreativeScore: (
    judgeId: JurusJudgeId,
    corner: Corner,
    component: 'attackScore' | 'harmonyScore' | 'soulScore',
    valueHundredths: number
  ) => Promise<void>;
  toggleJurusJudgeSubmit: (judgeId: JurusJudgeId, corner: Corner) => Promise<void>;
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
  const autoBreakMatchRef = useRef<string | null>(null);
  const autoAdjudicateRef = useRef<() => Promise<void>>(async () => {});
  const startBreakTimerRef = useRef<(seconds?: number) => Promise<void>>(async () => {});
  const pendingPenaltyKeysRef = useRef<Set<string>>(new Set());
  const pendingJudgeUndoKeysRef = useRef<Set<string>>(new Set());
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

  // Hydrate full-fidelity IndexedDB mirror on startup if available and local store is empty/default
  useEffect(() => {
    let cancelled = false;
    void readRecordFromIndexedDb<LocalStorePayload>(LOCAL_STORAGE_KEY).then((idbPayload) => {
      if (cancelled || !idbPayload?.arena || !Array.isArray(idbPayload.matches) || idbPayload.matches.length === 0) {
        return;
      }
      const current = localStoreRef.current;
      const isStillDefaultSeed =
        current.matches.length === 1 &&
        current.matches[0]?.id === 'partai-01' &&
        (current.athletes?.length || 0) === 0 &&
        (current.eventsByMatch['partai-01']?.length || 0) === 0;
      if (isStillDefaultSeed) {
        localStoreRef.current = idbPayload;
        setLocalStore(idbPayload);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistLocalMirror = useCallback((next: LocalStorePayload) => {
    localStoreRef.current = next;
    setLocalStore(next);
    safeWriteLocalPayload(LOCAL_STORAGE_KEY, next);
    void mirrorRecordToIndexedDb(LOCAL_STORAGE_KEY, next);
    try {
      channelRef.current?.postMessage({ type: 'SYNC_STATE', payload: next });
    } catch {
      // ignore broadcast channel errors
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
    retrySyncNow,
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

  const effectivePendingSyncCount =
    mode === 'firebase'
      ? pendingOpsCount
      : isRtdbBackupDirty(rtdbArenaId)
      ? Math.max(1, pendingOpsCount)
      : pendingOpsCount;

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
    if (
      (activeMatch.status !== 'active' && activeMatch.status !== 'break') ||
      activeMatch.timerStartedAtMs <= 0
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      const rem = getRemainingTimerMs(activeMatch, Date.now());
      setLiveTimerMs(rem);

      const roundKey = `${activeMatch.id}-r${activeMatch.currentRound}-${activeMatch.status}`;
      if (rem === 0 && gongFiredForRoundRef.current !== roundKey) {
        gongFiredForRoundRef.current = roundKey;
        if (activeMatch.status === 'break') {
          playBreakBuzzer();
        } else {
          playArenaGong();
        }

        const totalRounds = activeMatch.totalRounds ?? 3;
        if (
          !isJurusMatch(activeMatch) &&
          activeMatch.status === 'active' &&
          activeMatch.currentRound >= totalRounds &&
          autoFinishedMatchRef.current !== `${activeMatch.id}-r${activeMatch.currentRound}`
        ) {
          autoFinishedMatchRef.current = `${activeMatch.id}-r${activeMatch.currentRound}`;
          void autoAdjudicateRef.current();
        } else if (
          !isJurusMatch(activeMatch) &&
          activeMatch.status === 'active' &&
          activeMatch.currentRound < totalRounds &&
          autoBreakMatchRef.current !== `${activeMatch.id}-r${activeMatch.currentRound}`
        ) {
          autoBreakMatchRef.current = `${activeMatch.id}-r${activeMatch.currentRound}`;
          void startBreakTimerRef.current(60);
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
              ...(typeof input.jurusJudgeCount === 'number'
                ? { jurusJudgeCount: Math.min(10, Math.max(4, Math.round(input.jurusJudgeCount))) }
                : {}),
              activePerformerCorner: 'blue' as Corner,
              jurusState: createInitialJurusState(),
            }
          : {}),
        blueName: clampStr(input.blueName, 80, 'Pesilat Biru'),
        blueContingent: clampStr(input.blueContingent, 80, 'Kontingen Biru'),
        ...(input.blueCountry?.trim() ? { blueCountry: input.blueCountry.trim().slice(0, 64) } : { blueCountry: 'IDN' }),
        ...(input.bluePhoto?.trim() ? { bluePhoto: input.bluePhoto.trim().slice(0, 250000) } : {}),
        redName: clampStr(input.redName, 80, 'Pesilat Merah'),
        redContingent: clampStr(input.redContingent, 80, 'Kontingen Merah'),
        ...(input.redCountry?.trim() ? { redCountry: input.redCountry.trim().slice(0, 64) } : { redCountry: 'IDN' }),
        ...(input.redPhoto?.trim() ? { redPhoto: input.redPhoto.trim().slice(0, 250000) } : {}),
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
        ...(input.blueCountry !== undefined ? { blueCountry: input.blueCountry.trim().slice(0, 64) } : {}),
        ...(input.bluePhoto !== undefined ? { bluePhoto: input.bluePhoto.trim().slice(0, 250000) } : {}),
        redName: input.redName ? clampStr(input.redName, 80) : target.redName,
        redContingent: input.redContingent ? clampStr(input.redContingent, 80) : target.redContingent,
        ...(input.redCountry !== undefined ? { redCountry: input.redCountry.trim().slice(0, 64) } : {}),
        ...(input.redPhoto !== undefined ? { redPhoto: input.redPhoto.trim().slice(0, 250000) } : {}),
        roundDurationSec: roundSec,
        totalRounds: isJurus ? 1 : input.totalRounds ?? target.totalRounds ?? 3,
        timerRemainingMs:
          target.status === 'waiting' ? roundSec * 1000 : target.timerRemainingMs,
      };

      if (isJurus) {
        patch.jurusType = input.jurusType || target.jurusType || normalizeJurusType(patch.weightClass);
        if (typeof input.jurusJudgeCount === 'number') {
          patch.jurusJudgeCount = Math.min(10, Math.max(4, Math.round(input.jurusJudgeCount)));
        }
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

  const setMatchJurusJudgeCount = useCallback(
    async (matchId: string, judgeCount: number) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target || target.status === 'finished') return;
      const safeCount = Math.min(10, Math.max(4, Math.round(judgeCount)));
      const patch: Partial<MatchData> = {
        jurusJudgeCount: safeCount,
      };
      if (isJurusMatch(target)) {
        const jurusType = getJurusType(target);
        const jState = ensureJurusState(target);
        const blueSummary = computeCornerJurusSummary(jurusType, jState.blue, safeCount);
        const redSummary = computeCornerJurusSummary(jurusType, jState.red, safeCount);
        if (hasJurusCornerActivity(jState.blue) || target.blueScore > 0) {
          patch.blueScore = blueSummary.finalScore;
        }
        if (hasJurusCornerActivity(jState.red) || target.redScore > 0) {
          patch.redScore = redSummary.finalScore;
        }
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

  const setMatchRoundDuration = useCallback(
    async (matchId: string, roundDurationSec: number) => {
      const target = matches.find((m) => m.id === matchId);
      if (!target || target.status === 'finished') return;
      const safeSec = Math.min(300, Math.max(30, Math.round(roundDurationSec)));
      const shouldResetClock = target.status === 'waiting' || target.status === 'paused';
      const patch: Partial<MatchData> = shouldResetClock
        ? {
            roundDurationSec: safeSec,
            status: 'waiting',
            timerRemainingMs: safeSec * 1000,
            timerStartedAtMs: 0,
          }
        : {
            roundDurationSec: safeSec,
          };

      if (shouldResetClock) {
        gongFiredForRoundRef.current = null;
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

  const applyLotingMatchAssignments = useCallback(
    async (
      updates: Array<{
        matchId: string;
        blueName: string;
        blueContingent: string;
        blueCountry?: string;
        bluePhoto?: string;
        redName: string;
        redContingent: string;
        redCountry?: string;
        redPhoto?: string;
      }>
    ): Promise<number> => {
      if (updates.length === 0) return 0;
      const normalizedMap = new Map<
        string,
        {
          blueName: string;
          blueContingent: string;
          blueCountry: string;
          bluePhoto: string;
          redName: string;
          redContingent: string;
          redCountry: string;
          redPhoto: string;
        }
      >();

      for (const u of updates) {
        const existing = matches.find((m) => m.id === u.matchId);
        if (!existing || existing.status === 'finished') continue;
        const nextBlueName = clampStr(u.blueName, 80, existing.blueName);
        const nextBlueCont = clampStr(u.blueContingent, 80, existing.blueContingent);
        const nextRedName = clampStr(u.redName, 80, existing.redName);
        const nextRedCont = clampStr(u.redContingent, 80, existing.redContingent);

        const blueProfile = findMatchingAthleteProfile(nextBlueName, nextBlueCont, athletes);
        const redProfile = findMatchingAthleteProfile(nextRedName, nextRedCont, athletes);

        const nextBlueCountry =
          u.blueCountry?.trim().slice(0, 64) ||
          blueProfile?.country?.trim().slice(0, 64) ||
          existing.blueCountry ||
          'IDN';
        const nextBluePhoto =
          (u.bluePhoto !== undefined ? u.bluePhoto : blueProfile?.photo ?? existing.bluePhoto ?? '')
            .trim()
            .slice(0, 250000);
        const nextRedCountry =
          u.redCountry?.trim().slice(0, 64) ||
          redProfile?.country?.trim().slice(0, 64) ||
          existing.redCountry ||
          'IDN';
        const nextRedPhoto =
          (u.redPhoto !== undefined ? u.redPhoto : redProfile?.photo ?? existing.redPhoto ?? '')
            .trim()
            .slice(0, 250000);

        if (
          nextBlueName !== existing.blueName ||
          nextBlueCont !== existing.blueContingent ||
          nextBlueCountry !== (existing.blueCountry || 'IDN') ||
          nextBluePhoto !== (existing.bluePhoto || '') ||
          nextRedName !== existing.redName ||
          nextRedCont !== existing.redContingent ||
          nextRedCountry !== (existing.redCountry || 'IDN') ||
          nextRedPhoto !== (existing.redPhoto || '')
        ) {
          normalizedMap.set(u.matchId, {
            blueName: nextBlueName,
            blueContingent: nextBlueCont,
            blueCountry: nextBlueCountry,
            bluePhoto: nextBluePhoto,
            redName: nextRedName,
            redContingent: nextRedCont,
            redCountry: nextRedCountry,
            redPhoto: nextRedPhoto,
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
          return patch
            ? {
                ...b,
                blueName: patch.blueName,
                blueContingent: patch.blueContingent,
                redName: patch.redName,
                redContingent: patch.redContingent,
              }
            : b;
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
              data: {
                blueName: patch.blueName,
                blueContingent: patch.blueContingent,
                redName: patch.redName,
                redContingent: patch.redContingent,
              },
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
    [matches, athletes, brackets, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
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
        verification: createVerificationState('jatuhan', false, 0),
        juriLocked: false,
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
      autoBreakMatchRef.current = null;

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...resetPatch } : m)),
        eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
      });

      if (mode === 'firebase' && cloudArena) {
        const eventIdsToDelete = new Set<string>();
        for (const ev of localStoreRef.current.eventsByMatch[matchId] || []) {
          if (ev.id) eventIdsToDelete.add(ev.id);
        }
        if (matchId === activeMatch.id) {
          for (const ev of cloudEvents) {
            if (ev.id) eventIdsToDelete.add(ev.id);
          }
        }

        const eventsPath = `arenas/${cloudArena.id}/matches/${matchId}/events`;
        if (isBrowserOnline()) {
          try {
            const eventsQuery = query(
              collection(db, 'arenas', cloudArena.id, 'matches', matchId, 'events'),
              where('ownerId', '==', cloudArena.ownerId)
            );
            const snap = await getDocs(eventsQuery);
            snap.forEach((docSnap) => {
              eventIdsToDelete.add(docSnap.id);
            });
          } catch (err) {
            if (!isOfflineNetworkError(err)) {
              handleFirestoreError(err, OperationType.LIST, eventsPath);
            }
          }
        }

        const matchUpdateOp: QueuedOpInput = {
          opType: 'update',
          pathSegments: ['arenas', cloudArena.id, 'matches', matchId],
          data: { ...resetPatch },
          timestampMode: 'update',
        };
        const deleteEventOps: QueuedOpInput[] = Array.from(eventIdsToDelete).map((evId) => ({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'matches', matchId, 'events', evId],
          timestampMode: 'none',
        }));

        await executeFirestoreWithFallback(cloudArena.id, [matchUpdateOp], localUpdater);
        if (deleteEventOps.length > 0) {
          await executeFirestoreWithFallback(cloudArena.id, deleteEventOps, (prev) => ({
            ...prev,
            eventsByMatch: { ...prev.eventsByMatch, [matchId]: [] },
          }));
        }
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [
      matches,
      mode,
      cloudArena,
      activeMatch.id,
      cloudEvents,
      commitLocalStore,
      executeFirestoreWithFallback,
    ]
  );

  const resetSystem = useCallback(async () => {
    const targetArenaId = cloudArena?.id || arena.id || 'gelanggang-a';
    const targetOwnerId = cloudArena?.ownerId || arena.ownerId || 'local-operator';
    const defaultArenaLabel = targetArenaId.startsWith('gelanggang-')
      ? `Gelanggang ${targetArenaId.replace('gelanggang-', '').toUpperCase()}`
      : 'Gelanggang A';

    const baseSeed = createDefaultSeed();
    const freshSeed: LocalStorePayload = {
      arena: {
        ...baseSeed.arena,
        id: targetArenaId,
        name: defaultArenaLabel,
        ownerId: targetOwnerId,
      },
      matches: baseSeed.matches.map((m) => ({
        ...m,
        arenaId: targetArenaId,
        ownerId: targetOwnerId,
      })),
      eventsByMatch: {
        [baseSeed.matches[0].id]: [],
      },
      athletes: [],
      brackets: [],
    };

    gongFiredForRoundRef.current = null;
    autoFinishedMatchRef.current = null;
    autoBreakMatchRef.current = null;
    pendingPenaltyKeysRef.current.clear();
    pendingJudgeUndoKeysRef.current.clear();

    await clearAllOfflineStorage(LOCAL_STORAGE_KEY);

    if (mode === 'firebase' && cloudArena) {
      const athleteIds = new Set<string>(athletes.map((a) => a.id).filter(Boolean));
      const bracketIds = new Set<string>(brackets.map((b) => b.id).filter(Boolean));
      const matchIds = new Set<string>(matches.map((m) => m.id).filter(Boolean));
      matchIds.add(freshSeed.matches[0].id);

      const eventIdsByMatch = new Map<string, Set<string>>();
      const addEventId = (mId: string, evId: string) => {
        if (!mId || !evId) return;
        const setForMatch = eventIdsByMatch.get(mId) || new Set<string>();
        setForMatch.add(evId);
        eventIdsByMatch.set(mId, setForMatch);
      };
      for (const [mId, list] of Object.entries(localStoreRef.current.eventsByMatch || {})) {
        for (const ev of list || []) {
          if (ev.id) addEventId(mId, ev.id);
        }
      }
      for (const ev of cloudEvents) {
        if (ev.id) addEventId(activeMatch.id, ev.id);
      }

      if (isBrowserOnline()) {
        try {
          const [athSnap, brkSnap, matchSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'arenas', cloudArena.id, 'athletes'),
                where('ownerId', '==', cloudArena.ownerId)
              )
            ),
            getDocs(
              query(
                collection(db, 'arenas', cloudArena.id, 'brackets'),
                where('ownerId', '==', cloudArena.ownerId)
              )
            ),
            getDocs(
              query(
                collection(db, 'arenas', cloudArena.id, 'matches'),
                where('ownerId', '==', cloudArena.ownerId)
              )
            ),
          ]);
          athSnap.forEach((d) => athleteIds.add(d.id));
          brkSnap.forEach((d) => bracketIds.add(d.id));
          matchSnap.forEach((d) => matchIds.add(d.id));

          await Promise.all(
            Array.from(matchIds).map(async (mId) => {
              const evSnap = await getDocs(
                query(
                  collection(db, 'arenas', cloudArena.id, 'matches', mId, 'events'),
                  where('ownerId', '==', cloudArena.ownerId)
                )
              );
              evSnap.forEach((d) => addEventId(mId, d.id));
            })
          );
        } catch (err) {
          if (!isOfflineNetworkError(err)) {
            handleFirestoreError(err, OperationType.LIST, `arenas/${cloudArena.id}`);
          }
        }
      }

      const deleteOps: QueuedOpInput[] = [];
      for (const [mId, evSet] of eventIdsByMatch.entries()) {
        for (const evId of evSet) {
          deleteOps.push({
            opType: 'delete',
            pathSegments: ['arenas', cloudArena.id, 'matches', mId, 'events', evId],
            timestampMode: 'none',
          });
        }
      }
      for (const aId of athleteIds) {
        deleteOps.push({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'athletes', aId],
          timestampMode: 'none',
        });
      }
      for (const bId of bracketIds) {
        deleteOps.push({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'brackets', bId],
          timestampMode: 'none',
        });
      }
      for (const mId of matchIds) {
        deleteOps.push({
          opType: 'delete',
          pathSegments: ['arenas', cloudArena.id, 'matches', mId],
          timestampMode: 'none',
        });
      }

      const localResetUpdater = () => freshSeed;
      if (deleteOps.length > 0) {
        await executeFirestoreWithFallback(cloudArena.id, deleteOps, localResetUpdater);
      }

      const seedMatch = freshSeed.matches[0];
      await executeFirestoreWithFallback(
        cloudArena.id,
        [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id],
            data: {
              name: freshSeed.arena.name,
              tournamentName: freshSeed.arena.tournamentName,
              venue: '',
              eventDate: '',
              logoLeft: '',
              logoRight: '',
              activeMatchId: freshSeed.arena.activeMatchId,
            },
            timestampMode: 'update',
          },
          {
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'matches', seedMatch.id],
            data: { ...seedMatch },
            timestampMode: 'create',
          },
        ],
        localResetUpdater
      );
    } else {
      commitLocalStore(() => freshSeed);
    }
  }, [
    cloudArena,
    arena.id,
    arena.ownerId,
    mode,
    athletes,
    brackets,
    matches,
    cloudEvents,
    activeMatch.id,
    commitLocalStore,
    executeFirestoreWithFallback,
  ]);

  const exportArenaBackup = useCallback(async (): Promise<LocalStorePayload> => {
    const mergedEvents: Record<string, MatchEvent[]> = {};
    for (const [mId, list] of Object.entries(localStoreRef.current.eventsByMatch || {})) {
      mergedEvents[mId] = Array.isArray(list) ? [...list] : [];
    }

    if (mode === 'firebase' && cloudArena) {
      mergedEvents[activeMatch.id] = [...cloudEvents];
      if (isBrowserOnline()) {
        await Promise.all(
          matches.map(async (m) => {
            if (m.id === activeMatch.id) return;
            try {
              const evSnap = await getDocs(
                query(
                  collection(db, 'arenas', cloudArena.id, 'matches', m.id, 'events'),
                  where('ownerId', '==', cloudArena.ownerId)
                )
              );
              const fetched = evSnap.docs.map((d) => d.data() as MatchEvent);
              if (fetched.length > 0 || !mergedEvents[m.id]) {
                mergedEvents[m.id] = fetched;
              }
            } catch {
              // keep cached events if offline or query skipped
            }
          })
        );
      }
    }

    return clonePayload({
      arena: { ...arena },
      matches: matches.map((m) => ({ ...m })),
      eventsByMatch: mergedEvents,
      athletes: athletes.map((a) => ({ ...a })),
      brackets: brackets.map((b) => ({ ...b })),
    });
  }, [mode, cloudArena, activeMatch.id, cloudEvents, matches, arena, athletes, brackets]);

  const importArenaBackup = useCallback(
    async (rawPayload: LocalStorePayload) => {
      const targetArenaId = cloudArena?.id || arena.id || 'gelanggang-a';
      const targetOwnerId = cloudArena?.ownerId || arena.ownerId || 'local-operator';

      const sourceMatches =
        Array.isArray(rawPayload.matches) && rawPayload.matches.length > 0
          ? rawPayload.matches
          : createDefaultSeed().matches;

      const matchIdMap = new Map<string, string>();
      const normalizedMatches: MatchData[] = sourceMatches.map((m, idx) => {
        const safeMatchId = sanitizeId(m.id || `partai-${String(idx + 1).padStart(2, '0')}`);
        matchIdMap.set(m.id, safeMatchId);
        const safeDuration = Math.min(300, Math.max(30, Math.round(Number(m.roundDurationSec) || 120)));
        const safeRound = Math.min(3, Math.max(1, Math.round(Number(m.currentRound) || 1)));
        const safeTotalRounds = m.totalRounds === 1 || m.totalRounds === 2 || m.totalRounds === 3 ? m.totalRounds : 3;
        const safeStatus: MatchStatus =
          m.status === 'active' || m.status === 'paused' || m.status === 'break' || m.status === 'finished'
            ? m.status
            : 'waiting';
        const safeWinner: Corner | 'draw' | '' =
          m.winner === 'blue' || m.winner === 'red' || m.winner === 'draw' ? m.winner : '';

        return {
          ...m,
          id: safeMatchId,
          arenaId: targetArenaId,
          ownerId: targetOwnerId,
          matchNumber: clampStr(m.matchNumber || `Partai ${String(idx + 1).padStart(2, '0')}`, 32, `Partai ${idx + 1}`),
          weightClass: clampStr(m.weightClass || 'Kelas Bebas', 80, 'Kelas Bebas'),
          stage: clampStr(m.stage || 'Babak Penyisihan', 40, 'Babak Penyisihan'),
          blueName: clampStr(m.blueName || 'Sudut Biru', 80, 'Sudut Biru'),
          blueContingent: clampStr(m.blueContingent || '-', 80, '-'),
          redName: clampStr(m.redName || 'Sudut Merah', 80, 'Sudut Merah'),
          redContingent: clampStr(m.redContingent || '-', 80, '-'),
          roundDurationSec: safeDuration,
          currentRound: safeRound,
          totalRounds: safeTotalRounds,
          ...(typeof m.jurusJudgeCount === 'number'
            ? { jurusJudgeCount: normalizeJurusJudgeCount(m.jurusJudgeCount) }
            : {}),
          status: safeStatus,
          timerRemainingMs: Math.min(600000, Math.max(0, Math.round(Number(m.timerRemainingMs) || 0))),
          timerStartedAtMs: Math.max(0, Math.round(Number(m.timerStartedAtMs) || 0)),
          blueScore: Math.min(1500, Math.max(-100, Math.round(Number(m.blueScore) || 0))),
          redScore: Math.min(1500, Math.max(-100, Math.round(Number(m.redScore) || 0))),
          bluePunches: Math.min(999, Math.max(0, Math.round(Number(m.bluePunches) || 0))),
          blueKicks: Math.min(999, Math.max(0, Math.round(Number(m.blueKicks) || 0))),
          blueFalls: Math.min(99, Math.max(0, Math.round(Number(m.blueFalls) || 0))),
          blueBinaan: Math.min(20, Math.max(0, Math.round(Number(m.blueBinaan) || 0))),
          blueTeguran1: Math.min(20, Math.max(0, Math.round(Number(m.blueTeguran1) || 0))),
          blueTeguran2: Math.min(20, Math.max(0, Math.round(Number(m.blueTeguran2) || 0))),
          bluePeringatan: Math.min(3, Math.max(0, Math.round(Number(m.bluePeringatan) || 0))),
          redPunches: Math.min(999, Math.max(0, Math.round(Number(m.redPunches) || 0))),
          redKicks: Math.min(999, Math.max(0, Math.round(Number(m.redKicks) || 0))),
          redFalls: Math.min(99, Math.max(0, Math.round(Number(m.redFalls) || 0))),
          redBinaan: Math.min(20, Math.max(0, Math.round(Number(m.redBinaan) || 0))),
          redTeguran1: Math.min(20, Math.max(0, Math.round(Number(m.redTeguran1) || 0))),
          redTeguran2: Math.min(20, Math.max(0, Math.round(Number(m.redTeguran2) || 0))),
          redPeringatan: Math.min(3, Math.max(0, Math.round(Number(m.redPeringatan) || 0))),
          winner: safeWinner,
          winMethod: (m.winMethod || '').slice(0, 64),
        };
      });

      const mappedActiveMatchId =
        (rawPayload.arena?.activeMatchId && matchIdMap.get(rawPayload.arena.activeMatchId)) ||
        normalizedMatches[0].id;

      const normalizedEventsByMatch: Record<string, MatchEvent[]> = {};
      for (const m of normalizedMatches) {
        normalizedEventsByMatch[m.id] = [];
      }
      if (rawPayload.eventsByMatch && typeof rawPayload.eventsByMatch === 'object') {
        for (const [origMId, list] of Object.entries(rawPayload.eventsByMatch)) {
          const targetMId = matchIdMap.get(origMId) || origMId;
          if (!normalizedEventsByMatch[targetMId]) continue;
          normalizedEventsByMatch[targetMId] = (list || []).map((ev, evIdx) => ({
            id: sanitizeId(ev.id || `ev-${targetMId}-${evIdx}`),
            arenaId: targetArenaId,
            matchId: targetMId,
            ownerId: targetOwnerId,
            actorRole: clampStr(ev.actorRole || 'Sistem', 32, 'Sistem'),
            corner: ev.corner === 'blue' || ev.corner === 'red' ? ev.corner : 'neutral',
            type: clampStr(ev.type || 'info', 32, 'info'),
            pointsDelta: Math.min(500, Math.max(-500, Math.round(Number(ev.pointsDelta) || 0))),
            round: Math.min(3, Math.max(1, Math.round(Number(ev.round) || 1))),
            matchTimeFormatted: clampStr(ev.matchTimeFormatted || '00:00', 16, '00:00'),
            description: clampStr(ev.description || '-', 200, '-'),
            undone: Boolean(ev.undone),
            ...(typeof ev.createdAtMs === 'number' ? { createdAtMs: ev.createdAtMs } : {}),
          }));
        }
      }

      const normalizedAthletes: AthleteData[] = (rawPayload.athletes || []).map((ath, idx) => ({
        ...ath,
        id: sanitizeId(ath.id || `ath-${idx + 1}`),
        arenaId: targetArenaId,
        ownerId: targetOwnerId,
        name: clampStr(ath.name || `Atlet ${idx + 1}`, 80, `Atlet ${idx + 1}`),
        contingent: clampStr(ath.contingent || '-', 80, '-'),
        weightClass: clampStr(ath.weightClass || 'Kelas A', 80, 'Kelas A'),
        gender: ath.gender === 'Putri' ? 'Putri' : 'Putra',
        ageCategory: ath.ageCategory || 'Dewasa',
        competitionCategory: ath.competitionCategory === 'Jurus' ? 'Jurus' : 'Tanding',
        gelanggang:
          ath.gelanggang === 'B' || ath.gelanggang === 'C' || ath.gelanggang === 'D' ? ath.gelanggang : 'A',
      }));

      const normalizedBrackets: BracketMatchSlot[] = (rawPayload.brackets || []).map((slot, idx) => ({
        ...slot,
        id: sanitizeId(slot.id || `brk-${idx + 1}`),
        arenaId: targetArenaId,
        ownerId: targetOwnerId,
        weightClass: clampStr(slot.weightClass || 'Kelas A', 80, 'Kelas A'),
        gender: slot.gender === 'Putri' ? 'Putri' : 'Putra',
        stage: clampStr(slot.stage || 'Babak Penyisihan', 40, 'Babak Penyisihan'),
        blueName: (slot.blueName || '').slice(0, 80),
        blueContingent: (slot.blueContingent || '').slice(0, 80),
        redName: (slot.redName || '').slice(0, 80),
        redContingent: (slot.redContingent || '').slice(0, 80),
        ...(slot.matchId ? { matchId: matchIdMap.get(slot.matchId) || slot.matchId } : {}),
      }));

      const restoredPayload: LocalStorePayload = {
        arena: {
          id: targetArenaId,
          name: clampStr(rawPayload.arena?.name || 'Gelanggang A', 80, 'Gelanggang A'),
          tournamentName: clampStr(
            rawPayload.arena?.tournamentName || 'Kejuaraan Nasional Pencak Silat IPSI 2026',
            120,
            'Kejuaraan Nasional Pencak Silat IPSI 2026'
          ),
          venue: (rawPayload.arena?.venue || '').slice(0, 120),
          eventDate: (rawPayload.arena?.eventDate || '').slice(0, 80),
          logoLeft: (rawPayload.arena?.logoLeft || '').slice(0, 250000),
          logoRight: (rawPayload.arena?.logoRight || '').slice(0, 250000),
          ownerId: targetOwnerId,
          activeMatchId: mappedActiveMatchId,
        },
        matches: normalizedMatches,
        eventsByMatch: normalizedEventsByMatch,
        athletes: normalizedAthletes,
        brackets: normalizedBrackets,
      };

      gongFiredForRoundRef.current = null;
      autoFinishedMatchRef.current = null;
      autoBreakMatchRef.current = null;
      pendingPenaltyKeysRef.current.clear();
      pendingJudgeUndoKeysRef.current.clear();

      await clearAllOfflineStorage(LOCAL_STORAGE_KEY);

      if (mode === 'firebase' && cloudArena) {
        const existingAthleteIds = new Set<string>(athletes.map((a) => a.id).filter(Boolean));
        const existingBracketIds = new Set<string>(brackets.map((b) => b.id).filter(Boolean));
        const existingMatchIds = new Set<string>(matches.map((m) => m.id).filter(Boolean));
        for (const m of normalizedMatches) existingMatchIds.add(m.id);

        const existingEventIdsByMatch = new Map<string, Set<string>>();
        const trackExistingEvent = (mId: string, evId: string) => {
          if (!mId || !evId) return;
          const s = existingEventIdsByMatch.get(mId) || new Set<string>();
          s.add(evId);
          existingEventIdsByMatch.set(mId, s);
        };
        for (const [mId, list] of Object.entries(localStoreRef.current.eventsByMatch || {})) {
          for (const ev of list || []) {
            if (ev.id) trackExistingEvent(mId, ev.id);
          }
        }
        for (const ev of cloudEvents) {
          if (ev.id) trackExistingEvent(activeMatch.id, ev.id);
        }

        if (isBrowserOnline()) {
          try {
            const [athSnap, brkSnap, matchSnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, 'arenas', cloudArena.id, 'athletes'),
                  where('ownerId', '==', cloudArena.ownerId)
                )
              ),
              getDocs(
                query(
                  collection(db, 'arenas', cloudArena.id, 'brackets'),
                  where('ownerId', '==', cloudArena.ownerId)
                )
              ),
              getDocs(
                query(
                  collection(db, 'arenas', cloudArena.id, 'matches'),
                  where('ownerId', '==', cloudArena.ownerId)
                )
              ),
            ]);
            athSnap.forEach((d) => existingAthleteIds.add(d.id));
            brkSnap.forEach((d) => existingBracketIds.add(d.id));
            matchSnap.forEach((d) => existingMatchIds.add(d.id));

            await Promise.all(
              Array.from(existingMatchIds).map(async (mId) => {
                const evSnap = await getDocs(
                  query(
                    collection(db, 'arenas', cloudArena.id, 'matches', mId, 'events'),
                    where('ownerId', '==', cloudArena.ownerId)
                  )
                );
                evSnap.forEach((d) => trackExistingEvent(mId, d.id));
              })
            );
          } catch (err) {
            if (!isOfflineNetworkError(err)) {
              handleFirestoreError(err, OperationType.LIST, `arenas/${cloudArena.id}`);
            }
          }
        }

        const deleteOps: QueuedOpInput[] = [];
        for (const [mId, evSet] of existingEventIdsByMatch.entries()) {
          for (const evId of evSet) {
            deleteOps.push({
              opType: 'delete',
              pathSegments: ['arenas', cloudArena.id, 'matches', mId, 'events', evId],
              timestampMode: 'none',
            });
          }
        }
        for (const aId of existingAthleteIds) {
          deleteOps.push({
            opType: 'delete',
            pathSegments: ['arenas', cloudArena.id, 'athletes', aId],
            timestampMode: 'none',
          });
        }
        for (const bId of existingBracketIds) {
          deleteOps.push({
            opType: 'delete',
            pathSegments: ['arenas', cloudArena.id, 'brackets', bId],
            timestampMode: 'none',
          });
        }
        for (const mId of existingMatchIds) {
          deleteOps.push({
            opType: 'delete',
            pathSegments: ['arenas', cloudArena.id, 'matches', mId],
            timestampMode: 'none',
          });
        }

        const applyRestoredLocal = () => restoredPayload;
        if (deleteOps.length > 0) {
          await executeFirestoreWithFallback(cloudArena.id, deleteOps, applyRestoredLocal);
        }

        const createOps: QueuedOpInput[] = [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id],
            data: {
              name: restoredPayload.arena.name,
              tournamentName: restoredPayload.arena.tournamentName,
              venue: restoredPayload.arena.venue || '',
              eventDate: restoredPayload.arena.eventDate || '',
              logoLeft: restoredPayload.arena.logoLeft || '',
              logoRight: restoredPayload.arena.logoRight || '',
              activeMatchId: restoredPayload.arena.activeMatchId,
            },
            timestampMode: 'update',
          },
        ];

        for (const m of normalizedMatches) {
          const matchCopy = { ...m } as Record<string, unknown>;
          delete matchCopy.createdAt;
          delete matchCopy.updatedAt;
          createOps.push({
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'matches', m.id],
            data: matchCopy,
            timestampMode: 'create',
          });
          for (const ev of normalizedEventsByMatch[m.id] || []) {
            createOps.push({
              opType: 'set',
              pathSegments: ['arenas', cloudArena.id, 'matches', m.id, 'events', ev.id],
              data: {
                id: ev.id,
                arenaId: cloudArena.id,
                matchId: m.id,
                ownerId: cloudArena.ownerId,
                actorRole: ev.actorRole,
                corner: ev.corner,
                type: ev.type,
                pointsDelta: ev.pointsDelta,
                round: ev.round,
                matchTimeFormatted: ev.matchTimeFormatted,
                description: ev.description,
                undone: Boolean(ev.undone),
              },
              timestampMode: 'createdAtOnly',
            });
          }
        }

        for (const ath of normalizedAthletes) {
          const athCopy = { ...ath } as Record<string, unknown>;
          delete athCopy.createdAt;
          delete athCopy.createdAtMs;
          createOps.push({
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'athletes', ath.id],
            data: athCopy,
            timestampMode: 'createdAtOnly',
          });
        }

        for (const slot of normalizedBrackets) {
          const slotCopy = { ...slot } as Record<string, unknown>;
          delete slotCopy.createdAt;
          delete slotCopy.updatedAt;
          createOps.push({
            opType: 'set',
            pathSegments: ['arenas', cloudArena.id, 'brackets', slot.id],
            data: slotCopy,
            timestampMode: 'create',
          });
        }

        await executeFirestoreWithFallback(cloudArena.id, createOps, applyRestoredLocal);
      } else {
        commitLocalStore(() => restoredPayload);
      }
    },
    [
      cloudArena,
      arena.id,
      arena.ownerId,
      mode,
      athletes,
      brackets,
      matches,
      cloudEvents,
      activeMatch.id,
      commitLocalStore,
      executeFirestoreWithFallback,
    ]
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

  const undoLastJudgeInput = useCallback(
    async (judgeId: JudgeId) => {
      if (activeMatch.status === 'finished') return;

      const lockKey = `${activeMatch.id}:${judgeId}`;
      if (pendingJudgeUndoKeysRef.current.has(lockKey)) return;

      const targetRole = `Juri ${judgeId}`;
      const targetPressIndex = events.findIndex(
        (e) => !e.undone && e.type === 'judge_press' && e.actorRole === targetRole
      );
      if (targetPressIndex === -1) return;

      pendingJudgeUndoKeysRef.current.add(lockKey);
      try {
        const targetPress = events[targetPressIndex];
        const pressPoints: 1 | 2 = targetPress.description === 'T' ? 2 : 1;
        const pressCorner =
          targetPress.corner === 'blue' || targetPress.corner === 'red' ? targetPress.corner : null;

        let linkedConsensus: MatchEvent | null = null;
        if (pressCorner) {
          const judgeTagRegex = new RegExp(`\\bJ${judgeId}\\b`);
          for (let i = targetPressIndex - 1; i >= 0; i--) {
            const candidate = events[i];
            if (
              !candidate.undone &&
              (candidate.type === 'punch' || candidate.type === 'kick') &&
              candidate.corner === pressCorner &&
              candidate.round === targetPress.round &&
              candidate.pointsDelta === pressPoints &&
              judgeTagRegex.test(candidate.actorRole)
            ) {
              const judgeTags = candidate.actorRole.match(/\bJ[123]\b/g) || [];
              if (judgeTags.length - 1 < 2) {
                linkedConsensus = candidate;
              }
              break;
            }
          }
        }

        const patch: Partial<MatchData> = {};
        const voteKey = judgeId === 1 ? 'judge1Vote' : judgeId === 2 ? 'judge2Vote' : 'judge3Vote';
        const currentVote = activeMatch[voteKey];
        if (
          currentVote &&
          currentVote.corner === pressCorner &&
          currentVote.points === pressPoints &&
          currentVote.round === targetPress.round
        ) {
          patch[voteKey] = {
            corner: 'none',
            points: 0,
            timestampMs: 0,
            round: activeMatch.currentRound,
          };
        }

        if (linkedConsensus && pressCorner) {
          const isBlue = pressCorner === 'blue';
          const scoreKey = isBlue ? 'blueScore' : 'redScore';
          patch[scoreKey] = activeMatch[scoreKey] - linkedConsensus.pointsDelta;
          if (linkedConsensus.type === 'punch') {
            const punchKey = isBlue ? 'bluePunches' : 'redPunches';
            patch[punchKey] = Math.max(0, activeMatch[punchKey] - 1);
          } else {
            const kickKey = isBlue ? 'blueKicks' : 'redKicks';
            patch[kickKey] = Math.max(0, activeMatch[kickKey] - 1);
          }
        }

        const undoneIds = new Set<string>([targetPress.id]);
        if (linkedConsensus) {
          undoneIds.add(linkedConsensus.id);
        }

        const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
          ...prev,
          matches:
            Object.keys(patch).length > 0
              ? prev.matches.map((m) => (m.id === activeMatch.id ? { ...m, ...patch } : m))
              : prev.matches,
          eventsByMatch: {
            ...prev.eventsByMatch,
            [activeMatch.id]: (prev.eventsByMatch[activeMatch.id] || []).map((e) =>
              undoneIds.has(e.id) ? { ...e, undone: true } : e
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
          for (const eventId of undoneIds) {
            ops.push({
              opType: 'update',
              pathSegments: ['arenas', cloudArena.id, 'matches', activeMatch.id, 'events', eventId],
              data: { undone: true },
              timestampMode: 'none',
            });
          }
          await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
        } else {
          commitLocalStore(localUpdater);
        }
      } finally {
        pendingJudgeUndoKeysRef.current.delete(lockKey);
      }
    },
    [activeMatch, events, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
  );

  const triggerDewanAction = useCallback(
    async (action: DewanActionType, corner: Corner) => {
      if (activeMatch.status === 'finished') return;

      const isSingleUsePenalty =
        action === 'binaan1' ||
        action === 'binaan2' ||
        action === 'teguran1' ||
        action === 'teguran2' ||
        action === 'peringatan1' ||
        action === 'peringatan2';

      const lockKey = `${activeMatch.id}:${corner}:${action}`;
      if (isSingleUsePenalty) {
        if (pendingPenaltyKeysRef.current.has(lockKey)) return;

        const isBlue = corner === 'blue';
        const binaanCount = isBlue ? activeMatch.blueBinaan : activeMatch.redBinaan;
        const teguran1Count = isBlue ? activeMatch.blueTeguran1 : activeMatch.redTeguran1;
        const teguran2Count = isBlue ? activeMatch.blueTeguran2 : activeMatch.redTeguran2;
        const peringatanCount = isBlue ? activeMatch.bluePeringatan : activeMatch.redPeringatan;
        const hasBinaanEvents = events.some(
          (ev) => !ev.undone && ev.corner === corner && (ev.type === 'binaan1' || ev.type === 'binaan2' || ev.type === 'binaan')
        );

        const alreadyApplied =
          (action === 'binaan1' &&
            (hasBinaanEvents
              ? events.some((ev) => !ev.undone && ev.corner === corner && (ev.type === 'binaan1' || ev.type === 'binaan'))
              : binaanCount >= 1)) ||
          (action === 'binaan2' &&
            (hasBinaanEvents
              ? events.some((ev) => !ev.undone && ev.corner === corner && ev.type === 'binaan2')
              : binaanCount >= 2)) ||
          (action === 'teguran1' &&
            (teguran1Count > 0 || events.some((ev) => !ev.undone && ev.corner === corner && ev.type === 'teguran1'))) ||
          (action === 'teguran2' &&
            (teguran2Count > 0 || events.some((ev) => !ev.undone && ev.corner === corner && ev.type === 'teguran2'))) ||
          (action === 'peringatan1' &&
            (peringatanCount >= 1 || events.some((ev) => !ev.undone && ev.corner === corner && ev.type === 'peringatan1'))) ||
          (action === 'peringatan2' &&
            (peringatanCount >= 2 || events.some((ev) => !ev.undone && ev.corner === corner && ev.type === 'peringatan2')));

        if (alreadyApplied) return;
        pendingPenaltyKeysRef.current.add(lockKey);
      }

      try {
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
              user?.uid || prev.arena.ownerId,
              prev.athletes || []
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
                user?.uid || cloudArena.ownerId,
                athletes
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
      } finally {
        if (isSingleUsePenalty) {
          pendingPenaltyKeysRef.current.delete(lockKey);
        }
      }
    },
    [activeMatch, events, brackets, matches, athletes, mode, cloudArena, user, commitLocalStore, executeFirestoreWithFallback, recordEvent]
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
            user?.uid || prev.arena.ownerId,
            prev.athletes || []
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
            user?.uid || cloudArena.ownerId,
            athletes
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
    [activeMatch, brackets, matches, athletes, mode, cloudArena, user, commitLocalStore, executeFirestoreWithFallback, recordEvent]
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
    if (activeMatch.status === 'break' && activeMatch.timerStartedAtMs <= 0) return;
    const nowMs = Date.now();
    const rem = getRemainingTimerMs(activeMatch, nowMs);
    const patch: Partial<MatchData> = {
      status: activeMatch.status === 'break' ? 'break' : 'paused',
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
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
      const summary = computeCornerJurusSummary(jurusType, nextState[performer], jurusJudgeCount);
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
      juriLocked: false,
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
    autoBreakMatchRef.current = null;

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
        juriLocked: false,
      };
      gongFiredForRoundRef.current = null;
      autoFinishedMatchRef.current = null;
      autoBreakMatchRef.current = null;

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

  useEffect(() => {
    startBreakTimerRef.current = startBreakTimer;
  }, [startBreakTimer]);

  const resumeBreakTimer = useCallback(async () => {
    if (activeMatch.status === 'finished') return;
    const rem = getRemainingTimerMs(activeMatch, Date.now());
    const nextRemaining = rem > 0 ? rem : 60000;
    const patch: Partial<MatchData> = {
      status: 'break',
      timerRemainingMs: nextRemaining,
      timerStartedAtMs: Date.now(),
    };
    if (rem <= 0) {
      gongFiredForRoundRef.current = null;
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

  const resetBreakTimer = useCallback(async () => {
    if (activeMatch.status === 'finished') return;
    const keepRunning = activeMatch.status === 'break' && activeMatch.timerStartedAtMs > 0;
    const patch: Partial<MatchData> = {
      status: 'break',
      timerRemainingMs: 60000,
      timerStartedAtMs: keepRunning ? Date.now() : 0,
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
  }, [activeMatch, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]);

  const toggleJuriLock = useCallback(
    async (locked?: boolean) => {
      if (activeMatch.status === 'finished') return;
      const nextLocked = typeof locked === 'boolean' ? locked : !Boolean(activeMatch.juriLocked);
      const patch: Partial<MatchData> = {
        juriLocked: nextLocked,
      };

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
    [activeMatch.id, activeMatch.status, activeMatch.juriLocked, mode, cloudArena, commitLocalStore, executeFirestoreWithFallback]
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
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
      const summary = computeCornerJurusSummary(jurusType, jState[corner], jurusJudgeCount);
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
      judgeId: JurusJudgeId,
      corner: Corner,
      mutator: (prevScore: JurusJudgeCornerScore) => JurusJudgeCornerScore,
      eventMeta?: { type: string; pointsDelta: number; description: string }
    ) => {
      if (activeMatch.status === 'finished') return;
      const jurusType = getJurusType(activeMatch);
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
      const jState = ensureJurusState(activeMatch);
      const judgeKey = getJurusJudgeKey(judgeId);
      const prevScore = getJurusJudgeScore(jState[corner], judgeId);

      const nextJudgeScore = mutator(prevScore);
      const nextCornerData: JurusCornerData = {
        ...jState[corner],
        [judgeKey]: nextJudgeScore,
      };
      const nextState: JurusMatchState = {
        ...jState,
        [corner]: nextCornerData,
      };
      const summary = computeCornerJurusSummary(jurusType, nextCornerData, jurusJudgeCount);
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
    async (judgeId: JurusJudgeId, corner: Corner, delta: 1 | -1) => {
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
    async (judgeId: JurusJudgeId, corner: Corner, valueHundredths: number) => {
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
      judgeId: JurusJudgeId,
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
    async (judgeId: JurusJudgeId, corner: Corner) => {
      const jurusType = getJurusType(activeMatch);
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
      const jState = ensureJurusState(activeMatch);
      const judgeKey = getJurusJudgeKey(judgeId);
      const prevJudgeScore = getJurusJudgeScore(jState[corner], judgeId);
      const willSubmit = !prevJudgeScore.submitted;
      const summaryAfter = computeCornerJurusSummary(
        jurusType,
        {
          ...jState[corner],
          [judgeKey]: { ...prevJudgeScore, submitted: willSubmit },
        },
        jurusJudgeCount
      );
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
            ? `Juri ${judgeId} Kunci Nilai ${cornerLabel}: ${formatJurusScore(summaryAfter.judgeTotals[jIdx] ?? 0)}`
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
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
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
      const summary = computeCornerJurusSummary(jurusType, nextCornerData, jurusJudgeCount);
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
      const jurusJudgeCount = getJurusJudgeCount(activeMatch);
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
      const currentSummary = computeCornerJurusSummary(jurusType, nextState[performer], jurusJudgeCount);
      const nextSummary = computeCornerJurusSummary(jurusType, nextState[targetNext], jurusJudgeCount);

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
        country: input.country?.trim() ? input.country.trim().slice(0, 64) : 'IDN',
        ...(input.photo?.trim() ? { photo: input.photo.trim().slice(0, 250000) } : {}),
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

  const buildMatchProfileSyncOps = useCallback(
    (
      athlete: AthleteData,
      prevName?: string,
      prevContingent?: string
    ): {
      matchPatches: Map<string, Partial<MatchData>>;
    } => {
      const matchPatches = new Map<string, Partial<MatchData>>();
      const namesToMatch = new Set<string>(
        [athlete.name, prevName || ''].map((n) => n.trim().toLowerCase()).filter(Boolean)
      );
      const contsToMatch = new Set<string>(
        [athlete.contingent, prevContingent || '']
          .map((c) => c.trim().toLowerCase())
          .filter((c) => Boolean(c) && c !== '-')
      );

      const doesCornerMatch = (cornerName: string, cornerCont: string): boolean => {
        const cn = cornerName.trim().toLowerCase();
        if (!cn || !namesToMatch.has(cn)) return false;
        const cc = cornerCont.trim().toLowerCase();
        if (!cc || cc === '-' || contsToMatch.size === 0) return true;
        return contsToMatch.has(cc);
      };

      const nextCountry = athlete.country?.trim().slice(0, 64) || 'IDN';
      const nextPhoto = (athlete.photo || '').trim().slice(0, 250000);

      for (const m of matches) {
        if (m.status === 'finished') continue;
        const patch: Partial<MatchData> = {};
        if (doesCornerMatch(m.blueName, m.blueContingent)) {
          patch.blueName = athlete.name;
          patch.blueContingent = athlete.contingent;
          patch.blueCountry = nextCountry;
          patch.bluePhoto = nextPhoto;
        }
        if (doesCornerMatch(m.redName, m.redContingent)) {
          patch.redName = athlete.name;
          patch.redContingent = athlete.contingent;
          patch.redCountry = nextCountry;
          patch.redPhoto = nextPhoto;
        }
        if (Object.keys(patch).length > 0) {
          matchPatches.set(m.id, patch);
        }
      }

      return { matchPatches };
    },
    [matches]
  );

  const addAthlete = useCallback(
    async (input: AddAthleteInput) => {
      const newAthlete = buildAthleteRecord(input);
      const { matchPatches } = buildMatchProfileSyncOps(newAthlete);

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        athletes: [...(prev.athletes || []), newAthlete],
        matches:
          matchPatches.size > 0
            ? prev.matches.map((m) => {
                const p = matchPatches.get(m.id);
                return p ? { ...m, ...p } : m;
              })
            : prev.matches,
      });

      if (mode === 'firebase' && cloudArena && user) {
        const ops: QueuedOpInput[] = [
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
              country: newAthlete.country || 'IDN',
              photo: newAthlete.photo || '',
              weightClass: newAthlete.weightClass,
              gender: newAthlete.gender,
              ageCategory: newAthlete.ageCategory,
              competitionCategory: newAthlete.competitionCategory,
              gelanggang: newAthlete.gelanggang,
            },
          },
        ];
        for (const [mId, patch] of matchPatches.entries()) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', mId],
            timestampMode: 'update',
            data: { ...patch },
          });
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [buildAthleteRecord, buildMatchProfileSyncOps, mode, cloudArena, user, executeFirestoreWithFallback, commitLocalStore]
  );

  const updateAthlete = useCallback(
    async (athleteId: string, input: Partial<AddAthleteInput>) => {
      const existingAth = athletes.find((a) => a.id === athleteId);
      if (!existingAth) return;

      const updatedAth: AthleteData = {
        ...existingAth,
        name: input.name !== undefined ? clampStr(input.name, 80, existingAth.name) : existingAth.name,
        contingent:
          input.contingent !== undefined
            ? clampStr(input.contingent, 80, existingAth.contingent)
            : existingAth.contingent,
        country:
          input.country !== undefined
            ? input.country.trim().slice(0, 64) || 'IDN'
            : existingAth.country || 'IDN',
        photo:
          input.photo !== undefined
            ? input.photo.trim().slice(0, 250000)
            : existingAth.photo || '',
        weightClass:
          input.weightClass !== undefined
            ? clampStr(input.weightClass, 80, existingAth.weightClass)
            : existingAth.weightClass,
        gender: input.gender ?? existingAth.gender,
        ageCategory: input.ageCategory ?? existingAth.ageCategory ?? 'Dewasa',
        competitionCategory: input.competitionCategory ?? existingAth.competitionCategory ?? 'Tanding',
        gelanggang: input.gelanggang ?? existingAth.gelanggang ?? 'A',
      };

      const { matchPatches } = buildMatchProfileSyncOps(
        updatedAth,
        existingAth.name,
        existingAth.contingent
      );

      const localUpdater = (prev: LocalStorePayload): LocalStorePayload => ({
        ...prev,
        athletes: (prev.athletes || []).map((a) => (a.id === athleteId ? updatedAth : a)),
        matches:
          matchPatches.size > 0
            ? prev.matches.map((m) => {
                const p = matchPatches.get(m.id);
                return p ? { ...m, ...p } : m;
              })
            : prev.matches,
      });

      if (mode === 'firebase' && cloudArena) {
        const ops: QueuedOpInput[] = [
          {
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'athletes', athleteId],
            timestampMode: 'none',
            data: {
              name: updatedAth.name,
              contingent: updatedAth.contingent,
              country: updatedAth.country || 'IDN',
              photo: updatedAth.photo || '',
              weightClass: updatedAth.weightClass,
              gender: updatedAth.gender,
              ageCategory: updatedAth.ageCategory || 'Dewasa',
              competitionCategory: updatedAth.competitionCategory || 'Tanding',
              gelanggang: updatedAth.gelanggang || 'A',
            },
          },
        ];
        for (const [mId, patch] of matchPatches.entries()) {
          ops.push({
            opType: 'update',
            pathSegments: ['arenas', cloudArena.id, 'matches', mId],
            timestampMode: 'update',
            data: { ...patch },
          });
        }
        await executeFirestoreWithFallback(cloudArena.id, ops, localUpdater);
      } else {
        commitLocalStore(localUpdater);
      }
    },
    [athletes, buildMatchProfileSyncOps, mode, cloudArena, executeFirestoreWithFallback, commitLocalStore]
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
            country: ath.country || 'IDN',
            photo: ath.photo || '',
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
            String(createdMatches.length + 1),
            athletes
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
        'act',
        athletes
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
            'br',
            athletes
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
    pendingSyncCount: effectivePendingSyncCount,
    retrySyncNow,
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
    setMatchJurusJudgeCount,
    setMatchRoundDuration,
    applyLotingMatchAssignments,
    deleteMatch,
    resetMatch,
    resetSystem,
    exportArenaBackup,
    importArenaBackup,
    addAthlete,
    updateAthlete,
    importAthletes,
    deleteAthlete,
    clearAthletes,
    generateBracket,
    activateBracketMatch,
    advanceBracketWinner,
    clearBracket,
    sendJudgeVote,
    clearJudgeVote,
    undoLastJudgeInput,
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
    resumeBreakTimer,
    resetBreakTimer,
    toggleJuriLock,
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
