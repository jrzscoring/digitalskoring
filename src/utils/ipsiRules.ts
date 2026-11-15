import type {
  Corner,
  DewanActionType,
  JudgeId,
  JudgeVote,
  JurusCategory,
  JurusCornerData,
  JurusCornerPenalties,
  JurusJudgeCornerScore,
  JurusMatchState,
  JurusPenaltyType,
  MatchData,
  VerificationKind,
  VerificationState,
  VerificationVoteValue,
} from '../types/silat';

export const PUNCH_POINTS = 1;
export const KICK_POINTS = 2;
export const FALL_POINTS = 3;

export const JURUS_TUNGGAL_REGU_BASE = 990; // 9.90 in hundredths
export const JURUS_GANDA_BEBAS_BASE = 910; // 9.10 in hundredths
export const JURUS_PENALTY_HUNDREDTHS = 50; // -0.50 per violation
export const JURUS_DEFAULT_DURATION_SEC = 180; // 03:00 standard IPSI performance duration

export const JURUS_PENALTY_LABELS: Record<JurusPenaltyType, string> = {
  timeViolation: 'Pelanggaran Waktu (±5 dtk)',
  outOfBounds: 'Keluar Gelanggang (10m)',
  weaponDrop: 'Senjata Jatuh / Tidak Sesuai',
  attireViolation: 'Pakaian / Aksesoris Jatuh',
  stopOrDelay: 'Berhenti / Terlambat >5 dtk',
};

export const TEGURAN_1_PENALTY = -1;
export const TEGURAN_2_PENALTY = -2;
export const PERINGATAN_1_PENALTY = -5;
export const PERINGATAN_2_PENALTY = -10;

export const CONSENSUS_WINDOW_MS = 1800;
export const CONSENSUS_DEBOUNCE_MS = 800;

export interface ConsensusResult {
  updatedVotes: {
    judge1Vote?: JudgeVote;
    judge2Vote?: JudgeVote;
    judge3Vote?: JudgeVote;
  };
  consensusAwarded: {
    corner: Corner;
    points: 1 | 2;
    judges: JudgeId[];
  } | null;
}

export function evaluateJudgeConsensus(
  currentVotes: {
    judge1Vote?: JudgeVote;
    judge2Vote?: JudgeVote;
    judge3Vote?: JudgeVote;
  },
  incoming: {
    judgeId: JudgeId;
    corner: Corner;
    points: 1 | 2;
    timestampMs: number;
    round: number;
  },
  windowMs: number = CONSENSUS_WINDOW_MS
): ConsensusResult {
  const votesMap: Record<JudgeId, JudgeVote | undefined> = {
    1: currentVotes.judge1Vote ? { ...currentVotes.judge1Vote } : undefined,
    2: currentVotes.judge2Vote ? { ...currentVotes.judge2Vote } : undefined,
    3: currentVotes.judge3Vote ? { ...currentVotes.judge3Vote } : undefined,
  };

  // Check if another judge already confirmed this exact strike very recently (debounce 3rd judge late tap)
  const recentlyConfirmedByOther = ([1, 2, 3] as JudgeId[]).some((jid) => {
    if (jid === incoming.judgeId) return false;
    const v = votesMap[jid];
    return (
      v &&
      v.confirmed === true &&
      v.corner === incoming.corner &&
      v.points === incoming.points &&
      v.round === incoming.round &&
      incoming.timestampMs - v.timestampMs <= CONSENSUS_DEBOUNCE_MS
    );
  });

  if (recentlyConfirmedByOther) {
    votesMap[incoming.judgeId] = {
      corner: incoming.corner,
      points: incoming.points,
      timestampMs: incoming.timestampMs,
      round: incoming.round,
      confirmed: true,
    };
    return {
      updatedVotes: {
        judge1Vote: votesMap[1],
        judge2Vote: votesMap[2],
        judge3Vote: votesMap[3],
      },
      consensusAwarded: null,
    };
  }

  votesMap[incoming.judgeId] = {
    corner: incoming.corner,
    points: incoming.points,
    timestampMs: incoming.timestampMs,
    round: incoming.round,
    confirmed: false,
  };

  const matchingUnconfirmedJudges: JudgeId[] = ([1, 2, 3] as JudgeId[]).filter((jid) => {
    const v = votesMap[jid];
    if (!v || v.confirmed) return false;
    return (
      v.corner === incoming.corner &&
      v.points === incoming.points &&
      v.round === incoming.round &&
      Math.abs(incoming.timestampMs - v.timestampMs) <= windowMs
    );
  });

  if (matchingUnconfirmedJudges.length >= 2) {
    for (const jid of matchingUnconfirmedJudges) {
      const existing = votesMap[jid];
      if (existing) {
        votesMap[jid] = { ...existing, confirmed: true };
      }
    }
    return {
      updatedVotes: {
        judge1Vote: votesMap[1],
        judge2Vote: votesMap[2],
        judge3Vote: votesMap[3],
      },
      consensusAwarded: {
        corner: incoming.corner,
        points: incoming.points,
        judges: matchingUnconfirmedJudges,
      },
    };
  }

  return {
    updatedVotes: {
      judge1Vote: votesMap[1],
      judge2Vote: votesMap[2],
      judge3Vote: votesMap[3],
    },
    consensusAwarded: null,
  };
}

