export type Corner = 'blue' | 'red';

export type MatchStatus = 'waiting' | 'active' | 'paused' | 'break' | 'finished';

export type JudgeId = 1 | 2 | 3;

export type JurusJudgeId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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
  | 'cancel_fall'
  | 'binaan'
  | 'binaan1'
  | 'binaan2'
  | 'teguran1'
  | 'teguran2'
  | 'peringatan1'
  | 'peringatan2'
  | 'peringatan3'
  | 'disq';

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

export type JurusCategory = 'Tunggal Baku' | 'Ganda' | 'Regu' | 'Tunggal Bebas';

export interface JurusJudgeCornerScore {
  wrongMoves: number; // Tunggal Baku / Regu: jumlah kesalahan gerak (-0.01 per tap dari 9.90)
  staminaScore: number; // Tunggal Baku / Regu: kemantapan/stamina dalam perseratus (0..10 => 0.00..0.10)
  attackScore: number; // Ganda / Tunggal Bebas: teknik serang bela dalam perseratus (0..30 => 0.00..0.30)
  harmonyScore: number; // Ganda / Tunggal Bebas: kemantapan/kekompakan/kreativitas dalam perseratus (0..30 => 0.00..0.30)
  soulScore: number; // Ganda / Tunggal Bebas: penghayatan/jiwa/stamina dalam perseratus (0..30 => 0.00..0.30)
  ready?: boolean; // Tunggal Baku / Regu: status READY juri sebelum menginput nilai (reset saat match direset)
  submitted: boolean;
}

export interface JurusCornerPenalties {
  timeViolation: number; // Pelanggaran batas waktu tampil (-0.50)
  outOfBounds: number; // Keluar gelanggang (-0.50)
  weaponDrop: number; // Senjata jatuh / tidak sesuai (-0.50)
  attireViolation: number; // Pakaian / aksesoris jatuh (-0.50)
  stopOrDelay: number; // Berhenti / mengulang / terlambat >5 dtk (-0.50)
}

export type JurusPenaltyType = keyof JurusCornerPenalties;

export interface JurusCornerData {
  judge1: JurusJudgeCornerScore;
  judge2: JurusJudgeCornerScore;
  judge3: JurusJudgeCornerScore;
  judge4?: JurusJudgeCornerScore;
  judge5?: JurusJudgeCornerScore;
  judge6?: JurusJudgeCornerScore;
  judge7?: JurusJudgeCornerScore;
  judge8?: JurusJudgeCornerScore;
  judge9?: JurusJudgeCornerScore;
  judge10?: JurusJudgeCornerScore;
  penalties: JurusCornerPenalties;
  recordedElapsedMs: number;
  completed: boolean;
}

export interface JurusMatchState {
  blue: JurusCornerData;
  red: JurusCornerData;
}

export type VerificationKind = 'jatuhan' | 'pelanggaran';
export type VerificationVoteChoice = 'blue' | 'red' | 'invalid';
export type VerificationVoteValue = VerificationVoteChoice | 'none';

export interface VerificationState {
  active: boolean;
  kind: VerificationKind;
  requestedAtMs: number;
  j1Vote: VerificationVoteValue;
  j2Vote: VerificationVoteValue;
  j3Vote: VerificationVoteValue;
}

export interface MatchData {
  id: string;
  arenaId: string;
  ownerId: string;
  matchNumber: string;
  weightClass: string;
  stage: string;
  gelanggang?: ArenaCourt;
  competitionCategory?: CompetitionCategory;
  jurusType?: JurusCategory;
  jurusJudgeCount?: number;
  activePerformerCorner?: Corner;
  jurusState?: JurusMatchState;
  blueName: string;
  blueContingent: string;
  blueCountry?: string;
  bluePhoto?: string;
  redName: string;
  redContingent: string;
  redCountry?: string;
  redPhoto?: string;
  roundDurationSec: number;
  currentRound: number;
  totalRounds?: 1 | 2 | 3;
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
  blueProtests?: number;
  redProtests?: number;
  judge1Vote?: JudgeVote;
  judge2Vote?: JudgeVote;
  judge3Vote?: JudgeVote;
  verification?: VerificationState;
  juriLocked?: boolean;
  winner: Corner | 'draw' | '';
  winMethod: string;
  finishedAtMs?: number;
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
  country?: string;
  photo?: string;
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

export type OfficialStationRole = 'Sekretaris' | 'Dewan' | 'Timer' | 'Juri' | 'Scoreboard';

export interface UserOfficialProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  licenseNumber?: string;
  contingentOrigin?: string;
  preferredRole: OfficialStationRole;
  preferredCourt: ArenaCourt;
  preferredJudgeNumber?: number;
  lastArenaId?: string;
  onboardingCompleted: boolean;
  lastLoginAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoginAuditEntry {
  id: string;
  uid: string;
  email: string;
  deviceLabel: string;
  stationRole: OfficialStationRole;
  court: ArenaCourt;
  arenaId: string;
  loginAtMs: number;
  createdAt?: unknown;
}

export interface ArenaOperatorRecord {
  uid: string;
  arenaId: string;
  ownerId: string;
  role: OfficialStationRole;
  displayName?: string;
  email?: string;
  createdAt?: unknown;
}

