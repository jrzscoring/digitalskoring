import type { Corner, DewanActionType, JudgeId, JudgeVote, MatchData } from '../types/silat';

export const PUNCH_POINTS = 1;
export const KICK_POINTS = 2;
export const FALL_POINTS = 3;

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
    case 'teguran1': {
      const scoreKey = isBlue ? 'blueScore' : 'redScore';
      const key = isBlue ? 'blueTeguran1' : 'redTeguran1';
      return {
        patch: {
          [scoreKey]: match[scoreKey] + TEGURAN_1_PENALTY,
          [key]: match[key] + 1,
        },
        pointsDelta: TEGURAN_1_PENALTY,
        description: `Teguran I (-1) kepada ${cornerLabel}`,
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
        description: `Teguran II (-2) kepada ${cornerLabel}`,
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
        description: `Peringatan I (-5) kepada ${cornerLabel}`,
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
        description: `Peringatan II (-10) kepada ${cornerLabel}`,
        autoDisqualified: false,
      };
    }
    case 'peringatan3': {
      const key = isBlue ? 'bluePeringatan' : 'redPeringatan';
      return {
        patch: {
          [key]: 3,
          status: 'finished',
          winner: opponent,
          winMethod: 'Menang Diskualifikasi (Peringatan III)',
          timerStartedAtMs: 0,
        },
        pointsDelta: 0,
        description: `Peringatan III — ${cornerLabel} Diskualifikasi`,
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
