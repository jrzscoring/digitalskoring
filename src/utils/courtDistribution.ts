import type { ArenaCourt, AthleteData, MatchData } from '../types/silat';

export type CourtCount = 2 | 3 | 4;

export type CourtDivisionStrategy =
  | 'sequential'
  | 'alternating'
  | 'by_class'
  | 'from_athletes';

export type CourtDivisionScope = 'unfinished' | 'waiting' | 'all';

export interface CourtAssignmentProposal {
  matchId: string;
  gelanggang: ArenaCourt;
  previousGelanggang: ArenaCourt;
}

export interface ComputeCourtDistributionInput {
  matches: MatchData[];
  athletes?: AthleteData[];
  courtCount: CourtCount;
  strategy: CourtDivisionStrategy;
  scope?: CourtDivisionScope;
}

export interface CourtSummaryEntry {
  court: ArenaCourt;
  total: number;
  waiting: number;
  running: number;
  finished: number;
}

export function normalizeMatchCourt(raw?: string | null): ArenaCourt {
  if (!raw) return 'A';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'B' || normalized === 'C' || normalized === 'D') {
    return normalized;
  }
  return 'A';
}

export function getActiveCourtsForCount(count: CourtCount | number): ArenaCourt[] {
  if (count >= 4) return ['A', 'B', 'C', 'D'];
  if (count === 3) return ['A', 'B', 'C'];
  if (count === 2) return ['A', 'B'];
  return ['A'];
}

function findAthleteCourt(
  name: string,
  contingent: string,
  athletes: AthleteData[]
): ArenaCourt | undefined {
  const normName = name.trim().toLowerCase();
  if (!normName || normName === 'bye' || normName === 'menunggu pemenang') {
    return undefined;
  }
  const normCont = contingent.trim().toLowerCase();
  const exact = athletes.find(
    (a) =>
      a.name.trim().toLowerCase() === normName &&
      (!normCont || normCont === '-' || a.contingent.trim().toLowerCase() === normCont)
  );
  const found = exact || athletes.find((a) => a.name.trim().toLowerCase() === normName);
  return found?.gelanggang ? normalizeMatchCourt(found.gelanggang) : undefined;
}

function filterMatchesByScope(matches: MatchData[], scope: CourtDivisionScope): MatchData[] {
  if (scope === 'waiting') {
    return matches.filter((m) => m.status === 'waiting');
  }
  if (scope === 'unfinished') {
    return matches.filter((m) => m.status !== 'finished' && !m.winner);
  }
  return matches;
}

function distributeSequential(targetMatches: MatchData[], courts: ArenaCourt[]): ArenaCourt[] {
  const total = targetMatches.length;
  const k = courts.length;
  const baseSize = Math.floor(total / k);
  const remainder = total % k;

  const result: ArenaCourt[] = [];
  for (let cIdx = 0; cIdx < k; cIdx += 1) {
    const countForCourt = baseSize + (cIdx < remainder ? 1 : 0);
    for (let i = 0; i < countForCourt; i += 1) {
      result.push(courts[cIdx]);
    }
  }
  return result;
}

function distributeByClass(targetMatches: MatchData[], courts: ArenaCourt[]): ArenaCourt[] {
  const groupKeys: string[] = [];
  const groups = new Map<string, number[]>();

  targetMatches.forEach((m, index) => {
    const key = m.weightClass.trim().toLowerCase() || 'umum';
    if (!groups.has(key)) {
      groupKeys.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(index);
  });

  // If all target matches share a single class, divide in contiguous balanced blocks so 2+ courts are used
  if (groupKeys.length <= 1) {
    return distributeSequential(targetMatches, courts);
  }

  const assignedByIndex = new Array<ArenaCourt>(targetMatches.length).fill(courts[0]);
  const courtLoads = new Array<number>(courts.length).fill(0);

  // Sort classes largest-first (stable on original order) for balanced load across courts
  const orderedGroups = groupKeys
    .map((key, order) => ({ key, order, indices: groups.get(key)! }))
    .sort((a, b) => b.indices.length - a.indices.length || a.order - b.order);

  for (const group of orderedGroups) {
    let bestCourtIdx = 0;
    for (let i = 1; i < courts.length; i += 1) {
      if (courtLoads[i] < courtLoads[bestCourtIdx]) {
        bestCourtIdx = i;
      }
    }
    const targetCourt = courts[bestCourtIdx];
    for (const matchIndex of group.indices) {
      assignedByIndex[matchIndex] = targetCourt;
    }
    courtLoads[bestCourtIdx] += group.indices.length;
  }

  return assignedByIndex;
}

export function computeCourtDistribution({
  matches,
  athletes = [],
  courtCount,
  strategy,
  scope = 'unfinished',
}: ComputeCourtDistributionInput): CourtAssignmentProposal[] {
  const courts = getActiveCourtsForCount(courtCount);
  const targets = filterMatchesByScope(matches, scope);
  if (targets.length === 0) return [];

  let assignedCourts: ArenaCourt[];

  if (strategy === 'sequential') {
    assignedCourts = distributeSequential(targets, courts);
  } else if (strategy === 'alternating') {
    assignedCourts = targets.map((_, idx) => courts[idx % courts.length]);
  } else if (strategy === 'by_class') {
    assignedCourts = distributeByClass(targets, courts);
  } else {
    // 'from_athletes': prefer athlete's registered gelanggang if within active courts, otherwise round-robin fallback
    let fallbackCursor = 0;
    assignedCourts = targets.map((m) => {
      const blueCourt = findAthleteCourt(m.blueName, m.blueContingent, athletes);
      const redCourt = findAthleteCourt(m.redName, m.redContingent, athletes);
      const candidate =
        blueCourt && courts.includes(blueCourt)
          ? blueCourt
          : redCourt && courts.includes(redCourt)
          ? redCourt
          : undefined;
      if (candidate) return candidate;
      const fallbackCourt = courts[fallbackCursor % courts.length];
      fallbackCursor += 1;
      return fallbackCourt;
    });
  }

  return targets.map((m, idx) => ({
    matchId: m.id,
    gelanggang: assignedCourts[idx] || courts[0],
    previousGelanggang: normalizeMatchCourt(m.gelanggang),
  }));
}

export function summarizeMatchesByCourt(
  matches: MatchData[],
  courts: ArenaCourt[] = ['A', 'B', 'C', 'D']
): CourtSummaryEntry[] {
  const map = new Map<ArenaCourt, CourtSummaryEntry>();
  for (const c of courts) {
    map.set(c, { court: c, total: 0, waiting: 0, running: 0, finished: 0 });
  }

  for (const m of matches) {
    const court = normalizeMatchCourt(m.gelanggang);
    const entry = map.get(court) || { court, total: 0, waiting: 0, running: 0, finished: 0 };
    entry.total += 1;
    if (m.status === 'finished' || Boolean(m.winner)) {
      entry.finished += 1;
    } else if (m.status === 'waiting') {
      entry.waiting += 1;
    } else {
      entry.running += 1;
    }
    map.set(court, entry);
  }

  return courts.map((c) => map.get(c)!);
}
