import type { Corner, MatchData } from '../types/silat';

export const MAX_OFFICIAL_PROTESTS = 2;

export interface CornerProtestStatus {
  corner: Corner;
  usedCount: number;
  remainingCount: number;
  maxCards: number;
  /** Length equals remainingCount (2 -> [1, 2], 1 -> [1], 0 -> []) so used cards disappear from UI */
  visibleCardNumbers: number[];
  exhausted: boolean;
}

export function normalizeProtestCount(raw?: number | null): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(MAX_OFFICIAL_PROTESTS, Math.max(0, Math.round(raw)));
}

export function applyOfficialProtestDelta(
  currentCount: number | undefined | null,
  delta: 1 | -1
): number {
  return normalizeProtestCount(normalizeProtestCount(currentCount) + delta);
}

export function getCornerProtestStatus(
  match: Pick<MatchData, 'blueProtests' | 'redProtests'>,
  corner: Corner
): CornerProtestStatus {
  const raw = corner === 'blue' ? match.blueProtests : match.redProtests;
  const usedCount = normalizeProtestCount(raw);
  const remainingCount = MAX_OFFICIAL_PROTESTS - usedCount;
  const visibleCardNumbers = Array.from(
    { length: remainingCount },
    (_, idx) => idx + 1
  );

  return {
    corner,
    usedCount,
    remainingCount,
    maxCards: MAX_OFFICIAL_PROTESTS,
    visibleCardNumbers,
    exhausted: remainingCount === 0,
  };
}

export function canRecordOfficialProtest(
  match: Pick<MatchData, 'status' | 'blueProtests' | 'redProtests'>,
  corner: Corner
): boolean {
  if (match.status === 'finished') return false;
  return !getCornerProtestStatus(match, corner).exhausted;
}
