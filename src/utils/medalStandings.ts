import type { AthleteData, BracketMatchSlot, MatchData } from '../types/silat';

export type MedalTier = 'Emas' | 'Perak' | 'Perunggu';

export interface MedalStandingRow {
  rank: number;
  contingent: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface MedalAwardEntry {
  id: string;
  medal: MedalTier;
  athleteName: string;
  contingent: string;
  weightClass: string;
  stage: string;
  matchNumber: string;
}

function isRealCompetitor(name?: string, contingent?: string): boolean {
  const n = (name || '').trim();
  const c = (contingent || '').trim();
  if (!n || n === 'BYE' || n === 'Menunggu Pemenang' || n === '-') return false;
  if (c === 'BYE') return false;
  return true;
}

function normalizeContingentName(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '-') return 'Tanpa Kontingen';
  return trimmed;
}

function classifyMedalStage(stage: string): 'final' | 'semifinal' | 'third-place' | 'other' {
  const s = stage.trim().toLowerCase();
  if (s === 'final' || s.startsWith('final ')) return 'final';
  if (s.includes('semi') || s.includes('semifinal')) return 'semifinal';
  if (s.includes('juara 3') || s.includes('juara iii') || s.includes('perunggu') || s.includes('3rd')) {
    return 'third-place';
  }
  return 'other';
}

export function computeMedalStandings(
  matches: MatchData[],
  brackets: BracketMatchSlot[],
  athletes: AthleteData[]
): {
  standings: MedalStandingRow[];
  awards: MedalAwardEntry[];
  totalGold: number;
  totalSilver: number;
  totalBronze: number;
} {
  const counts = new Map<
    string,
    { contingent: string; gold: number; silver: number; bronze: number }
  >();
  const awards: MedalAwardEntry[] = [];
  const seenKeys = new Set<string>();

  const ensureContingent = (rawName: string) => {
    const label = normalizeContingentName(rawName);
    const key = label.toLowerCase();
    let entry = counts.get(key);
    if (!entry) {
      entry = { contingent: label, gold: 0, silver: 0, bronze: 0 };
      counts.set(key, entry);
    }
    return entry;
  };

  for (const ath of athletes) {
    if (ath.contingent && ath.contingent.trim() && ath.contingent.trim() !== '-') {
      ensureContingent(ath.contingent);
    }
  }

  const processFinishedMatch = (
    id: string,
    matchNumber: string,
    stage: string,
    weightClass: string,
    blueName: string,
    blueContingent: string,
    redName: string,
    redContingent: string,
    winner: 'blue' | 'red'
  ) => {
    if (!isRealCompetitor(blueName, blueContingent) || !isRealCompetitor(redName, redContingent)) {
      return;
    }

    const stageKind = classifyMedalStage(stage);
    if (stageKind === 'other') return;

    const dedupKey = `${stageKind}|${weightClass.trim().toLowerCase()}|${blueName.trim().toLowerCase()}|${redName.trim().toLowerCase()}`;
    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);

    const winnerName = winner === 'blue' ? blueName : redName;
    const winnerContingent = winner === 'blue' ? blueContingent : redContingent;
    const loserName = winner === 'blue' ? redName : blueName;
    const loserContingent = winner === 'blue' ? redContingent : blueContingent;

    if (stageKind === 'final') {
      const goldRow = ensureContingent(winnerContingent);
      goldRow.gold += 1;
      awards.push({
        id: `${id}-gold`,
        medal: 'Emas',
        athleteName: winnerName,
        contingent: goldRow.contingent,
        weightClass,
        stage,
        matchNumber,
      });

      const silverRow = ensureContingent(loserContingent);
      silverRow.silver += 1;
      awards.push({
        id: `${id}-silver`,
        medal: 'Perak',
        athleteName: loserName,
        contingent: silverRow.contingent,
        weightClass,
        stage,
        matchNumber,
      });
    } else if (stageKind === 'semifinal') {
      const bronzeRow = ensureContingent(loserContingent);
      bronzeRow.bronze += 1;
      awards.push({
        id: `${id}-bronze`,
        medal: 'Perunggu',
        athleteName: loserName,
        contingent: bronzeRow.contingent,
        weightClass,
        stage,
        matchNumber,
      });
    } else if (stageKind === 'third-place') {
      const bronzeRow = ensureContingent(winnerContingent);
      bronzeRow.bronze += 1;
      awards.push({
        id: `${id}-bronze-3rd`,
        medal: 'Perunggu',
        athleteName: winnerName,
        contingent: bronzeRow.contingent,
        weightClass,
        stage,
        matchNumber,
      });
    }
  };

  for (const m of matches) {
    if (m.status === 'finished' && (m.winner === 'blue' || m.winner === 'red')) {
      processFinishedMatch(
        m.id,
        m.matchNumber,
        m.stage,
        m.weightClass,
        m.blueName,
        m.blueContingent,
        m.redName,
        m.redContingent,
        m.winner
      );
    }
  }

  for (const slot of brackets) {
    if (slot.winnerSide === 'blue' || slot.winnerSide === 'red') {
      processFinishedMatch(
        slot.id,
        slot.poolLabel || `Bagan #${slot.slotIndex + 1}`,
        slot.stage,
        `${slot.weightClass} (${slot.gender})`,
        slot.blueName,
        slot.blueContingent,
        slot.redName,
        slot.redContingent,
        slot.winnerSide
      );
    }
  }

  const sorted = Array.from(counts.values())
    .map((item) => ({
      ...item,
      total: item.gold + item.silver + item.bronze,
    }))
    .sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      if (b.bronze !== a.bronze) return b.bronze - a.bronze;
      if (b.total !== a.total) return b.total - a.total;
      return a.contingent.localeCompare(b.contingent, 'id');
    })
    .map((item, idx) => ({
      rank: idx + 1,
      ...item,
    }));

  const medalOrder: Record<MedalTier, number> = { Emas: 0, Perak: 1, Perunggu: 2 };
  awards.sort((a, b) => {
    const mo = medalOrder[a.medal] - medalOrder[b.medal];
    if (mo !== 0) return mo;
    return a.contingent.localeCompare(b.contingent, 'id');
  });

  const totalGold = sorted.reduce((acc, r) => acc + r.gold, 0);
  const totalSilver = sorted.reduce((acc, r) => acc + r.silver, 0);
  const totalBronze = sorted.reduce((acc, r) => acc + r.bronze, 0);

  return {
    standings: sorted,
    awards,
    totalGold,
    totalSilver,
    totalBronze,
  };
}
