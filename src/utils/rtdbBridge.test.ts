import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchData, MatchEvent } from '../types/silat';
import type { LocalStorePayload } from './offlineSync';
import {
  computeRtdbPatch,
  normalizeRtdbPayload,
  toRtdbWireSnapshot,
} from './rtdbBridge';

function makeBaseStore(): LocalStorePayload {
  const match: MatchData = {
    id: 'partai-01',
    arenaId: 'arena-abc',
    ownerId: 'owner-1',
    matchNumber: 'Partai 01',
    weightClass: 'Kelas B Putra',
    stage: 'Final',
    gelanggang: 'A',
    blueName: 'Andi',
    blueContingent: 'DKI',
    redName: 'Budi',
    redContingent: 'Jabar',
    roundDurationSec: 120,
    currentRound: 1,
    totalRounds: 3,
    status: 'active',
    timerRemainingMs: 120000,
    timerStartedAtMs: 1000,
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
  };

  return {
    arena: {
      id: 'arena-abc',
      name: 'Gelanggang A',
      tournamentName: 'Kejuaraan Nasional',
      ownerId: 'owner-1',
      activeMatchId: 'partai-01',
    },
    matches: [match],
    eventsByMatch: { 'partai-01': [] },
    athletes: [],
    brackets: [],
  };
}

test('toRtdbWireSnapshot stores events keyed by ID and normalizeRtdbPayload restores them sorted newest-first', () => {
  const base = makeBaseStore();
  const ev1: MatchEvent = {
    id: 'ev-1',
    arenaId: 'arena-abc',
    matchId: 'partai-01',
    ownerId: 'owner-1',
    actorRole: 'Juri 1',
    corner: 'blue',
    type: 'judge_press',
    pointsDelta: 1,
    round: 1,
    matchTimeFormatted: '01:55',
    description: 'P',
    undone: false,
    createdAtMs: 1000,
  };
  const ev2: MatchEvent = {
    ...ev1,
    id: 'ev-2',
    actorRole: 'Juri 2',
    createdAtMs: 2000,
  };
  base.eventsByMatch['partai-01'] = [ev1, ev2];

  const wire = toRtdbWireSnapshot(base, 'tab-sec');
  assert.equal(typeof wire.eventsByMatch['partai-01']['ev-1'], 'object');
  assert.equal(typeof wire.eventsByMatch['partai-01']['ev-2'], 'object');
  assert.equal(wire._bridgeWriterId, 'tab-sec');

  const restored = normalizeRtdbPayload(wire);
  assert.ok(restored);
  assert.deepEqual(
    restored.eventsByMatch['partai-01'].map((e) => e.id),
    ['ev-2', 'ev-1']
  );
});

test('computeRtdbPatch emits granular paths so Juri 1, Juri 2, and Timer never clobber each other', () => {
  const prev = makeBaseStore();
  const nextJuri1: LocalStorePayload = {
    ...prev,
    matches: [
      {
        ...prev.matches[0],
        judge1Vote: { corner: 'blue', points: 1, timestampMs: 1200, round: 1 },
      },
    ],
    eventsByMatch: {
      'partai-01': [
        {
          id: 'ev-j1',
          arenaId: 'arena-abc',
          matchId: 'partai-01',
          ownerId: 'owner-1',
          actorRole: 'Juri 1',
          corner: 'blue',
          type: 'judge_press',
          pointsDelta: 1,
          round: 1,
          matchTimeFormatted: '01:55',
          description: 'P',
          undone: false,
          createdAtMs: 1200,
        },
      ],
    },
  };

  const patch = computeRtdbPatch(prev, nextJuri1, 'tab-juri-1');
  assert.ok(patch);
  assert.deepEqual(patch['matches/0/judge1Vote'], {
    corner: 'blue',
    points: 1,
    timestampMs: 1200,
    round: 1,
  });
  assert.ok(patch['eventsByMatch/partai-01/ev-j1']);
  assert.equal('matches/0/judge2Vote' in patch, false);
  assert.equal('matches/0/timerStartedAtMs' in patch, false);
  assert.equal(patch._bridgeWriterId, 'tab-juri-1');
});

test('computeRtdbPatch preserves recently absorbed station events during Firestore snapshot lag', () => {
  const evRecent: MatchEvent = {
    id: 'ev-recent',
    arenaId: 'arena-abc',
    matchId: 'partai-01',
    ownerId: 'owner-1',
    actorRole: 'Juri 1',
    corner: 'blue',
    type: 'judge_press',
    pointsDelta: 1,
    round: 1,
    matchTimeFormatted: '01:50',
    description: 'P',
    undone: false,
    createdAtMs: 10000,
  };
  const prev = makeBaseStore();
  prev.eventsByMatch['partai-01'] = [evRecent];

  // Firestore match snapshot arrives 100ms before cloudEvents snapshot includes ev-recent
  const nextCloudlag = makeBaseStore();
  nextCloudlag.matches = [{ ...nextCloudlag.matches[0], blueScore: 1 }];
  nextCloudlag.eventsByMatch['partai-01'] = [];

  const patch = computeRtdbPatch(prev, nextCloudlag, 'tab-sec', {
    preserveRecentEventsWindowMs: 15000,
    nowMs: 12000,
  });
  assert.ok(patch);
  assert.equal(patch['matches/0/blueScore'], 1);
  assert.equal('eventsByMatch/partai-01/ev-recent' in patch, false);
});