export interface DewanActionResult {
  patch: Partial<MatchData>;
  pointsDelta: number;
  description: string;
  autoDisqualified: boolean;
}

export function applyDewanAction(
  match: MatchData,
  action: DewanActionType,
  corner: Corner
): DewanActionResult {
  const isBlue = corner === 'blue';
  const cornerLabel = isBlue ? 'Sudut Biru' : 'Sudut Merah';
  const opponent: Corner = isBlue ? 'red' : 'blue';

  switch (action) {
    case 'fall': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const fallsKey = isBlue ? 'blueFalls' : 'redFalls';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + FALL_POINTS,
          [fallsKey]: match[fallsKey] + 1,
        },
        pointsDelta: FALL_POINTS,
        description: `Jatuhan Sah (+3) untuk ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'cancel_fall': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const fallsKey = isBlue ? 'blueFalls' : 'redFalls';
      const hasFall = match[fallsKey] > 0;
      if (!hasFall) {
        return {
          patch: {},
          pointsDelta: 0,
          description: `Jatuhan Batal (0) untuk ${cornerLabel}`,
          autoDisqualified: false,
        };
      }
      return {
        patch: {
          [scoreKey]: match[scoreKey] - FALL_POINTS,
          [fallsKey]: Math.max(0, match[fallsKey] - 1),
        },
        pointsDelta: -FALL_POINTS,
        description: `Jatuhan Batal (-3) untuk ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'binaan': {
      const binaanKey = isBlue ? 'blueBinaan' : 'redBinaan';
      const nextCount = match[binaanKey] + 1;
      const roman = nextCount === 1 ? 'I' : nextCount === 2 ? 'II' : `${nextCount}`;
      return {
        patch: {
          [binaanKey]: nextCount,
        },
        pointsDelta: 0,
        description: `Binaan ${roman} (0) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'binaan1': {
      const binaanKey = isBlue ? 'blueBinaan' : 'redBinaan';
      return {
        patch: {
          [binaanKey]: match[binaanKey] + 1,
        },
        pointsDelta: 0,
        description: `Binaan 1 (0) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'binaan2': {
      const binaanKey = isBlue ? 'blueBinaan' : 'redBinaan';
      return {
        patch: {
          [binaanKey]: match[binaanKey] + 1,
        },
        pointsDelta: 0,
        description: `Binaan 2 (0) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'teguran1': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const key = isBlue ? 'blueTeguran1' : 'redTeguran1';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + TEGURAN_1_PENALTY,
          [key]: match[key] + 1,
        },
        pointsDelta: TEGURAN_1_PENALTY,
        description: `Teguran 1 (-1) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'teguran2': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const key = isBlue ? 'blueTeguran2' : 'redTeguran2';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + TEGURAN_2_PENALTY,
          [key]: match[key] + 1,
        },
        pointsDelta: TEGURAN_2_PENALTY,
        description: `Teguran 2 (-2) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'peringatan1': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const key = isBlue ? 'bluePeringatan' : 'redPeringatan';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + PERINGATAN_1_PENALTY,
          [key]: Math.max(match[key], 1),
        },
        pointsDelta: PERINGATAN_1_PENALTY,
        description: `Peringatan 1 (-5) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'peringatan2': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const key = isBlue ? 'bluePeringatan' : 'redPeringatan';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + PERINGATAN_2_PENALTY,
          [key]: Math.max(match[key], 2),
        },
        pointsDelta: PERINGATAN_2_PENALTY,
        description: `Peringatan 2 (-10) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'peringatan3':
    case 'disq': {
      const key = isBlue ? 'bluePeringatan' : 'redPeringatan';
      return {
        patch: {
          [key]: 3,
          status: 'finished',
          winner: opponent,
          winMethod: action === 'disq' ? 'Menang Diskualifikasi' : 'Menang Diskualifikasi (Peringatan III)',
          timerStartedAtMs: 0,
        },
        pointsDelta: 0,
        description:
          action === 'disq'
            ? `Diskualifikasi (Disq) — ${cornerLabel} Didiskualifikasi`
            : `Peringatan III — ${cornerLabel} Diskualifikasi`,
        autoDisqualified: true,
      };
    }
  }
}

export function getPenaltyWeight(match: MatchData, corner: Corner): number {
  const t1 = corner === 'blue' ? match.blueTeguran1 : match.redTeguran1;
  const t2 = corner === 'blue' ? match.blueTeguran2 : match.redTeguran2;
  const p = corner === 'blue' ? match.bluePeringatan : match.redPeringatan;
  const pPoints = p >= 2 ? 15 : p === 1 ? 5 : 0;
  return t1 * 1 + t2 * 2 + pPoints;
}

export interface WinnerDecision {
  winner: Corner | 'draw';
  winMethod: string;
  reason: string;
}

export function isJurusMatch(match?: Partial<MatchData> | null): boolean {
  if (!match) return false;
  if (match.competitionCategory === 'Jurus') return true;
  if (match.jurusType) return true;
  const wc = (match.weightClass || '').toLowerCase();
  return (
    wc.includes('tunggal') ||
    wc.includes('ganda') ||
    wc.includes('regu') ||
    wc.includes('jurus') ||
    wc.includes('tgr')
  );
}

export function normalizeJurusType(raw?: string): JurusCategory {
  const v = (raw || '').trim().toLowerCase();
  if (v.includes('tunggal bebas') || v.includes('bebas')) return 'Tunggal Bebas';
  if (v.includes('ganda')) return 'Ganda';
  if (v.includes('regu')) return 'Regu';
  return 'Tunggal Baku';
}

export function getJurusType(match?: Partial<MatchData> | null): JurusCategory {
  if (match?.jurusType) return match.jurusType;
  return normalizeJurusType(match?.weightClass);
}

export function isTunggalOrRegu(jurusType: JurusCategory): boolean {
  return jurusType === 'Tunggal Baku' || jurusType === 'Regu';
}

export function createEmptyJurusJudgeScore(): JurusJudgeCornerScore {
  return {
    wrongMoves: 0,
    staminaScore: 0,
    attackScore: 0,
    harmonyScore: 0,
    soulScore: 0,
    submitted: false,
  };
}

export function createEmptyJurusPenalties(): JurusCornerPenalties {
  return {
    timeViolation: 0,
    outOfBounds: 0,
    weaponDrop: 0,
    attireViolation: 0,
    stopOrDelay: 0,
  };
}

export function createEmptyJurusCornerData(): JurusCornerData {
  return {
    judge1: createEmptyJurusJudgeScore(),
    judge2: createEmptyJurusJudgeScore(),
    judge3: createEmptyJurusJudgeScore(),
    penalties: createEmptyJurusPenalties(),
    recordedElapsedMs: 0,
    completed: false,
  };
}

export function createInitialJurusState(): JurusMatchState {
  return {
    blue: createEmptyJurusCornerData(),
    red: createEmptyJurusCornerData(),
  };
}

function normalizeCornerData(raw?: Partial<JurusCornerData>): JurusCornerData {
  const empty = createEmptyJurusCornerData();
  if (!raw) return empty;
  return {
    judge1: { ...empty.judge1, ...(raw.judge1 || {}) },
    judge2: { ...empty.judge2, ...(raw.judge2 || {}) },
    judge3: { ...empty.judge3, ...(raw.judge3 || {}) },
    penalties: { ...empty.penalties, ...(raw.penalties || {}) },
    recordedElapsedMs: typeof raw.recordedElapsedMs === 'number' ? raw.recordedElapsedMs : 0,
    completed: Boolean(raw.completed),
  };
}

export function ensureJurusState(match?: Partial<MatchData> | null): JurusMatchState {
  const raw = match?.jurusState;
  return {
    blue: normalizeCornerData(raw?.blue),
    red: normalizeCornerData(raw?.red),
  };
}

export function hasJurusCornerActivity(cornerData: JurusCornerData): boolean {
  if (cornerData.completed || cornerData.recordedElapsedMs > 0) return true;
  const judges = [cornerData.judge1, cornerData.judge2, cornerData.judge3];
  for (const j of judges) {
    if (
      j.submitted ||
      j.wrongMoves > 0 ||
      j.staminaScore > 0 ||
      j.attackScore > 0 ||
      j.harmonyScore > 0 ||
      j.soulScore > 0
    ) {
      return true;
    }
  }
  const p = cornerData.penalties;
  return (
    p.timeViolation + p.outOfBounds + p.weaponDrop + p.attireViolation + p.stopOrDelay > 0
  );
}

export function computeJudgeCornerScore(
  jurusType: JurusCategory,
  score: JurusJudgeCornerScore
): number {
  if (isTunggalOrRegu(jurusType)) {
    const raw = JURUS_TUNGGAL_REGU_BASE - Math.max(0, score.wrongMoves) + Math.min(10, Math.max(0, score.staminaScore));
    return Math.max(0, Math.min(1000, raw));
  }
  const creative =
    Math.min(30, Math.max(0, score.attackScore)) +
    Math.min(30, Math.max(0, score.harmonyScore)) +
    Math.min(30, Math.max(0, score.soulScore));
  return Math.max(0, Math.min(1000, JURUS_GANDA_BEBAS_BASE + creative));
}

export interface JurusCornerSummary {
  judgeTotals: [number, number, number];
  median: number;
  mean: number;
  stdDev: number;
  penaltyCount: number;
  penaltyTotal: number;
  finalScore: number;
}

export function computeCornerJurusSummary(
  jurusType: JurusCategory,
  cornerData: JurusCornerData
): JurusCornerSummary {
  const j1 = computeJudgeCornerScore(jurusType, cornerData.judge1);
  const j2 = computeJudgeCornerScore(jurusType, cornerData.judge2);
  const j3 = computeJudgeCornerScore(jurusType, cornerData.judge3);
  const sorted = [j1, j2, j3].sort((a, b) => a - b);
  const median = sorted[1];
  const mean = (j1 + j2 + j3) / 3;
  const variance = ((j1 - mean) ** 2 + (j2 - mean) ** 2 + (j3 - mean) ** 2) / 3;
  const stdDev = Math.sqrt(variance);

  const p = cornerData.penalties;
  const penaltyCount =
    Math.max(0, p.timeViolation) +
    Math.max(0, p.outOfBounds) +
    Math.max(0, p.weaponDrop) +
    Math.max(0, p.attireViolation) +
    Math.max(0, p.stopOrDelay);
  const penaltyTotal = penaltyCount * JURUS_PENALTY_HUNDREDTHS;
  const finalScore = Math.max(0, median - penaltyTotal);

  return {
    judgeTotals: [j1, j2, j3],
    median,
    mean,
    stdDev,
    penaltyCount,
    penaltyTotal,
    finalScore,
  };
}

export function formatJurusScore(hundredths: number): string {
  return (Math.max(0, hundredths) / 100).toFixed(2);
}

export function formatMatchScore(match: Partial<MatchData>, corner: Corner): string {
  const raw = corner === 'blue' ? (match.blueScore ?? 0) : (match.redScore ?? 0);
  if (isJurusMatch(match)) {
    return formatJurusScore(raw);
  }
  return String(raw);
}

export function formatJurusElapsedMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const tenthsTotal = Math.floor(clamped / 100);
  const tenths = tenthsTotal % 10;
  const totalSec = Math.floor(tenthsTotal / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export function determineOfficialWinner(match: MatchData): WinnerDecision {
  if (match.bluePeringatan >= 3) {
    return {
      winner: 'red',
      winMethod: 'Menang Diskualifikasi (Peringatan III)',
      reason: 'Sudut Biru menerima Peringatan III (Diskualifikasi)',
    };
  }
  if (match.redPeringatan >= 3) {
    return {
      winner: 'blue',
      winMethod: 'Menang Diskualifikasi (Peringatan III)',
      reason: 'Sudut Merah menerima Peringatan III (Diskualifikasi)',
    };
  }

  if (isJurusMatch(match)) {
    const jurusType = getJurusType(match);
    const jState = ensureJurusState(match);
    const blueSummary = computeCornerJurusSummary(jurusType, jState.blue);
    const redSummary = computeCornerJurusSummary(jurusType, jState.red);

    const blueVal = match.blueScore > 0 || hasJurusCornerActivity(jState.blue) ? match.blueScore || blueSummary.finalScore : 0;
    const redVal = match.redScore > 0 || hasJurusCornerActivity(jState.red) ? match.redScore || redSummary.finalScore : 0;

    if (blueVal !== redVal) {
      const winner: Corner = blueVal > redVal ? 'blue' : 'red';
      return {
        winner,
        winMethod: 'Menang Angka',
        reason: `Unggul nilai akhir ${jurusType} (${formatJurusScore(blueVal)} vs ${formatJurusScore(redVal)})`,
      };
    }

    // IPSI Jurus Tie-breaker 1: Fewer Dewan penalties
    if (blueSummary.penaltyCount !== redSummary.penaltyCount) {
      const winner: Corner = blueSummary.penaltyCount < redSummary.penaltyCount ? 'blue' : 'red';
      return {
        winner,
        winMethod: 'Menang Angka',
        reason: `Seri nilai akhir — unggul potongan Dewan lebih sedikit (${blueSummary.penaltyCount} vs ${redSummary.penaltyCount})`,
      };
    }

    // Tie-breaker 2: Higher Median score
    if (blueSummary.median !== redSummary.median) {
      const winner: Corner = blueSummary.median > redSummary.median ? 'blue' : 'red';
      return {
        winner,
        winMethod: 'Menang Angka',
        reason: `Seri nilai akhir — unggul median juri (${formatJurusScore(blueSummary.median)} vs ${formatJurusScore(redSummary.median)})`,
      };
    }

    // Tie-breaker 3: Higher Mean judge score
    if (Math.abs(blueSummary.mean - redSummary.mean) > 0.001) {
      const winner: Corner = blueSummary.mean > redSummary.mean ? 'blue' : 'red';
      return {
        winner,
        winMethod: 'Menang Angka',
        reason: `Seri nilai akhir — unggul rata-rata juri (${(blueSummary.mean / 100).toFixed(3)} vs ${(redSummary.mean / 100).toFixed(3)})`,
      };
    }

    // Tie-breaker 4: Lower Standard Deviation (consistency across judges)
    if (Math.abs(blueSummary.stdDev - redSummary.stdDev) > 0.001) {
      const winner: Corner = blueSummary.stdDev < redSummary.stdDev ? 'blue' : 'red';
      return {
        winner,
        winMethod: 'Menang Angka',
        reason: `Seri nilai akhir — unggul standar deviasi lebih kecil (${(blueSummary.stdDev / 100).toFixed(3)} vs ${(redSummary.stdDev / 100).toFixed(3)})`,
      };
    }

    return {
      winner: 'draw',
      winMethod: 'Seri',
      reason: 'Nilai akhir, potongan Dewan, median, dan deviasi juri seimbang',
    };
  }

  if (match.blueScore !== match.redScore) {
    const winner: Corner = match.blueScore > match.redScore ? 'blue' : 'red';
    return {
      winner,
      winMethod: 'Menang Angka',
      reason: `Unggul poin (${match.blueScore} vs ${match.redScore})`,
    };
  }

  // Tie-breaker 1: Fewer penalty deductions
  const bluePen = getPenaltyWeight(match, 'blue');
  const redPen = getPenaltyWeight(match, 'red');
  if (bluePen !== redPen) {
    const winner: Corner = bluePen < redPen ? 'blue' : 'red';
    return {
      winner,
      winMethod: 'Menang Angka',
      reason: `Seri poin — unggul pelanggaran lebih sedikit (${bluePen} vs ${redPen})`,
    };
  }

  // Tie-breaker 2: More Jatuhan (+3)
  if (match.blueFalls !== match.redFalls) {
    const winner: Corner = match.blueFalls > match.redFalls ? 'blue' : 'red';
    return {
      winner,
      winMethod: 'Menang Angka',
      reason: `Seri poin — unggul jumlah Jatuhan (${match.blueFalls} vs ${match.redFalls})`,
    };
  }

  // Tie-breaker 3: More Tendangan (+2)
  if (match.blueKicks !== match.redKicks) {
    const winner: Corner = match.blueKicks > match.redKicks ? 'blue' : 'red';
    return {
      winner,
      winMethod: 'Menang Angka',
      reason: `Seri poin — unggul jumlah Tendangan (${match.blueKicks} vs ${match.redKicks})`,
    };
  }

  // Tie-breaker 4: More Pukulan (+1)
  if (match.bluePunches !== match.redPunches) {
    const winner: Corner = match.bluePunches > match.redPunches ? 'blue' : 'red';
    return {
      winner,
      winMethod: 'Menang Angka',
      reason: `Seri poin — unggul jumlah Pukulan (${match.bluePunches} vs ${match.redPunches})`,
    };
  }

  return {
    winner: 'draw',
    winMethod: 'Seri',
    reason: 'Skor, pelanggaran, dan seluruh teknik seimbang',
  };
}

export function getRemainingTimerMs(match: MatchData, nowMs: number = Date.now()): number {
  if ((match.status === 'active' || match.status === 'break') && match.timerStartedAtMs > 0) {
    const elapsed = Math.max(0, nowMs - match.timerStartedAtMs);
    return Math.max(0, match.timerRemainingMs - elapsed);
  }
  return Math.max(0, match.timerRemainingMs);
}

export function formatMatchTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createVerificationState(
  kind: VerificationKind,
  active: boolean = true,
  requestedAtMs: number = Date.now()
): VerificationState {
  return {
    active,
    kind,
    requestedAtMs,
    j1Vote: 'none',
    j2Vote: 'none',
    j3Vote: 'none',
  };
}

export interface VerificationConsensusSummary {
  votedCount: number;
  blueCount: number;
  redCount: number;
  invalidCount: number;
  consensus: 'blue' | 'red' | 'invalid' | 'split' | 'waiting';
  hasConsensus: boolean;
  allVoted: boolean;
  canProcess: boolean;
  label: string;
}

export function evaluateVerificationConsensus(
  verification?: Partial<VerificationState> | null
): VerificationConsensusSummary {
  const votes: VerificationVoteValue[] = [
    verification?.j1Vote || 'none',
    verification?.j2Vote || 'none',
    verification?.j3Vote || 'none',
  ];

  let blueCount = 0;
  let redCount = 0;
  let invalidCount = 0;
  for (const v of votes) {
    if (v === 'blue') blueCount += 1;
    else if (v === 'red') redCount += 1;
    else if (v === 'invalid') invalidCount += 1;
  }

  const votedCount = blueCount + redCount + invalidCount;
  const allVoted = votedCount === 3;

  if (blueCount >= 2) {
    return {
      votedCount,
      blueCount,
      redCount,
      invalidCount,
      consensus: 'blue',
      hasConsensus: true,
      allVoted,
      canProcess: true,
      label: 'SAH BIRU',
    };
  }
  if (redCount >= 2) {
    return {
      votedCount,
      blueCount,
      redCount,
      invalidCount,
      consensus: 'red',
      hasConsensus: true,
      allVoted,
      canProcess: true,
      label: 'SAH MERAH',
    };
  }
  if (invalidCount >= 2) {
    return {
      votedCount,
      blueCount,
      redCount,
      invalidCount,
      consensus: 'invalid',
      hasConsensus: true,
      allVoted,
      canProcess: true,
      label: 'TIDAK SAH',
    };
  }
  if (allVoted) {
    return {
      votedCount,
      blueCount,
      redCount,
      invalidCount,
      consensus: 'split',
      hasConsensus: false,
      allVoted: true,
      canProcess: true,
      label: 'TIDAK SEPAKAT (TIDAK SAH)',
    };
  }

  return {
    votedCount,
    blueCount,
    redCount,
    invalidCount,
    consensus: 'waiting',
    hasConsensus: false,
    allVoted: false,
    canProcess: false,
    label: 'MENUNGGU...',
  };
}

