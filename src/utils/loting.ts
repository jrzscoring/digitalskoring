import type { CompetitionCategory, Corner, JurusCategory, MatchStatus } from '../types/silat';

export interface LotingMatchDraft {
  id: string;
  matchNumber: string;
  weightClass: string;
  stage: string;
  competitionCategory?: CompetitionCategory;
  jurusType?: JurusCategory;
  status: MatchStatus;
  blueName: string;
  blueContingent: string;
  blueCountry?: string;
  bluePhoto?: string;
  redName: string;
  redContingent: string;
  redCountry?: string;
  redPhoto?: string;
}

export interface CornerRef {
  matchId: string;
  corner: Corner;
}

interface AthleteSlot {
  name: string;
  contingent: string;
  country?: string;
  photo?: string;
}

function fisherYatesShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairSignature(pairs: Array<[AthleteSlot, AthleteSlot]>): string {
  return pairs
    .map(
      ([b, r]) =>
        `${b.name}|${b.contingent}__${r.name}|${r.contingent}`
    )
    .join(';;');
}

function countSameContingentClashes(pairs: Array<[AthleteSlot, AthleteSlot]>): number {
  let clashes = 0;
  for (const [b, r] of pairs) {
    const bc = b.contingent.trim().toLowerCase();
    const rc = r.contingent.trim().toLowerCase();
    if (bc && rc && bc !== '-' && rc !== '-' && bc === rc) {
      clashes += 1;
    }
  }
  return clashes;
}

/**
 * Mengacak pertemuan atlet pada partai berstatus 'waiting' di dalam satu kelas yang sama.
 * Memprioritaskan penghindaran pertemuan antar atlet dari kontingen yang sama di babak awal.
 */
export function shuffleClassMatchups(
  classMatches: LotingMatchDraft[],
  rng: () => number = Math.random
): LotingMatchDraft[] {
  const editableIndices: number[] = [];
  classMatches.forEach((m, idx) => {
    if (m.status === 'waiting') {
      editableIndices.push(idx);
    }
  });

  if (editableIndices.length === 0) {
    return classMatches;
  }

  if (editableIndices.length === 1) {
    const idx = editableIndices[0];
    const target = classMatches[idx];
    const next = [...classMatches];
    next[idx] = {
      ...target,
      blueName: target.redName,
      blueContingent: target.redContingent,
      blueCountry: target.redCountry,
      bluePhoto: target.redPhoto,
      redName: target.blueName,
      redContingent: target.blueContingent,
      redCountry: target.blueCountry,
      redPhoto: target.bluePhoto,
    };
    return next;
  }

  const originalPairs: Array<[AthleteSlot, AthleteSlot]> = editableIndices.map((idx) => {
    const m = classMatches[idx];
    return [
      {
        name: m.blueName,
        contingent: m.blueContingent,
        country: m.blueCountry,
        photo: m.bluePhoto,
      },
      {
        name: m.redName,
        contingent: m.redContingent,
        country: m.redCountry,
        photo: m.redPhoto,
      },
    ];
  });
  const originalSig = pairSignature(originalPairs);

  const flatSlots: AthleteSlot[] = originalPairs.flatMap(([b, r]) => [b, r]);

  let bestPairs: Array<[AthleteSlot, AthleteSlot]> = originalPairs;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const shuffled = fisherYatesShuffle(flatSlots, rng);
    const candidatePairs: Array<[AthleteSlot, AthleteSlot]> = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      candidatePairs.push([shuffled[i], shuffled[i + 1]]);
    }

    const clashes = countSameContingentClashes(candidatePairs);
    const unchangedPenalty = pairSignature(candidatePairs) === originalSig ? 1000 : 0;
    const score = clashes * 10 + unchangedPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestPairs = candidatePairs;
      if (score === 0) break;
    }
  }

  const result = [...classMatches];
  editableIndices.forEach((matchIdx, i) => {
    const [blue, red] = bestPairs[i];
    result[matchIdx] = {
      ...result[matchIdx],
      blueName: blue.name,
      blueContingent: blue.contingent,
      blueCountry: blue.country,
      bluePhoto: blue.photo,
      redName: red.name,
      redContingent: red.contingent,
      redCountry: red.country,
      redPhoto: red.photo,
    };
  });

  return result;
}

/**
 * Mengacak pertemuan atlet untuk semua kelas secara terpisah (atlet tidak berpindah lintas kelas).
 */
