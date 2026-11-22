import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireOfflineSyncLock,
  clearIndexedDbSyncQueue,
  clearPendingFirestoreOps,
  enqueueFirestoreOp,
  enqueueIndexedDbSyncBatch,
  enqueueIndexedDbSyncItem,
  getBackupStorageKey,
  getIndexedDbSyncQueue,
  getIndexedDbSyncQueueCount,
  getPendingFirestoreOps,
  isOfflineNetworkError,
  isPermissionDeniedError,
  isRtdbBackupDirty,
  markIndexedDbSyncItemAttempt,
  markRtdbBackupSynced,
  readOfflineBackup,
  releaseOfflineSyncLock,
  removeIndexedDbSyncItems,
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

function createMockIdbFactory(): IDBFactory {
  const databases = new Map<
    string,
    { version: number; stores: Map<string, { keyPath?: string; indexes: Set<string>; records: Map<unknown, unknown> }> }
  >();

  return {
    open(name: string, version = 1) {
      let dbRecord = databases.get(name);
      const isUpgrade = !dbRecord || dbRecord.version < version;
      if (!dbRecord) {
        dbRecord = { version, stores: new Map() };
        databases.set(name, dbRecord);
      } else if (isUpgrade) {
        dbRecord.version = version;
      }

      const dbObj: Record<string, unknown> = {
        objectStoreNames: {
          contains: (storeName: string) => dbRecord!.stores.has(storeName),
        },
        createObjectStore: (storeName: string, opts?: { keyPath?: string }) => {
          const storeData = {
            keyPath: opts?.keyPath,
            indexes: new Set<string>(),
            records: new Map<unknown, unknown>(),
          };
          dbRecord!.stores.set(storeName, storeData);
          return {
            createIndex: (idxName: string) => {
              storeData.indexes.add(idxName);
            },
          };
        },
        close: () => {},
        transaction: () => {
          const tx: Record<string, unknown> = {
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            objectStore: (storeName: string) => {
              const storeData = dbRecord!.stores.get(storeName)!;
              const finishTx = () => queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
              return {
                indexNames: { contains: (idx: string) => storeData.indexes.has(idx) },
                index: () => ({
                  getAll: (filterVal: unknown) => {
                    const idxReq: Record<string, unknown> = { result: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      const list = Array.from(storeData.records.values()).filter(
                        (r) => (r as Record<string, unknown>).arenaId === filterVal
                      );
                      idxReq.result = list;
                      (idxReq.onsuccess as (() => void) | null)?.();
                    });
                    return idxReq;
                  },
                }),
                getAll: () => {
                  const req: Record<string, unknown> = { result: null, onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    req.result = Array.from(storeData.records.values());
                    (req.onsuccess as (() => void) | null)?.();
                  });
                  return req;
                },
                get: (key: unknown) => {
                  const req: Record<string, unknown> = { result: null, onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    req.result = storeData.records.get(key);
                    (req.onsuccess as (() => void) | null)?.();
                  });
                  return req;
                },
                put: (val: unknown, explicitKey?: unknown) => {
                  const key = storeData.keyPath
                    ? (val as Record<string, unknown>)[storeData.keyPath]
                    : explicitKey;
                  storeData.records.set(key, JSON.parse(JSON.stringify(val)));
                  finishTx();
                },
                delete: (key: unknown) => {
                  storeData.records.delete(key);
                  finishTx();
                },
                clear: () => {
                  storeData.records.clear();
                  finishTx();
                },
              };
            },
          };
          return tx;
        },
      };

      const openReq: Record<string, unknown> = {
        result: dbObj,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      queueMicrotask(() => {
        if (isUpgrade) {
          (openReq.onupgradeneeded as (() => void) | null)?.();
        }
        (openReq.onsuccess as (() => void) | null)?.();
      });

      return openReq as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

test('IndexedDB sync_queue persists offline score updates in order and drains cleanly after sync', async () => {
  const idb = createMockIdbFactory();
  const arenaId = 'gelanggang-a';

  await enqueueIndexedDbSyncItem(
    {
      arenaId,
      backend: 'rtdb',
      kind: 'score_update',
      rtdbPath: `silat_arenas/${arenaId}`,
      rtdbPayload: makeSamplePayload(1),
    },
    idb
  );
  await enqueueIndexedDbSyncItem(
    {
      arenaId,
      backend: 'rtdb',
      kind: 'score_update',
      rtdbPath: `silat_arenas/${arenaId}`,
      rtdbPayload: makeSamplePayload(3),
    },
    idb
  );
  await enqueueIndexedDbSyncBatch(
    [
      {
        arenaId,
        backend: 'firestore',
        kind: 'score_update',
        firestoreOp: {
          id: 'fop-1',
          opType: 'update',
          pathSegments: ['arenas', arenaId, 'matches', 'partai-01'],
          data: { blueScore: 3 },
          timestampMode: 'update',
          createdAtMs: Date.now(),
        },
      },
    ],
    idb
  );

  const rtdbQueue = await getIndexedDbSyncQueue(arenaId, 'rtdb', idb);
  assert.equal(rtdbQueue.length, 2);
  assert.equal((rtdbQueue[0].rtdbPayload as LocalStorePayload).matches[0].blueScore, 1);
  assert.equal((rtdbQueue[1].rtdbPayload as LocalStorePayload).matches[0].blueScore, 3);
  assert.equal(await getIndexedDbSyncQueueCount(arenaId, 'rtdb', idb), 2);
  assert.equal(await getIndexedDbSyncQueueCount(arenaId, 'firestore', idb), 1);

  await markIndexedDbSyncItemAttempt(rtdbQueue[0].id, 'Network timeout', idb);
  const afterAttempt = await getIndexedDbSyncQueue(arenaId, 'rtdb', idb);
  assert.equal(afterAttempt[0].attempts, 1);
  assert.equal(afterAttempt[0].lastError, 'Network timeout');

  await removeIndexedDbSyncItems(
    rtdbQueue.map((e) => e.id),
    idb
  );
  assert.equal(await getIndexedDbSyncQueueCount(arenaId, 'rtdb', idb), 0);
  assert.equal(await getIndexedDbSyncQueueCount(arenaId, 'firestore', idb), 1);

  await clearIndexedDbSyncQueue(arenaId, 'firestore', idb);
  assert.equal(await getIndexedDbSyncQueueCount(arenaId, undefined, idb), 0);
});

