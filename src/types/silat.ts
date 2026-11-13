export type Corner = 'blue' | 'red';

export type MatchStatus = 'waiting' | 'active' | 'paused' | 'break' | 'finished';

export type JudgeId = 1 | 2 | 3;

export type AppView = 'landing' | 'sekretaris' | 'dewan' | 'timer' | 'juri' | 'scoreboard';

export type WinMethod =
  | 'Menang Angka'
  | 'Menang Teknik (TKO)'
  | 'Menang Mutlak'
  | 'Menang Diskualifikasi'
  | 'Menang Diskualifikasi (Peringatan III)'
  | 'Menang Undur Diri'
  | 'Menang WMP'
  | 'Seri'
  | '';

export type DewanActionType =
  | 'fall'
  | 'binaan'
  | 'teguran1'
  | 'teguran2'
  | 'peringatan1'
  | 'peringatan2'
  | 'peringatan3';

export interface JudgeVote {
  corner: Corner | 'none';
  points: number; // 0, 1 (pukulan), 2 (tendangan)
  timestampMs: number;
  round: number;
  confirmed?: boolean;
}

export interface ArenaData {
  id: string;
  name: string;
  tournamentName: string;
  ownerId: string;
  activeMatchId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchData {
  id: string;
  arenaId: string;
  ownerId: string;
  matchNumber: string;
  weightClass: string;
  stage: string;
  blueName: string;
  blueContingent: string;
  redName: string;
  redContingent: string;
  roundDurationSec: number;
  currentRound: number;
  status: MatchStatus;
  timerRemainingMs: number;
  timerStartedAtMs: number;
  blueScore: number;
  redScore: number;
  bluePunches: number;
  blueKicks: number;
  blueFalls: number;
  blueBinaan: number;
  blueTeguran1: number;
  blueTeguran2: number;
  bluePeringatan: number;
  redPunches: number;
  redKicks: number;
  redFalls: number;
  redBinaan: number;
  redTeguran1: number;
  redTeguran2: number;
  redPeringatan: number;
  judge1Vote?: JudgeVote;
  judge2Vote?: JudgeVote;
  judge3Vote?: JudgeVote;
  winner: Corner | 'draw' | '';
  winMethod: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchEvent {
  id: string;
  arenaId: string;
  matchId: string;
  ownerId: string;
  actorRole: string;
  corner: Corner | 'neutral';
  type: string;
  pointsDelta: number;
  round: number;
  matchTimeFormatted: string;
  description: string;
  undone: boolean;
  createdAt?: unknown;
  createdAtMs?: number;
}
