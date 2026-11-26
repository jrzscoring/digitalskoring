import assert from 'node:assert/strict';
import test from 'node:test';
import type { AthleteData, MatchData } from '../types/silat';
import {
  computeCourtDistribution,
  getActiveCourtsForCount,
  normalizeMatchCourt,
  summarizeMatchesByCourt,
} from './courtDistribution';

function makeMatch(id: string, overrides: Partial<MatchData> = {}): MatchData {
  return {
    id,
    arenaId: 'gelanggang-a',
    ownerId: 'owner-1',
    matchNumber: `Partai ${id}`,
    weightClass: 'Kelas B Putra (50-55 kg)',
    stage: 'Penyisihan',
    blueName: `Biru ${id}`,
    blueContingent: 'Kontingen A',
    redName: `Merah ${id}`,
    redContingent: 'Kontingen B',
    roundDurationSec: 120,
    currentRound: 1,
    totalRounds: 3,
    status: 'waiting',
    timerRemainingMs: 120000,
    timerStartedAtMs: 0,
    blueScore: 0,
    redScore: 0,
    bluePunches: 0,
    blueKicks: 0,
    blueFalls: 0,
    blueBinaan: 0,
    blueTeguran1: 0,
    blueTeguran2: 0,
    bluePeringatan: 0,
    redPunches: 0,
    redKicks: 0,
    redFalls: 0,
    redBinaan: 0,
    redTeguran1: 0,
    redTeguran2: 0,
    redPeringatan: 0,
    winner: '',
    winMethod: '',
    ...overrides,
  };
}

function makeAthlete(id: string, name: string, contingent: string, gelanggang: 'A' | 'B' | 'C' | 'D'): AthleteData {
  return {
    id,
    arenaId: 'gelanggang-a',
    ownerId: 'owner-1',
    name,
    contingent,
    weightClass: 'Kelas B (50-55 kg)',
    gender: 'Putra',
    ageCategory: 'Dewasa',
    competitionCategory: 'Tanding',
    gelanggang,
  };
}

test('getActiveCourtsForCount and normalizeMatchCourt return valid court labels', () => {
  assert.deepEqual(getActiveCourtsForCount(2), ['A', 'B']);
  assert.deepEqual(getActiveCourtsForCount(3), ['A', 'B', 'C']);
  assert.deepEqual(getActiveCourtsForCount(4), ['A', 'B', 'C', 'D']);
  assert.equal(normalizeMatchCourt(undefined), 'A');
  assert.equal(normalizeMatchCourt('c'), 'C');
  assert.equal(normalizeMatchCourt('invalid'), 'A');
});

test('sequential strategy splits matches into balanced contiguous court blocks', () => {
  const matches = Array.from({ length: 7 }, (_, i) => makeMatch(`m${i + 1}`));
  const proposals = computeCourtDistribution({
    matches,
    courtCount: 3,
    strategy: 'sequential',
    scope: 'unfinished',
  });

  assert.deepEqual(
    proposals.map((p) => p.gelanggang),
    ['A', 'A', 'A', 'B', 'B', 'C', 'C']
  );
});

test('alternating strategy distributes matches round-robin across courts', () => {
  const matches = Array.from({ length: 6 }, (_, i) => makeMatch(`m${i + 1}`));
  const proposals = computeCourtDistribution({
    matches,
    courtCount: 2,
    strategy: 'alternating',
    scope: 'all',
  });

  assert.deepEqual(
    proposals.map((p) => p.gelanggang),
    ['A', 'B', 'A', 'B', 'A', 'B']
  );
});

test('by_class strategy keeps matches of the same weightClass together while balancing court loads', () => {
  const matches = [
    makeMatch('1', { weightClass: 'Kelas A Putra' }),
    makeMatch('2', { weightClass: 'Kelas A Putra' }),
    makeMatch('3', { weightClass: 'Kelas A Putra' }),
    makeMatch('4', { weightClass: 'Kelas B Putri' }),
    makeMatch('5', { weightClass: 'Kelas B Putri' }),
    makeMatch('6', { weightClass: 'Tunggal Baku Putra' }),
  ];

  const proposals = computeCourtDistribution({
    matches,
    courtCount: 2,
    strategy: 'by_class',
    scope: 'unfinished',
  });

  const courtById = new Map(proposals.map((p) => [p.matchId, p.gelanggang]));
  // Kelas A (3) goes to A; Kelas B (2) + Tunggal (1) go to B => balanced 3 vs 3 and each class intact!
  assert.equal(courtById.get('1'), courtById.get('2'));
  assert.equal(courtById.get('2'), courtById.get('3'));
  assert.equal(courtById.get('4'), courtById.get('5'));
  assert.notEqual(courtById.get('1'), courtById.get('4'));
  assert.equal(courtById.get('6'), courtById.get('4'));
});

test('from_athletes strategy follows athlete gelanggang and round-robins unknown athletes', () => {
  const athletes = [
    makeAthlete('a1', 'Budi', 'Jabar', 'B'),
    makeAthlete('a2', 'Sari', 'DKI', 'C'),
  ];
  const matches = [
    makeMatch('1', { blueName: 'Budi', blueContingent: 'Jabar', redName: 'Unknown 1' }),
    makeMatch('2', { blueName: 'Unknown 2', redName: 'Sari', redContingent: 'DKI' }),
    makeMatch('3', { blueName: 'Unknown 3', redName: 'Unknown 4' }),
    makeMatch('4', { blueName: 'Unknown 5', redName: 'Unknown 6' }),
  ];

  const proposals = computeCourtDistribution({
    matches,
    athletes,
    courtCount: 3,
    strategy: 'from_athletes',
    scope: 'all',
  });

  assert.deepEqual(
    proposals.map((p) => p.gelanggang),
    ['B', 'C', 'A', 'B']
  );
});

test('waiting scope excludes active and finished matches', () => {
  const matches = [
    makeMatch('1', { status: 'finished', winner: 'blue', gelanggang: 'A' }),
    makeMatch('2', { status: 'active', gelanggang: 'A' }),
    makeMatch('3', { status: 'waiting', gelanggang: 'A' }),
    makeMatch('4', { status: 'waiting', gelanggang: 'A' }),
  ];

  const proposals = computeCourtDistribution({
    matches,
    courtCount: 2,
    strategy: 'sequential',
    scope: 'waiting',
  });

  assert.deepEqual(
    proposals.map((p) => ({ id: p.matchId, g: p.gelanggang })),
    [
      { id: '3', g: 'A' },
      { id: '4', g: 'B' },
    ]
  );

  const summary = summarizeMatchesByCourt(
    [
      matches[0],
      matches[1],
      { ...matches[2], gelanggang: 'A' },
      { ...matches[3], gelanggang: 'B' },
    ],
    ['A', 'B']
  );
  assert.deepEqual(summary, [
    { court: 'A', total: 3, waiting: 1, running: 1, finished: 1 },
    { court: 'B', total: 1, waiting: 1, running: 0, finished: 0 },
  ]);
});
