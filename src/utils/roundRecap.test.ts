import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchData, MatchEvent } from '../types/silat';
import { computeRoundPointRecap } from './roundRecap';

function makeBaseMatch(overrides: Partial<MatchData> = {}): MatchData {
  return {
    id: 'partai-01',
    arenaId: 'gelanggang-a',
    ownerId: 'user-1',
    matchNumber: 'Partai 01',
    weightClass: 'Kelas B Putra (50-55 kg)',
    stage: 'Final',
    competitionCategory: 'Tanding',
    blueName: 'Ahmad Fauzi',
    blueContingent: 'DKI Jakarta',
    redName: 'Budi Santoso',
    redContingent: 'Jawa Barat',
    roundDurationSec: 120,
    currentRound: 2,
    totalRounds: 3,
    status: 'active',
    timerRemainingMs: 65000,
    timerStartedAtMs: 0,
    blueScore: 10,
    redScore: 5,
    bluePunches: 4,
    blueKicks: 2,
    blueFalls: 1,
    blueBinaan: 0,
    blueTeguran1: 1,
    blueTeguran2: 0,
    bluePeringatan: 0,
    redPunches: 3,
    redKicks: 1,
    redFalls: 1,
    redBinaan: 0,
    redTeguran1: 0,
    redTeguran2: 0,
    redPeringatan: 0,
    winner: '',
    winMethod: '',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<MatchEvent>): MatchEvent {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    arenaId: 'gelanggang-a',
    matchId: 'partai-01',
    ownerId: 'user-1',
    actorRole: 'Dewan',
    corner: 'blue',
    type: 'punch',
    pointsDelta: 1,
    round: 1,
    matchTimeFormatted: '01:45',
    description: 'Pukulan sah',
    undone: false,
    ...overrides,
  };
}

test('computeRoundPointRecap aggregates Tanding rounds, penalties, cancel_fall, and ignores undone/judge_press', () => {
  const match = makeBaseMatch({ currentRound: 3, totalRounds: 3 });
  const events: MatchEvent[] = [
    // Noise that must be ignored
    makeEvent({ type: 'judge_press', pointsDelta: 0, round: 1, corner: 'blue' }),
    makeEvent({ type: 'kick', pointsDelta: 2, round: 1, corner: 'red', undone: true }),
    // Round 1: Blue +1 +2 +3 -1 = 5; Red +2 = 2
    makeEvent({ type: 'punch', pointsDelta: 1, round: 1, corner: 'blue' }),
    makeEvent({ type: 'kick', pointsDelta: 2, round: 1, corner: 'blue' }),
    makeEvent({ type: 'fall', pointsDelta: 3, round: 1, corner: 'blue' }),
    makeEvent({ type: 'teguran1', pointsDelta: -1, round: 1, corner: 'blue' }),
    makeEvent({ type: 'kick', pointsDelta: 2, round: 1, corner: 'red' }),
    // Round 2: Red fall +3 then cancel_fall -3 => gross 0; Red punch +1; Blue kick +2 +2 = 4
    makeEvent({ type: 'fall', pointsDelta: 3, round: 2, corner: 'red' }),
    makeEvent({ type: 'cancel_fall', pointsDelta: -3, round: 2, corner: 'red' }),
    makeEvent({ type: 'punch', pointsDelta: 1, round: 2, corner: 'red' }),
    makeEvent({ type: 'kick', pointsDelta: 2, round: 2, corner: 'blue' }),
    makeEvent({ type: 'kick', pointsDelta: 2, round: 2, corner: 'blue' }),
    // Round 3: Red peringatan1 (-5) + kick (+2) => net -3
    makeEvent({ type: 'kick', pointsDelta: 2, round: 3, corner: 'red' }),
    makeEvent({ type: 'peringatan1', pointsDelta: -5, round: 3, corner: 'red' }),
  ];

  const recap = computeRoundPointRecap(match, events);

  assert.equal(recap.isJurus, false);
  assert.equal(recap.roundCount, 3);
  assert.equal(recap.hasEventTimeline, true);

  assert.equal(recap.rows[0].label, 'Ronde 1');
  assert.equal(recap.rows[0].blueGross, 6);
  assert.equal(recap.rows[0].bluePenalties, 1);
  assert.equal(recap.rows[0].blueNet, 5);
  assert.equal(recap.rows[0].blueCumulative, 5);
  assert.equal(recap.rows[0].redNet, 2);

  assert.equal(recap.rows[1].label, 'Ronde 2');
  assert.equal(recap.rows[1].redFallPts, 0);
  assert.equal(recap.rows[1].redPenalties, 0);
  assert.equal(recap.rows[1].redNet, 1);
  assert.equal(recap.rows[1].blueNet, 4);
  assert.equal(recap.rows[1].blueCumulative, 9);
  assert.equal(recap.rows[1].redCumulative, 3);

  assert.equal(recap.rows[2].label, 'Ronde 3');
  assert.equal(recap.rows[2].redPenalties, 5);
  assert.equal(recap.rows[2].redNet, -3);
  assert.equal(recap.rows[2].redCumulative, 0);

  assert.equal(recap.totalBlueNet, 9);
  assert.equal(recap.totalRedNet, 0);
  assert.equal(recap.leadingCorner, 'blue');
  assert.equal(recap.scoreDiff, 9);
});

test('computeRoundPointRecap supports 2-round matches and fallback when no events exist yet', () => {
  const match = makeBaseMatch({
    totalRounds: 2,
    currentRound: 2,
    blueScore: 7,
    redScore: 4,
    bluePunches: 2,
    blueKicks: 1,
    blueFalls: 1,
    redPunches: 2,
    redKicks: 1,
    redFalls: 0,
  });

  const recap = computeRoundPointRecap(match, []);
  assert.equal(recap.roundCount, 2);
  assert.equal(recap.hasEventTimeline, false);
  assert.equal(recap.rows[0].blueNet, 0);
  assert.equal(recap.rows[1].blueNet, 7);
  assert.equal(recap.rows[1].redNet, 4);
  assert.equal(recap.rows[1].blueCumulative, 7);
  assert.equal(recap.rows[1].redCumulative, 4);
});

test('computeRoundPointRecap formats Jurus scores in 0.00-10.00 scale', () => {
  const jurusMatch = makeBaseMatch({
    competitionCategory: 'Jurus',
    jurusType: 'Tunggal Baku',
    weightClass: 'Tunggal Baku Putra',
    totalRounds: 1,
    currentRound: 1,
    blueScore: 992,
    redScore: 940,
  });

  const events: MatchEvent[] = [
    makeEvent({
      type: 'jurus_penalty',
      corner: 'red',
      pointsDelta: -50,
      round: 1,
    }),
  ];

  const recap = computeRoundPointRecap(jurusMatch, events);
  assert.equal(recap.isJurus, true);
  assert.equal(recap.roundCount, 1);
  assert.equal(recap.totalBlueNet, 9.92);
  assert.equal(recap.totalRedNet, 9.4);
  assert.equal(recap.totalRedPenalties, 0.5);
  assert.equal(recap.totalRedGross, 9.9);
  assert.equal(recap.leadingCorner, 'blue');
});
