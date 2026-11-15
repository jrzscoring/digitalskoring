import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireOfflineSyncLock,
  clearPendingFirestoreOps,
  enqueueFirestoreOp,
  getBackupStorageKey,
  getPendingFirestoreOps,
  isOfflineNetworkError,
  isPermissionDeniedError,
  isRtdbBackupDirty,
  markRtdbBackupSynced,
  readOfflineBackup,
  releaseOfflineSyncLock,
  removePendingFirestoreOps,
  saveFirestoreSnapshotBackup,
  saveRtdbLocalBackup,
  type LocalStorePayload,
} from './offlineSync.ts';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function makeSamplePayload(blueScore = 0): LocalStorePayload {
  return {
    arena: {
      id: 'arena-test',
      name: 'Gelanggang A',
      tournamentName: 'Kejuaraan IPSI 2026',
      ownerId: 'owner-1',
      activeMatchId: 'partai-01',
    },
    matches: [
      {
        id: 'partai-01',
        arenaId: 'arena-test',
        ownerId: 'owner-1',
        matchNumber: 'Partai 01',
        weightClass: 'Kelas B Putra',
        stage: 'Final',
        blueName: 'Atlet Biru',
        blueContingent: 'Kontingen A',
        redName: 'Atlet Merah',
        redContingent: 'Kontingen B',
        roundDurationSec: 120,
        currentRound: 1,
        status: 'active',
        timerRemainingMs: 120000,
        timerStartedAtMs: 0,
        blueScore,
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
      },
    ],
    eventsByMatch: { 'partai-01': [] },
    athletes: [],
    brackets: [],
  };
}

function setupMockWindow() {
  const storage = createMemoryStorage();
  (globalThis as Record<string, unknown>).window = {
    localStorage: storage,
  };
  return storage;
}

test('RTDB backup preserves dirty flag against older write completion', () => {
  setupMockWindow();
  const arenaId = 'gelanggang-a';

  const first = saveRtdbLocalBackup(arenaId, makeSamplePayload(3), true);
  assert.equal(isRtdbBackupDirty(arenaId), true);

  const second = saveRtdbLocalBackup(arenaId, makeSamplePayload(6), true);
  assert.ok(second.lastUpdatedAtMs > first.lastUpdatedAtMs);

  // Stale ack from first write must NOT clear dirty flag of newer write
  markRtdbBackupSynced(arenaId, first.lastUpdatedAtMs);
  assert.equal(isRtdbBackupDirty(arenaId), true);

  // Ack matching newest write clears dirty flag
  markRtdbBackupSynced(arenaId, second.lastUpdatedAtMs);
  assert.equal(isRtdbBackupDirty(arenaId), false);
  const record = readOfflineBackup(arenaId);
  assert.equal(record?.payload.matches[0].blueScore, 6);
  assert.ok(getBackupStorageKey(arenaId).includes('gelanggang-a'));
});

test('Firestore offline queue coalesces matching key-sets, preserves distinct update schemas & finish status, and drains cleanly', () => {
  setupMockWindow();
  const arenaId = 'arena-fs';

  // Op 1 & Op 2: identical keys on same match -> should coalesce
  enqueueFirestoreOp(
    arenaId,
    {
      opType: 'update',
      pathSegments: ['arenas', arenaId, 'matches', 'partai-01'],
      timestampMode: 'update',
      data: { timerRemainingMs: 110000, timerStartedAtMs: 0, status: 'paused', currentRound: 1 },
    },
    makeSamplePayload(0)
  );
  enqueueFirestoreOp(
    arenaId,
    {
      opType: 'update',
      pathSegments: ['arenas', arenaId, 'matches', 'partai-01'],
      timestampMode: 'update',
      data: { timerRemainingMs: 95000, timerStartedAtMs: 0, status: 'paused', currentRound: 1 },
    },
    makeSamplePayload(0)
  );
  assert.equal(getPendingFirestoreOps(arenaId).length, 1);
  assert.equal(getPendingFirestoreOps(arenaId)[0].data?.timerRemainingMs, 95000);

  // Op 3: different key-set (score vs timer) -> must NOT coalesce so Firestore affectedKeys().hasOnly() stays valid
  enqueueFirestoreOp(
    arenaId,
    {
      opType: 'update',
      pathSegments: ['arenas', arenaId, 'matches', 'partai-01'],
      timestampMode: 'update',
      data: { blueScore: 3, blueFalls: 1 },
    },
    makeSamplePayload(3)
  );
  assert.equal(getPendingFirestoreOps(arenaId).length, 2);

  // Op 4: finish transition -> never coalesced away
  enqueueFirestoreOp(
    arenaId,
    {
      opType: 'update',
      pathSegments: ['arenas', arenaId, 'matches', 'partai-01'],
      timestampMode: 'update',
      data: { status: 'finished', winner: 'blue', winMethod: 'Poin Mutlak' },
    },
    makeSamplePayload(3)
  );
  const ops = getPendingFirestoreOps(arenaId);
  assert.equal(ops.length, 3);

  // Removing first op leaves remaining 2 in order and keeps dirty=true
  const afterFirst = removePendingFirestoreOps(arenaId, [ops[0].id]);
  assert.equal(afterFirst.length, 2);
  assert.equal(readOfflineBackup(arenaId)?.dirty, true);

  // Mirror snapshot save while dirty must preserve pending ops
  saveFirestoreSnapshotBackup(arenaId, makeSamplePayload(3));
  assert.equal(getPendingFirestoreOps(arenaId).length, 2);

  clearPendingFirestoreOps(arenaId);
  assert.equal(getPendingFirestoreOps(arenaId).length, 0);
  assert.equal(readOfflineBackup(arenaId)?.dirty, false);
});

test('Multi-tab sync lock prevents concurrent replay until released', () => {
  setupMockWindow();
  const arenaId = 'arena-lock';

  assert.equal(acquireOfflineSyncLock(arenaId, 'tab-A'), true);
  assert.equal(acquireOfflineSyncLock(arenaId, 'tab-B'), false);
  // Same owner can re-acquire/renew
  assert.equal(acquireOfflineSyncLock(arenaId, 'tab-A'), true);

  releaseOfflineSyncLock(arenaId, 'tab-B');
  // Releasing by non-owner should not drop tab-A lock
  assert.equal(acquireOfflineSyncLock(arenaId, 'tab-B'), false);

  releaseOfflineSyncLock(arenaId, 'tab-A');
  assert.equal(acquireOfflineSyncLock(arenaId, 'tab-B'), true);
});

test('Offline/network vs permission error classifiers', () => {
  assert.equal(isOfflineNetworkError({ code: 'unavailable', message: 'Network unavailable' }), true);
  assert.equal(isOfflineNetworkError(new Error('Failed to get document because the client is offline.')), true);
  assert.equal(isOfflineNetworkError({ code: 'permission-denied', message: 'Missing permissions' }), false);
  assert.equal(isPermissionDeniedError({ code: 'permission-denied', message: 'Missing permissions' }), true);
});
