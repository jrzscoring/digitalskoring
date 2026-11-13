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
  venue?: string;
  eventDate?: string;
  logoLeft?: string;
  logoRight?: string;
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

export type AthleteGender = 'Putra' | 'Putri';

export type AthleteAgeCategory =
  | 'Usia Dini 1'
  | 'Usia Dini 2'
  | 'Usia Dini'
  | 'Pra Remaja'
  | 'Remaja'
  | 'Dewasa'
  | 'Master';

export type CompetitionCategory = 'Tanding' | 'Jurus';

export type ArenaCourt = 'A' | 'B' | 'C' | 'D';

export interface AthleteData {
  id: string;
  arenaId: string;
  ownerId: string;
  name: string;
  contingent: string;
  weightClass: string;
  gender: AthleteGender;
  ageCategory?: AthleteAgeCategory;
  competitionCategory?: CompetitionCategory;
  gelanggang?: ArenaCourt;
  createdAt?: unknown;
  createdAtMs?: number;
}

export type BracketMode = 'prestasi' | 'pemasalan';

export type PemasalanPoolSize = 2 | 4 | 6 | 8;

export interface BracketMatchSlot {
  id: string;
  arenaId: string;
  ownerId: string;
  weightClass: string;
  gender: AthleteGender;
  bracketMode?: BracketMode;
  poolSize?: number;
  poolIndex?: number;
  poolLabel?: string;
  ageCategory?: string;
  competitionCategory?: string;
  gelanggang?: string;
  roundIndex: number;
  slotIndex: number;
  stage: string;
  blueName: string;
  blueContingent: string;
  redName: string;
  redContingent: string;
  matchId?: string;
  winnerSide?: Corner | '';
  winnerName?: string;
  winnerContingent?: string;
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
