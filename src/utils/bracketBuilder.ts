import type {
  ArenaCourt,
  AthleteAgeCategory,
  AthleteData,
  AthleteGender,
  BracketMatchSlot,
  BracketMode,
  CompetitionCategory,
  PemasalanPoolSize,
} from '../types/silat';

export interface BuildBracketOptions {
  arenaId: string;
  ownerId: string;
  weightClass: string;
  gender: AthleteGender;
  bracketMode: BracketMode;
  poolSize?: PemasalanPoolSize;
  ageCategory?: AthleteAgeCategory | 'Semua';
  competitionCategory?: CompetitionCategory;
  gelanggang?: ArenaCourt | 'Semua';
  idPrefix: string;
}

/**
 * Memisahkan atlet dari kontingen yang sama agar tidak langsung bertemu di babak awal bila memungkinkan.
 */
export function spreadAthletesByContingent(pool: AthleteData[]): AthleteData[] {
  const byContingent = new Map<string, AthleteData[]>();
  for (const ath of pool) {
    const key = ath.contingent.trim().toLowerCase() || ath.id;
    const arr = byContingent.get(key) || [];
    arr.push(ath);
    byContingent.set(key, arr);
  }
  const groups = Array.from(byContingent.values()).sort((a, b) => b.length - a.length);
  const distributed: AthleteData[] = [];
  let remaining = pool.length;
  let idx = 0;
  while (remaining > 0) {
    for (const g of groups) {
      if (idx < g.length) {
        distributed.push(g[idx]);
        remaining -= 1;
      }
    }
    idx += 1;
  }
  return distributed;
}

function getStageName(slotsCount: number): string {
  if (slotsCount === 1) return 'Final';
  if (slotsCount === 2) return 'Semifinal';
  if (slotsCount === 4) return 'Perempat Final';
  if (slotsCount === 8) return '16 Besar';
  if (slotsCount === 16) return '32 Besar';
  return 'Penyisihan';
}

