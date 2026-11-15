import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDewanAction,
  computeCornerJurusSummary,
  computeJudgeCornerScore,
  createInitialJurusState,
  createVerificationState,
  determineOfficialWinner,
  evaluateJudgeConsensus,
  evaluateVerificationConsensus,
  formatJurusScore,
  formatMatchTime,
  getRemainingTimerMs,
  isJurusMatch,
} from './ipsiRules';
import type { MatchData } from '../types/silat';

function createBaseMatch(overrides: Partial<MatchData> = {}): MatchData {
  return {
    id: 'match-01',
    arenaId: 'arena-a',
    ownerId: 'local-owner',
    matchNumber: 'Partai 01',
    weightClass: 'Kelas B Putra (50-55 kg)',
    stage: 'Final',
    blueName: 'Ahmad Fauzi',
    blueContingent: 'DKI Jakarta',
    redName: 'Budi Santoso',
    redContingent: 'Jawa Barat',
    roundDurationSec: 120,
    currentRound: 1,
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

test('evaluateJudgeConsensus awards +2 kick when 2 of 3 judges agree within window', () => {
  const t0 = 10000;
  const r1 = evaluateJudgeConsensus({}, {
    judgeId: 1,
    corner: 'blue',
    points: 2,
    timestampMs: t0,
    round: 1,
  });
  assert.equal(r1.consensusAwarded, null);

  const r2 = evaluateJudgeConsensus(r1.updatedVotes, {
    judgeId: 2,
    corner: 'blue',
    points: 2,
    timestampMs: t0 + 450,
    round: 1,
  });
  assert.ok(r2.consensusAwarded);
  assert.equal(r2.consensusAwarded?.corner, 'blue');
  assert.equal(r2.consensusAwarded?.points, 2);

  // 3rd judge late tap for same strike within debounce should NOT double-award
  const r3 = evaluateJudgeConsensus(r2.updatedVotes, {
    judgeId: 3,
    corner: 'blue',
    points: 2,
    timestampMs: t0 + 600,
    round: 1,
  });
  assert.equal(r3.consensusAwarded, null);
});

test('evaluateJudgeConsensus ignores votes outside consensus time window', () => {
  const t0 = 10000;
  const r1 = evaluateJudgeConsensus({}, {
    judgeId: 1,
    corner: 'red',
    points: 1,
    timestampMs: t0,
    round: 1,
  });
  const r2 = evaluateJudgeConsensus(r1.updatedVotes, {
    judgeId: 3,
    corner: 'red',
    points: 1,
    timestampMs: t0 + 2500,
    round: 1,
  });
  assert.equal(r2.consensusAwarded, null);
});

test('applyDewanAction handles Jatuhan (+3), Teguran (-1/-2), Peringatan (-5/-10/DQ)', () => {
  let match = createBaseMatch();

  const fallRes = applyDewanAction(match, 'fall', 'blue');
  match = { ...match, ...fallRes.patch };
  assert.equal(match.blueScore, 3);
  assert.equal(match.blueFalls, 1);

  const teg1 = applyDewanAction(match, 'teguran1', 'blue');
  match = { ...match, ...teg1.patch };
  assert.equal(match.blueScore, 2);

  const teg2 = applyDewanAction(match, 'teguran2', 'blue');
  match = { ...match, ...teg2.patch };
  assert.equal(match.blueScore, 0);

  const per1 = applyDewanAction(match, 'peringatan1', 'red');
  match = { ...match, ...per1.patch };
  assert.equal(match.redScore, -5);
  assert.equal(match.redPeringatan, 1);

  const per3 = applyDewanAction(match, 'peringatan3', 'red');
  match = { ...match, ...per3.patch };
  assert.equal(match.status, 'finished');
  assert.equal(match.winner, 'blue');
  assert.equal(per3.autoDisqualified, true);
});

test('determineOfficialWinner follows IPSI 2026 tie-breaker hierarchy', () => {
  // Tie on points -> fewer penalties wins
  const tiePenalties = createBaseMatch({
    blueScore: 12,
    redScore: 12,
    blueTeguran1: 1,
    redTeguran1: 0,
  });
  assert.equal(determineOfficialWinner(tiePenalties).winner, 'red');

  // Tie on points & penalties -> more falls (+3) wins
  const tieFalls = createBaseMatch({
    blueScore: 10,
    redScore: 10,
    blueFalls: 2,
    redFalls: 1,
  });
  assert.equal(determineOfficialWinner(tieFalls).winner, 'blue');

  // Tie on points, penalties, falls -> more kicks (+2) wins
  const tieKicks = createBaseMatch({
    blueScore: 8,
    redScore: 8,
    blueKicks: 4,
    redKicks: 2,
    bluePunches: 0,
    redPunches: 4,
  });
  assert.equal(determineOfficialWinner(tieKicks).winner, 'blue');
});

test('getRemainingTimerMs & formatMatchTime compute synced countdown accurately', () => {
  const activeMatch = createBaseMatch({
    status: 'active',
    timerRemainingMs: 120000,
    timerStartedAtMs: 50000,
  });
  const rem = getRemainingTimerMs(activeMatch, 65000); // 15s elapsed
  assert.equal(rem, 105000);
  assert.equal(formatMatchTime(rem), '01:45');
  assert.equal(formatMatchTime(0), '00:00');
});

test('Jurus Tunggal Baku / Regu scoring computes base 9.90 - wrongMoves + stamina and median - Dewan penalties', () => {
  const state = createInitialJurusState();
  state.blue.judge1.wrongMoves = 2; // 9.90 - 0.02 + 0.05 = 9.93
  state.blue.judge1.staminaScore = 5;
  state.blue.judge2.wrongMoves = 1; // 9.90 - 0.01 + 0.06 = 9.95
  state.blue.judge2.staminaScore = 6;
  state.blue.judge3.wrongMoves = 4; // 9.90 - 0.04 + 0.05 = 9.91
  state.blue.judge3.staminaScore = 5;
  state.blue.penalties.outOfBounds = 1; // -0.50

  assert.equal(computeJudgeCornerScore('Tunggal Baku', state.blue.judge1), 993);
  assert.equal(computeJudgeCornerScore('Regu', state.blue.judge2), 995);

  const summary = computeCornerJurusSummary('Tunggal Baku', state.blue);
  assert.equal(summary.median, 993);
  assert.equal(summary.penaltyTotal, 50);
  assert.equal(summary.finalScore, 943);
  assert.equal(formatJurusScore(summary.finalScore), '9.43');
});

test('Jurus Ganda / Tunggal Bebas scoring computes base 9.10 + 3 elements (0..0.30) and resolves tie-breakers', () => {
  const state = createInitialJurusState();
  // Blue: J1=9.90, J2=9.92, J3=9.94 => median 9.92, 0 penalties
  state.blue.judge1.attackScore = 26;
  state.blue.judge1.harmonyScore = 27;
  state.blue.judge1.soulScore = 27; // 910 + 80 = 990
  state.blue.judge2.attackScore = 28;
  state.blue.judge2.harmonyScore = 27;
  state.blue.judge2.soulScore = 27; // 910 + 82 = 992
  state.blue.judge3.attackScore = 28;
  state.blue.judge3.harmonyScore = 28;
  state.blue.judge3.soulScore = 28; // 910 + 84 = 994

  // Red: J1=9.90, J2=9.92, J3=9.92 => same median 9.92, lower mean (991.33 vs 992.00)
  state.red.judge1.attackScore = 26;
  state.red.judge1.harmonyScore = 27;
  state.red.judge1.soulScore = 27; // 990
  state.red.judge2.attackScore = 27;
  state.red.judge2.harmonyScore = 27;
  state.red.judge2.soulScore = 28; // 992
  state.red.judge3.attackScore = 27;
  state.red.judge3.harmonyScore = 27;
  state.red.judge3.soulScore = 28; // 992

  const jurusMatch = createBaseMatch({
    competitionCategory: 'Jurus',
    jurusType: 'Ganda',
    weightClass: 'Ganda (Putra)',
    roundDurationSec: 180,
    totalRounds: 1,
    blueScore: 992,
    redScore: 992,
    jurusState: state,
  });

  assert.equal(isJurusMatch(jurusMatch), true);
  const decision = determineOfficialWinner(jurusMatch);
  assert.equal(decision.winner, 'blue');
  assert.equal(decision.winMethod, 'Menang Angka');
});

test('evaluateVerificationConsensus resolves waiting, 2-of-3 agreement, and 3-way split', () => {
  const initial = createVerificationState('jatuhan', true, 12345);
  assert.equal(initial.active, true);
  assert.equal(initial.kind, 'jatuhan');
  assert.equal(evaluateVerificationConsensus(initial).consensus, 'waiting');
  assert.equal(evaluateVerificationConsensus(initial).canProcess, false);

  const oneVote = { ...initial, j1Vote: 'blue' as const };
  assert.equal(evaluateVerificationConsensus(oneVote).votedCount, 1);
  assert.equal(evaluateVerificationConsensus(oneVote).consensus, 'waiting');

  const blueConsensus = { ...oneVote, j3Vote: 'blue' as const };
  const blueSummary = evaluateVerificationConsensus(blueConsensus);
  assert.equal(blueSummary.votedCount, 2);
  assert.equal(blueSummary.consensus, 'blue');
  assert.equal(blueSummary.hasConsensus, true);
  assert.equal(blueSummary.canProcess, true);
  assert.equal(blueSummary.label, 'SAH BIRU');

  const redConsensus = { ...initial, j1Vote: 'red' as const, j2Vote: 'red' as const, j3Vote: 'invalid' as const };
  const redSummary = evaluateVerificationConsensus(redConsensus);
  assert.equal(redSummary.consensus, 'red');
  assert.equal(redSummary.hasConsensus, true);
  assert.equal(redSummary.label, 'SAH MERAH');

  const invalidConsensus = { ...initial, j2Vote: 'invalid' as const, j3Vote: 'invalid' as const };
  assert.equal(evaluateVerificationConsensus(invalidConsensus).consensus, 'invalid');
  assert.equal(evaluateVerificationConsensus(invalidConsensus).label, 'TIDAK SAH');

  const splitVotes = { ...initial, j1Vote: 'blue' as const, j2Vote: 'red' as const, j3Vote: 'invalid' as const };
  const splitSummary = evaluateVerificationConsensus(splitVotes);
  assert.equal(splitSummary.allVoted, true);
  assert.equal(splitSummary.hasConsensus, false);
  assert.equal(splitSummary.canProcess, true);
  assert.equal(splitSummary.consensus, 'split');
});