export function shuffleAllClassesMatchups(
  allDrafts: LotingMatchDraft[],
  rng: () => number = Math.random
): LotingMatchDraft[] {
  const byClassIndices = new Map<string, number[]>();
  allDrafts.forEach((m, idx) => {
    const key = m.weightClass.trim();
    const arr = byClassIndices.get(key) || [];
    arr.push(idx);
    byClassIndices.set(key, arr);
  });

  const result = [...allDrafts];
  for (const indices of byClassIndices.values()) {
    const groupDrafts = indices.map((idx) => result[idx]);
    const shuffledGroup = shuffleClassMatchups(groupDrafts, rng);
    indices.forEach((targetIdx, localIdx) => {
      result[targetIdx] = shuffledGroup[localIdx];
    });
  }
  return result;
}

/**
 * Menukar posisi dua atlet (sudut biru atau merah) secara manual dalam kelas yang sama.
 */
export function swapMatchCorners(
  drafts: LotingMatchDraft[],
  from: CornerRef,
  to: CornerRef
): { updated: LotingMatchDraft[]; swapped: boolean; reason?: string } {
  if (from.matchId === to.matchId && from.corner === to.corner) {
    return { updated: drafts, swapped: false };
  }

  const fromIdx = drafts.findIndex((m) => m.id === from.matchId);
  const toIdx = drafts.findIndex((m) => m.id === to.matchId);
  if (fromIdx === -1 || toIdx === -1) {
    return { updated: drafts, swapped: false, reason: 'Partai tidak ditemukan.' };
  }

  const fromMatch = drafts[fromIdx];
  const toMatch = drafts[toIdx];

  if (fromMatch.status !== 'waiting' || toMatch.status !== 'waiting') {
    return {
      updated: drafts,
      swapped: false,
      reason: 'Hanya partai berstatus Menunggu yang dapat diubah posisinya.',
    };
  }

  if (fromMatch.weightClass.trim() !== toMatch.weightClass.trim()) {
    return {
      updated: drafts,
      swapped: false,
      reason: 'Pemindahan manual hanya dapat dilakukan antar partai di kelas yang sama.',
    };
  }

  const fromName = from.corner === 'blue' ? fromMatch.blueName : fromMatch.redName;
  const fromCont = from.corner === 'blue' ? fromMatch.blueContingent : fromMatch.redContingent;
  const fromCountry = from.corner === 'blue' ? fromMatch.blueCountry : fromMatch.redCountry;
  const fromPhoto = from.corner === 'blue' ? fromMatch.bluePhoto : fromMatch.redPhoto;

  const toName = to.corner === 'blue' ? toMatch.blueName : toMatch.redName;
  const toCont = to.corner === 'blue' ? toMatch.blueContingent : toMatch.redContingent;
  const toCountry = to.corner === 'blue' ? toMatch.blueCountry : toMatch.redCountry;
  const toPhoto = to.corner === 'blue' ? toMatch.bluePhoto : toMatch.redPhoto;

  const updated = [...drafts];

  if (fromIdx === toIdx) {
    updated[fromIdx] = {
      ...fromMatch,
      blueName: from.corner === 'blue' ? toName : fromName,
      blueContingent: from.corner === 'blue' ? toCont : fromCont,
      blueCountry: from.corner === 'blue' ? toCountry : fromCountry,
      bluePhoto: from.corner === 'blue' ? toPhoto : fromPhoto,
      redName: from.corner === 'red' ? toName : fromName,
      redContingent: from.corner === 'red' ? toCont : fromCont,
      redCountry: from.corner === 'red' ? toCountry : fromCountry,
      redPhoto: from.corner === 'red' ? toPhoto : fromPhoto,
    };
  } else {
    updated[fromIdx] =
      from.corner === 'blue'
        ? { ...fromMatch, blueName: toName, blueContingent: toCont, blueCountry: toCountry, bluePhoto: toPhoto }
        : { ...fromMatch, redName: toName, redContingent: toCont, redCountry: toCountry, redPhoto: toPhoto };
    updated[toIdx] =
      to.corner === 'blue'
        ? { ...toMatch, blueName: fromName, blueContingent: fromCont, blueCountry: fromCountry, bluePhoto: fromPhoto }
        : { ...toMatch, redName: fromName, redContingent: fromCont, redCountry: fromCountry, redPhoto: fromPhoto };
  }

  return { updated, swapped: true };
}