function buildEliminationTree(
  poolAthletes: AthleteData[],
  treeSize: number,
  poolIndex: number,
  poolLabel: string,
  opts: BuildBracketOptions
): BracketMatchSlot[] {
  const totalRounds = Math.max(1, Math.log2(treeSize));
  const round0Slots = treeSize / 2;

  // Hitung urutan indeks pertandingan agar BYE tersebar seimbang di paruh atas & bawah bagan
  const byeOrder: number[] = [];
  const half = Math.max(1, Math.floor(round0Slots / 2));
  for (let offset = 0; offset < half; offset += 1) {
    byeOrder.push(offset);
    if (offset + half < round0Slots) {
      byeOrder.push(offset + half);
    }
  }
  if (byeOrder.length === 0) byeOrder.push(0);

  const byeMatchIndices = new Set<number>();
  const numByes = Math.max(0, treeSize - poolAthletes.length);
  for (let i = 0; i < numByes && i < round0Slots; i += 1) {
    byeMatchIndices.add(byeOrder[i]);
  }

  const blueSlots: (AthleteData | null)[] = new Array(round0Slots).fill(null);
  const redSlots: (AthleteData | null)[] = new Array(round0Slots).fill(null);

  let cursor = 0;
  // Pastikan setiap partai babak pertama memiliki minimal 1 atlet terlebih dahulu
  for (let s = 0; s < round0Slots; s += 1) {
    if (cursor < poolAthletes.length) {
      blueSlots[s] = poolAthletes[cursor++];
    }
  }
  // Isi sudut merah untuk partai non-BYE
  for (let s = 0; s < round0Slots; s += 1) {
    if (!byeMatchIndices.has(s) && cursor < poolAthletes.length) {
      redSlots[s] = poolAthletes[cursor++];
    }
  }
  // Fallback jika masih ada sisa atlet
  for (let s = 0; s < round0Slots && cursor < poolAthletes.length; s += 1) {
    if (!redSlots[s]) {
      redSlots[s] = poolAthletes[cursor++];
    }
  }

  const slots: BracketMatchSlot[] = [];
  for (let r = 0; r < totalRounds; r += 1) {
    const count = treeSize / Math.pow(2, r + 1);
    const stageName = getStageName(count);
    for (let s = 0; s < count; s += 1) {
      const blueA = r === 0 ? blueSlots[s] : null;
      const redA = r === 0 ? redSlots[s] : null;

      const slot: BracketMatchSlot = {
        id: `${opts.idPrefix}-p${poolIndex}-r${r}-s${s}`,
        arenaId: opts.arenaId,
        ownerId: opts.ownerId,
        weightClass: opts.weightClass,
        gender: opts.gender,
        bracketMode: opts.bracketMode,
        poolSize: opts.bracketMode === 'pemasalan' ? opts.poolSize || 4 : treeSize,
        poolIndex,
        poolLabel,
        ageCategory: opts.ageCategory || 'Semua',
        competitionCategory: opts.competitionCategory || 'Tanding',
        gelanggang: opts.gelanggang || 'Semua',
        roundIndex: r,
        slotIndex: s,
        stage: stageName,
        blueName: r === 0 ? (blueA ? blueA.name : 'BYE') : 'Menunggu Pemenang',
        blueContingent: r === 0 ? (blueA ? blueA.contingent : '-') : '-',
        redName: r === 0 ? (redA ? redA.name : 'BYE') : 'Menunggu Pemenang',
        redContingent: r === 0 ? (redA ? redA.contingent : '-') : '-',
        matchId: '',
        winnerSide: '',
        winnerName: '',
        winnerContingent: '',
      };

      if (r === 0 && blueA && !redA) {
        slot.winnerSide = 'blue';
        slot.winnerName = blueA.name;
        slot.winnerContingent = blueA.contingent;
      } else if (r === 0 && !blueA && redA) {
        slot.winnerSide = 'red';
        slot.winnerName = redA.name;
        slot.winnerContingent = redA.contingent;
      }

      slots.push(slot);
    }
  }

  // Propagasikan pemenang BYE babak pertama ke babak kedua otomatis
  for (const s0 of slots.filter((x) => x.roundIndex === 0 && x.winnerSide)) {
    const nextSlot = slots.find(
      (x) => x.roundIndex === 1 && x.slotIndex === Math.floor(s0.slotIndex / 2)
    );
    if (nextSlot) {
      if (s0.slotIndex % 2 === 0) {
        nextSlot.blueName = s0.winnerName || '';
        nextSlot.blueContingent = s0.winnerContingent || '-';
      } else {
        nextSlot.redName = s0.winnerName || '';
        nextSlot.redContingent = s0.winnerContingent || '-';
      }
    }
  }

  return slots;
}

export function buildTournamentBracketSlots(
  matchingAthletes: AthleteData[],
  opts: BuildBracketOptions
): { slots: BracketMatchSlot[]; poolCount: number } {
  const seeded = spreadAthletesByContingent(matchingAthletes);

  if (opts.bracketMode === 'pemasalan') {
    const maxPerPool: PemasalanPoolSize = opts.poolSize || 4;
    const chunks: AthleteData[][] = [];
    for (let i = 0; i < seeded.length; i += maxPerPool) {
      chunks.push(seeded.slice(i, i + maxPerPool));
    }

    const allSlots: BracketMatchSlot[] = [];
    chunks.forEach((chunk, poolIdx) => {
      const poolLetter = String.fromCharCode(65 + (poolIdx % 26));
      const poolLabel =
        chunks.length > 1
          ? `Pool ${poolLetter} (Bagan ${maxPerPool})`
          : `Bagan ${maxPerPool}`;

      let treeSize = 2;
      while (treeSize < Math.max(2, chunk.length)) {
        treeSize *= 2;
      }

      const treeSlots = buildEliminationTree(chunk, treeSize, poolIdx, poolLabel, opts);
      allSlots.push(...treeSlots);
    });

    return { slots: allSlots, poolCount: chunks.length };
  }

  // Bagan Prestasi: Sistem Gugur Penuh (Single Elimination)
  let treeSize = 2;
  while (treeSize < seeded.length) {
    treeSize *= 2;
  }

  const slots = buildEliminationTree(seeded, treeSize, 0, `Prestasi (${seeded.length} Peserta)`, opts);
  return { slots, poolCount: 1 };
}
