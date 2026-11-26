import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_OFFICIAL_PROTESTS,
  applyOfficialProtestDelta,
  canRecordOfficialProtest,
  getCornerProtestStatus,
  normalizeProtestCount,
} from './officialProtest';

test('normalizeProtestCount clamps protest values strictly within 0..2', () => {
  assert.equal(normalizeProtestCount(undefined), 0);
  assert.equal(normalizeProtestCount(null), 0);
  assert.equal(normalizeProtestCount(-3), 0);
  assert.equal(normalizeProtestCount(0), 0);
  assert.equal(normalizeProtestCount(1), 1);
  assert.equal(normalizeProtestCount(2), 2);
  assert.equal(normalizeProtestCount(5), MAX_OFFICIAL_PROTESTS);
});

test('getCornerProtestStatus starts with 2 visible cards and removes 1 card per protest', () => {
  const freshMatch = { blueProtests: 0, redProtests: 0 };
  const initialBlue = getCornerProtestStatus(freshMatch, 'blue');
  assert.equal(initialBlue.usedCount, 0);
  assert.equal(initialBlue.remainingCount, 2);
  assert.deepEqual(initialBlue.visibleCardNumbers, [1, 2]);
  assert.equal(initialBlue.exhausted, false);

  const afterOneBlue = getCornerProtestStatus({ blueProtests: 1, redProtests: 0 }, 'blue');
  assert.equal(afterOneBlue.usedCount, 1);
  assert.equal(afterOneBlue.remainingCount, 1);
  assert.deepEqual(afterOneBlue.visibleCardNumbers, [1]);
  assert.equal(afterOneBlue.exhausted, false);

  const afterTwoBlue = getCornerProtestStatus({ blueProtests: 2, redProtests: 1 }, 'blue');
  assert.equal(afterTwoBlue.usedCount, 2);
  assert.equal(afterTwoBlue.remainingCount, 0);
  assert.deepEqual(afterTwoBlue.visibleCardNumbers, []);
  assert.equal(afterTwoBlue.exhausted, true);

  const afterOneRed = getCornerProtestStatus({ blueProtests: 2, redProtests: 1 }, 'red');
  assert.equal(afterOneRed.usedCount, 1);
  assert.equal(afterOneRed.remainingCount, 1);
  assert.deepEqual(afterOneRed.visibleCardNumbers, [1]);
});

test('applyOfficialProtestDelta increments and reverts within 0..2 bounds', () => {
  assert.equal(applyOfficialProtestDelta(undefined, 1), 1);
  assert.equal(applyOfficialProtestDelta(1, 1), 2);
  assert.equal(applyOfficialProtestDelta(2, 1), 2);
  assert.equal(applyOfficialProtestDelta(2, -1), 1);
  assert.equal(applyOfficialProtestDelta(1, -1), 0);
  assert.equal(applyOfficialProtestDelta(0, -1), 0);
});

test('canRecordOfficialProtest blocks when quota is exhausted or match is finished', () => {
  assert.equal(
    canRecordOfficialProtest({ status: 'active', blueProtests: 0, redProtests: 0 }, 'blue'),
    true
  );
  assert.equal(
    canRecordOfficialProtest({ status: 'paused', blueProtests: 1, redProtests: 0 }, 'blue'),
    true
  );
  assert.equal(
    canRecordOfficialProtest({ status: 'active', blueProtests: 2, redProtests: 0 }, 'blue'),
    false
  );
  assert.equal(
    canRecordOfficialProtest({ status: 'finished', blueProtests: 0, redProtests: 0 }, 'blue'),
    false
  );
});
