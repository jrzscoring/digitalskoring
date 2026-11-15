import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shuffleAllClassesMatchups,
  shuffleClassMatchups,
  swapMatchCorners,
  type LotingMatchDraft,
} from './loting.ts';

function sampleDrafts(): LotingMatchDraft[] {
  return [
    {
      id: 'm1',
      matchNumber: 'Partai 01',
      weightClass: 'Kelas B (50-55 kg) (Putra)',
      stage: 'Penyisihan',
      status: 'waiting',
      blueName: 'Andi',
      blueContingent: 'Kontingen A',
      redName: 'Budi',
      redContingent: 'Kontingen A',
    },
    {
      id: 'm2',
      matchNumber: 'Partai 02',
      weightClass: 'Kelas B (50-55 kg) (Putra)',
      stage: 'Penyisihan',
      status: 'waiting',
      blueName: 'Candra',
      blueContingent: 'Kontingen B',
      redName: 'Deni',
      redContingent: 'Kontingen C',
    },
    {
      id: 'm3',
      matchNumber: 'Partai 03',
      weightClass: 'Kelas C (55-60 kg) (Putri)',
      stage: 'Semifinal',
      status: 'waiting',
      blueName: 'Siti',
      blueContingent: 'Kontingen X',
      redName: 'Rina',
      redContingent: 'Kontingen Y',
    },
    {
      id: 'm4',
      matchNumber: 'Partai 04',
      weightClass: 'Kelas C (55-60 kg) (Putri)',
      stage: 'Semifinal',
      status: 'waiting',
      blueName: 'Dewi',
      blueContingent: 'Kontingen Z',
      redName: 'Lina',
      redContingent: 'Kontingen W',
    },
    {
      id: 'm5',
      matchNumber: 'Partai 05',
      weightClass: 'Kelas B (50-55 kg) (Putra)',
      stage: 'Final',
      status: 'finished',
      blueName: 'Juara Lama',
      blueContingent: 'Kontingen Z',
      redName: 'Runner Up',
      redContingent: 'Kontingen Q',
    },
  ];
}

test('shuffleClassMatchups preserves participants, separates same contingent, and keeps finished matches locked', () => {
  const classB = sampleDrafts().filter((m) => m.weightClass === 'Kelas B (50-55 kg) (Putra)');
  const shuffled = shuffleClassMatchups(classB);

  assert.equal(shuffled[2].blueName, 'Juara Lama');
  assert.equal(shuffled[2].redName, 'Runner Up');

  const originalSet = new Set([
    'Andi|Kontingen A',
    'Budi|Kontingen A',
    'Candra|Kontingen B',
    'Deni|Kontingen C',
  ]);
  const shuffledSet = new Set([
    `${shuffled[0].blueName}|${shuffled[0].blueContingent}`,
    `${shuffled[0].redName}|${shuffled[0].redContingent}`,
    `${shuffled[1].blueName}|${shuffled[1].blueContingent}`,
    `${shuffled[1].redName}|${shuffled[1].redContingent}`,
  ]);
  assert.deepEqual(shuffledSet, originalSet);

  // Neither waiting match should pit Kontingen A vs Kontingen A when avoidable
  assert.notEqual(shuffled[0].blueContingent, shuffled[0].redContingent);
  assert.notEqual(shuffled[1].blueContingent, shuffled[1].redContingent);
});

test('shuffleAllClassesMatchups never crosses athletes between different weight classes', () => {
  const drafts = sampleDrafts();
  const shuffled = shuffleAllClassesMatchups(drafts);

  const classBNames = new Set(['Andi', 'Budi', 'Candra', 'Deni']);
  const classCNames = new Set(['Siti', 'Rina', 'Dewi', 'Lina']);

  for (const m of shuffled.filter((x) => x.status === 'waiting')) {
    if (m.weightClass.includes('Kelas B')) {
      assert.ok(classBNames.has(m.blueName));
      assert.ok(classBNames.has(m.redName));
    } else {
      assert.ok(classCNames.has(m.blueName));
      assert.ok(classCNames.has(m.redName));
    }
  }
});

test('swapMatchCorners swaps athletes within same class and blocks cross-class or locked match swaps', () => {
  const drafts = sampleDrafts();

  // Valid swap across two waiting matches in same class
  const resValid = swapMatchCorners(
    drafts,
    { matchId: 'm1', corner: 'blue' },
    { matchId: 'm2', corner: 'red' }
  );
  assert.equal(resValid.swapped, true);
  assert.equal(resValid.updated[0].blueName, 'Deni');
  assert.equal(resValid.updated[0].blueContingent, 'Kontingen C');
  assert.equal(resValid.updated[1].redName, 'Andi');
  assert.equal(resValid.updated[1].redContingent, 'Kontingen A');

  // Blocked cross-class swap
  const resCrossClass = swapMatchCorners(
    drafts,
    { matchId: 'm1', corner: 'blue' },
    { matchId: 'm3', corner: 'blue' }
  );
  assert.equal(resCrossClass.swapped, false);
  assert.ok(resCrossClass.reason);

  // Blocked locked (finished) match swap
  const resLocked = swapMatchCorners(
    drafts,
    { matchId: 'm1', corner: 'blue' },
    { matchId: 'm5', corner: 'blue' }
  );
  assert.equal(resLocked.swapped, false);
  assert.ok(resLocked.reason);
});
