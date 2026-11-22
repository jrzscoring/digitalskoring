import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { onValue, ref, set } from 'firebase/database';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, rtdb, userRtdbProjectId } from '../lib/firebase';
import type { ArenaData, AthleteData, BracketMatchSlot, MatchData, MatchEvent } from '../types/silat';
import {
  acquireOfflineSyncLock,
  clearPendingFirestoreOps,
  enqueueIndexedDbSyncBatch,
  getBackupStorageKey,
  getIndexedDbSyncQueue,
  getIndexedDbSyncQueueCount,
  getPendingFirestoreOps,
  isBrowserOnline,
  isOfflineNetworkError,
  isPermissionDeniedError,
  isRtdbBackupDirty,
  markIndexedDbSyncItemAttempt,
  markRtdbBackupSynced,
  readOfflineBackup,
  readRecordFromIndexedDb,
  releaseOfflineSyncLock,
  removeIndexedDbSyncItems,
  removePendingFirestoreOps,
  saveFirestoreSnapshotBackup,
  saveRtdbLocalBackup,
  type LocalStorePayload,
  type OfflineBackupRecord,
  type QueuedSyncEntry,
} from '../utils/offlineSync';

export type { LocalStorePayload };

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `id-${Date.now()}`;
}

export function sanitizeForRtdb(payload: LocalStorePayload): LocalStorePayload {
  return JSON.parse(JSON.stringify(payload)) as LocalStorePayload;
}

export function normalizeRtdbPayload(raw: unknown): LocalStorePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<LocalStorePayload>;
  if (!data.arena || !data.arena.id) return null;

  const rawMatches = data.matches;
  const matchesArray: MatchData[] = Array.isArray(rawMatches)
    ? rawMatches.filter(Boolean)
    : rawMatches && typeof rawMatches === 'object'
    ? Object.values(rawMatches as Record<string, MatchData>).filter(Boolean)
    : [];

  if (matchesArray.length === 0) return null;

  const eventsByMatch: Record<string, MatchEvent[]> = {};
  if (data.eventsByMatch && typeof data.eventsByMatch === 'object') {
    for (const [mId, list] of Object.entries(data.eventsByMatch)) {
      if (Array.isArray(list)) {
        eventsByMatch[mId] = list.filter(Boolean);
      } else if (list && typeof list === 'object') {
        eventsByMatch[mId] = Object.values(list as Record<string, MatchEvent>).filter(Boolean);
      }
    }
  }

  const rawAthletes = data.athletes;
  const athletesArray: AthleteData[] = Array.isArray(rawAthletes)
    ? rawAthletes.filter(Boolean)
    : rawAthletes && typeof rawAthletes === 'object'
    ? Object.values(rawAthletes as Record<string, AthleteData>).filter(Boolean)
    : [];

  const rawBrackets = data.brackets;
  const bracketsArray: BracketMatchSlot[] = Array.isArray(rawBrackets)
    ? rawBrackets.filter(Boolean)
    : rawBrackets && typeof rawBrackets === 'object'
    ? Object.values(rawBrackets as Record<string, BracketMatchSlot>).filter(Boolean)
    : [];

  return {
    arena: data.arena,
    matches: matchesArray,
    eventsByMatch,
    athletes: athletesArray,
    brackets: bracketsArray,
  };
}

interface UseFirestoreSyncParams {
  user: User | null;
  authReady: boolean;
  joinedArenaId: string | null;
  rtdbArenaId: string;
  activeMatchId: string;
  getSeedPayload: () => LocalStorePayload;
  onRtdbSync: (payload: LocalStorePayload) => void;
  onFirestoreMirror?: (payload: LocalStorePayload) => void;
  onPendingOpsCountChange?: (count: number) => void;
}

export function useFirestoreSync({
  user,
  authReady,
  joinedArenaId,
  rtdbArenaId,
  activeMatchId,
  getSeedPayload,
  onRtdbSync,
  onFirestoreMirror,
  onPendingOpsCountChange,
}: UseFirestoreSyncParams) {
  const [cloudArena, setCloudArena] = useState<ArenaData | null>(null);
  const [cloudMatches, setCloudMatches] = useState<MatchData[]>([]);
  const [cloudEvents, setCloudEvents] = useState<MatchEvent[]>([]);
  const [cloudAthletes, setCloudAthletes] = useState<AthleteData[]>([]);
  const [cloudBrackets, setCloudBrackets] = useState<BracketMatchSlot[]>([]);
  const [rtdbConnected, setRtdbConnected] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => isBrowserOnline());
  const [reconnectTick, setReconnectTick] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  const tabTokenRef = useRef<string>(`tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const flushingRtdbRef = useRef(false);
  const flushingFirestoreRef = useRef(false);
  const hasPendingRtdbQueueRef = useRef(false);

  const isFirestoreActive = Boolean(user && cloudArena);

  // Track browser online/offline transitions and wake-up focus events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setReconnectTick((n) => n + 1);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && isBrowserOnline()) {
        setIsOnline(true);
        setReconnectTick((n) => n + 1);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, []);

  // Flush queued RTDB updates from IndexedDB (and dirty local backup) to Firebase RTDB when online & connected
  const flushRtdbBackup = useCallback(
    async (targetId: string) => {
      if (!rtdb || !isBrowserOnline() || flushingRtdbRef.current) return;

      const initialQueue = await getIndexedDbSyncQueue(targetId, 'rtdb');
      const initialBackup =
        readOfflineBackup(targetId) ??
        (await readRecordFromIndexedDb<OfflineBackupRecord>(getBackupStorageKey(targetId)));
      const hasDirtyBackup = Boolean(
        initialBackup && initialBackup.targetBackend === 'rtdb' && initialBackup.dirty
      );

      if (initialQueue.length === 0 && !hasDirtyBackup) {
        hasPendingRtdbQueueRef.current = false;
        onPendingOpsCountChange?.(0);
        return;
      }

      if (!acquireOfflineSyncLock(targetId, tabTokenRef.current)) return;
      flushingRtdbRef.current = true;
      try {
        // Loop if newer offline score edits arrived while the Firebase write was in flight
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (!isBrowserOnline()) break;

          const queueEntries = await getIndexedDbSyncQueue(targetId, 'rtdb');
          const latestBackup =
            readOfflineBackup(targetId) ??
            (await readRecordFromIndexedDb<OfflineBackupRecord>(getBackupStorageKey(targetId)));
          const backupDirty = Boolean(
            latestBackup && latestBackup.targetBackend === 'rtdb' && latestBackup.dirty
          );

          if (queueEntries.length === 0 && !backupDirty) {
            hasPendingRtdbQueueRef.current = false;
            onPendingOpsCountChange?.(0);
            break;
          }

          if (queueEntries.length > 0) {
            const fullPath = `silat_arenas/${targetId}`;
            const hasOnlyFullSnapshots = queueEntries.every(
              (entry) => (!entry.rtdbPath || entry.rtdbPath === fullPath) && entry.rtdbPayload
            );

            if (hasOnlyFullSnapshots) {
              const latestEntry = queueEntries[queueEntries.length - 1];
              const payloadToSync = latestEntry.rtdbPayload as LocalStorePayload;
              await set(ref(rtdb, fullPath), sanitizeForRtdb(payloadToSync));
              await removeIndexedDbSyncItems(queueEntries.map((e) => e.id));
              markRtdbBackupSynced(targetId, latestBackup?.lastUpdatedAtMs);
              const remaining = await getIndexedDbSyncQueueCount(targetId, 'rtdb');
              hasPendingRtdbQueueRef.current = remaining > 0;
              onPendingOpsCountChange?.(remaining);
            } else {
              // Replay granular sub-path entries in strict chronological order
              let networkFailed = false;
              for (const entry of queueEntries) {
                const targetPath = entry.rtdbPath || fullPath;
                if (entry.rtdbPayload === undefined) {
                  await removeIndexedDbSyncItems([entry.id]);
                  continue;
                }
                try {
                  await set(ref(rtdb, targetPath), entry.rtdbPayload);
                  await removeIndexedDbSyncItems([entry.id]);
                  const remaining = await getIndexedDbSyncQueueCount(targetId, 'rtdb');
                  hasPendingRtdbQueueRef.current = remaining > 0;
                  onPendingOpsCountChange?.(remaining);
                } catch (entryErr) {
                  if (isOfflineNetworkError(entryErr)) {
                    await markIndexedDbSyncItemAttempt(
                      entry.id,
                      entryErr instanceof Error ? entryErr.message : 'Network error'
                    );
                    networkFailed = true;
                    break;
                  }
                  throw entryErr;
                }
              }
              if (networkFailed) break;
              if (backupDirty && latestBackup) {
                markRtdbBackupSynced(targetId, latestBackup.lastUpdatedAtMs);
              }
            }
          } else if (backupDirty && latestBackup) {
            const writtenVersion = latestBackup.lastUpdatedAtMs;
            await set(ref(rtdb, `silat_arenas/${targetId}`), sanitizeForRtdb(latestBackup.payload));
            markRtdbBackupSynced(targetId, writtenVersion);
            hasPendingRtdbQueueRef.current = false;
            onPendingOpsCountChange?.(0);
          }
        }
        setSyncError(null);
      } catch (err) {
        const currentQueue = await getIndexedDbSyncQueue(targetId, 'rtdb');
        if (currentQueue[0]) {
          await markIndexedDbSyncItemAttempt(
            currentQueue[0].id,
            err instanceof Error ? err.message : 'Unknown error'
          );
        }
        hasPendingRtdbQueueRef.current = currentQueue.length > 0 || isRtdbBackupDirty(targetId);
        onPendingOpsCountChange?.(currentQueue.length);

        if (!isOfflineNetworkError(err)) {
          setSyncError(
            `Gagal sinkronisasi ke Firebase RTDB (${userRtdbProjectId || 'rtdb'}): ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
        }
      } finally {
        flushingRtdbRef.current = false;
        releaseOfflineSyncLock(targetId, tabTokenRef.current);
      }
    },
    [onPendingOpsCountChange]
  );

  // Replay queued Firestore offline operations from IndexedDB in chronological order when online again
  const flushPendingFirestoreOps = useCallback(
    async (targetArenaId: string) => {
      if (!isBrowserOnline() || !user || !targetArenaId || flushingFirestoreRef.current) return;

      // Read durable queue from IndexedDB first; migrate any legacy localStorage ops if needed
      let idbEntries = await getIndexedDbSyncQueue(targetArenaId, 'firestore');
      if (idbEntries.length === 0) {
        const legacyOps = getPendingFirestoreOps(targetArenaId);
        if (legacyOps.length > 0) {
          idbEntries = await enqueueIndexedDbSyncBatch(
            legacyOps.map((op) => ({
              arenaId: targetArenaId,
              backend: 'firestore' as const,
              kind: 'score_update' as const,
              firestoreOp: op,
            }))
          );
        }
      }

      onPendingOpsCountChange?.(idbEntries.length);
      if (idbEntries.length === 0) return;

      if (!acquireOfflineSyncLock(targetArenaId, tabTokenRef.current)) return;
      flushingFirestoreRef.current = true;
      try {
        while (isBrowserOnline()) {
          const entries: QueuedSyncEntry[] = await getIndexedDbSyncQueue(targetArenaId, 'firestore');
          onPendingOpsCountChange?.(entries.length);
          if (entries.length === 0) break;

          const entry = entries[0];
          const op = entry.firestoreOp;
          if (!op) {
            await removeIndexedDbSyncItems([entry.id]);
            continue;
          }

          const path = op.pathSegments.join('/');
          const docRef = doc(db, path);
          const payloadData: Record<string, unknown> = op.data ? { ...op.data } : {};
          if (op.timestampMode === 'create') {
            payloadData.createdAt = serverTimestamp();
            payloadData.updatedAt = serverTimestamp();
          } else if (op.timestampMode === 'update') {
            payloadData.updatedAt = serverTimestamp();
          } else if (op.timestampMode === 'createdAtOnly') {
            payloadData.createdAt = serverTimestamp();
          }

          try {
            if (op.opType === 'delete') {
              await deleteDoc(docRef);
            } else if (op.opType === 'set') {
              await setDoc(docRef, payloadData);
            } else {
              await updateDoc(docRef, payloadData);
            }
            await removeIndexedDbSyncItems([entry.id]);
            removePendingFirestoreOps(targetArenaId, [op.id]);
            const remainingCount = await getIndexedDbSyncQueueCount(targetArenaId, 'firestore');
            if (remainingCount === 0) {
              clearPendingFirestoreOps(targetArenaId);
            }
            onPendingOpsCountChange?.(remainingCount);
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              // Connection dropped mid-replay; keep remaining ops safely in IndexedDB
              await markIndexedDbSyncItemAttempt(
                entry.id,
                err instanceof Error ? err.message : 'Network offline'
              );
              break;
            }
            if (isPermissionDeniedError(err)) {
              const opEnum =
                op.opType === 'delete'
                  ? OperationType.DELETE
                  : op.opType === 'set'
                  ? OperationType.CREATE
                  : OperationType.UPDATE;
              handleFirestoreError(err, opEnum, path);
            }
            // Non-network error (e.g., not-found on an already-deleted doc): drop stale op so queue doesn't stall
            await removeIndexedDbSyncItems([entry.id]);
            removePendingFirestoreOps(targetArenaId, [op.id]);
            const remainingCount = await getIndexedDbSyncQueueCount(targetArenaId, 'firestore');
            if (remainingCount === 0) {
              clearPendingFirestoreOps(targetArenaId);
            }
            onPendingOpsCountChange?.(remainingCount);
          }
        }
        setSyncError(null);
      } finally {
        flushingFirestoreRef.current = false;
        releaseOfflineSyncLock(targetArenaId, tabTokenRef.current);
      }
    },
    [user, onPendingOpsCountChange]
  );

  // Hydrate unsynced IndexedDB queue count & snapshot on startup / arena switch for RTDB mode
  useEffect(() => {
    if (isFirestoreActive) return;
    let cancelled = false;
    void (async () => {
      const queueEntries = await getIndexedDbSyncQueue(rtdbArenaId, 'rtdb');
      if (cancelled) return;
      hasPendingRtdbQueueRef.current = queueEntries.length > 0 || isRtdbBackupDirty(rtdbArenaId);
      onPendingOpsCountChange?.(queueEntries.length);

      const latestQueued = queueEntries[queueEntries.length - 1]?.rtdbPayload as
        | LocalStorePayload
        | undefined;
      if (latestQueued?.arena && Array.isArray(latestQueued.matches) && latestQueued.matches.length > 0) {
        onRtdbSync(latestQueued);
      } else {
        const idbBackup = await readRecordFromIndexedDb<OfflineBackupRecord>(
          getBackupStorageKey(rtdbArenaId)
        );
        if (!cancelled && idbBackup?.dirty && idbBackup.payload?.matches?.length) {
          onRtdbSync(idbBackup.payload);
        }
      }

      if (!cancelled && rtdb && rtdbConnected && isBrowserOnline() && hasPendingRtdbQueueRef.current) {
        void flushRtdbBackup(rtdbArenaId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rtdbArenaId, isFirestoreActive, rtdbConnected, onPendingOpsCountChange, onRtdbSync, flushRtdbBackup]);

  // 1. Firebase Realtime Database (window.firebaseConfig) real-time sync with IndexedDB queue backup
  useEffect(() => {
    if (!rtdb || isFirestoreActive) {
      setRtdbConnected(false);
      return;
    }

    const connectedRef = ref(rtdb, '.info/connected');
    const unsubConn = onValue(connectedRef, (snap) => {
      const connected = Boolean(snap.val());
      setRtdbConnected(connected);
      if (connected && isBrowserOnline()) {
        void getIndexedDbSyncQueueCount(rtdbArenaId, 'rtdb').then((count) => {
          hasPendingRtdbQueueRef.current = count > 0 || isRtdbBackupDirty(rtdbArenaId);
          onPendingOpsCountChange?.(count);
          if (hasPendingRtdbQueueRef.current) {
            void flushRtdbBackup(rtdbArenaId);
          }
        });
      }
    });

    const arenaRtdbRef = ref(rtdb, `silat_arenas/${rtdbArenaId}`);
    const unsubArena = onValue(
      arenaRtdbRef,
      (snap) => {
        // Protect unsynced IndexedDB/localStorage score queue from being overwritten by stale remote data
        if (hasPendingRtdbQueueRef.current || isRtdbBackupDirty(rtdbArenaId)) {
          if (isBrowserOnline()) {
            void flushRtdbBackup(rtdbArenaId);
          }
          return;
        }

        const val = snap.val();
        if (val === null) {
          const seedPayload = sanitizeForRtdb(getSeedPayload());
          seedPayload.arena.id = rtdbArenaId;
          saveRtdbLocalBackup(rtdbArenaId, seedPayload, true);
          set(arenaRtdbRef, seedPayload)
            .then(() => {
              markRtdbBackupSynced(rtdbArenaId);
            })
            .catch((err) => {
              if (!isOfflineNetworkError(err)) {
                console.warn('RTDB initial seed warning:', err?.message);
              }
            });
          return;
        }
        const normalized = normalizeRtdbPayload(val);
        if (normalized) {
          saveRtdbLocalBackup(rtdbArenaId, normalized, false);
          onRtdbSync(normalized);
          setSyncError(null);
        }
      },
      (err) => {
        if (!isOfflineNetworkError(err)) {
          setSyncError(`Firebase RTDB (${userRtdbProjectId || 'rtdb'}): ${err.message}`);
        }
      }
    );

    return () => {
      unsubConn();
      unsubArena();
    };
  }, [rtdbArenaId, isFirestoreActive, getSeedPayload, onRtdbSync, flushRtdbBackup, onPendingOpsCountChange]);

  // Trigger RTDB flush automatically whenever browser comes back online while connected
  useEffect(() => {
    if (!rtdb || isFirestoreActive || !isOnline || !rtdbConnected) return;
    void getIndexedDbSyncQueueCount(rtdbArenaId, 'rtdb').then((count) => {
      hasPendingRtdbQueueRef.current = count > 0 || isRtdbBackupDirty(rtdbArenaId);
      if (hasPendingRtdbQueueRef.current) {
        void flushRtdbBackup(rtdbArenaId);
      }
    });
  }, [isOnline, rtdbConnected, isFirestoreActive, rtdbArenaId, reconnectTick, flushRtdbBackup]);

  // 2. Cloud Firestore arena & matches real-time subscription when authenticated (with offline backup fallback)
  useEffect(() => {
    if (!authReady || !user) {
      setCloudArena(null);
      setCloudMatches([]);
      setCloudEvents([]);
      setCloudAthletes([]);
      setCloudBrackets([]);
      onPendingOpsCountChange?.(0);
      return;
    }

    const targetArenaId = joinedArenaId || sanitizeId(`arena-${user.uid.slice(0, 12)}`);
    const arenaRef = doc(db, 'arenas', targetArenaId);
    let cancelled = false;
    let unsubArena: (() => void) | null = null;
    let unsubMatches: (() => void) | null = null;
    let unsubAthletes: (() => void) | null = null;
    let unsubBrackets: (() => void) | null = null;

    void getIndexedDbSyncQueueCount(targetArenaId, 'firestore').then((idbCount) => {
      if (!cancelled) {
        onPendingOpsCountChange?.(Math.max(idbCount, getPendingFirestoreOps(targetArenaId).length));
      }
    });

    const applyBackupPayload = (backup: OfflineBackupRecord | null): boolean => {
      if (backup && backup.payload?.arena && Array.isArray(backup.payload.matches) && backup.payload.matches.length > 0) {
        setCloudArena(backup.payload.arena);
        setCloudMatches(backup.payload.matches);
        setCloudAthletes(backup.payload.athletes || []);
        setCloudBrackets(backup.payload.brackets || []);
        const evList = backup.payload.eventsByMatch?.[activeMatchId] || [];
        setCloudEvents(evList);
        onFirestoreMirror?.(backup.payload);
        setSyncError(null);
        return true;
      }
      return false;
    };

    const hydrateFromBackup = (): boolean => {
      const localBackup = readOfflineBackup(targetArenaId);
      if (applyBackupPayload(localBackup)) {
        return true;
      }
      void readRecordFromIndexedDb<OfflineBackupRecord>(getBackupStorageKey(targetArenaId)).then(
        (idbBackup) => {
          if (!cancelled && idbBackup) {
            applyBackupPayload(idbBackup);
          }
        }
      );
      return false;
    };

    const initAndSubscribe = async () => {
      // Hydrate cached data immediately so scoring remains responsive even while network connects
      hydrateFromBackup();

      if (!isBrowserOnline()) {
        return;
      }

      try {
        const snap = await getDoc(arenaRef);
        if (cancelled) return;

        if (!snap.exists() && !joinedArenaId) {
          const initialMatchId = 'partai-01';
          await setDoc(arenaRef, {
            id: targetArenaId,
            name: 'Gelanggang A',
            tournamentName: 'Kejuaraan Nasional Pencak Silat IPSI 2026',
            venue: '',
            eventDate: '',
            logoLeft: '',
            logoRight: '',
            ownerId: user.uid,
            activeMatchId: initialMatchId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'arenas', targetArenaId, 'matches', initialMatchId), {
            id: initialMatchId,
            arenaId: targetArenaId,
            ownerId: user.uid,
            matchNumber: 'Partai 01',
            weightClass: 'Kelas B Putra (50-55 kg)',
            stage: 'Final',
            blueName: 'Ahmad Fauzi',
            blueContingent: 'DKI Jakarta',
            blueCountry: 'IDN',
            redName: 'Budi Santoso',
            redContingent: 'Jawa Barat',
            redCountry: 'IDN',
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (cancelled) return;

        unsubArena = onSnapshot(
          arenaRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setCloudArena(docSnap.data() as ArenaData);
              setSyncError(null);
            }
          },
          (err) => {
            if (isOfflineNetworkError(err)) {
              hydrateFromBackup();
              return;
            }
            setSyncError('Gagal sinkronisasi gelanggang Firebase.');
            handleFirestoreError(err, OperationType.GET, `arenas/${targetArenaId}`);
          }
        );

        const matchesQuery = query(
          collection(db, 'arenas', targetArenaId, 'matches'),
          where('ownerId', '==', user.uid)
        );
        unsubMatches = onSnapshot(
          matchesQuery,
          (querySnap) => {
            const list = querySnap.docs.map((d) => d.data() as MatchData);
            list.sort((a, b) => a.matchNumber.localeCompare(b.matchNumber));
            setCloudMatches(list);
          },
          (err) => {
            console.warn('Matches list listener fallback:', err.message);
          }
        );

        const athletesQuery = query(
          collection(db, 'arenas', targetArenaId, 'athletes'),
          where('ownerId', '==', user.uid)
        );
        unsubAthletes = onSnapshot(
          athletesQuery,
          (querySnap) => {
            setCloudAthletes(querySnap.docs.map((d) => d.data() as AthleteData));
          },
          (err) => {
            console.warn('Athletes listener fallback:', err.message);
          }
        );

        const bracketsQuery = query(
          collection(db, 'arenas', targetArenaId, 'brackets'),
          where('ownerId', '==', user.uid)
        );
        unsubBrackets = onSnapshot(
          bracketsQuery,
          (querySnap) => {
            setCloudBrackets(querySnap.docs.map((d) => d.data() as BracketMatchSlot));
          },
          (err) => {
            console.warn('Brackets listener fallback:', err.message);
          }
        );

        // Flush any queued offline Firestore ops in IndexedDB immediately upon reconnecting
        const pendingIdb = await getIndexedDbSyncQueueCount(targetArenaId, 'firestore');
        if (pendingIdb > 0 || getPendingFirestoreOps(targetArenaId).length > 0) {
          void flushPendingFirestoreOps(targetArenaId);
        }
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          hydrateFromBackup();
          return;
        }
        setSyncError(err instanceof Error ? err.message : 'Gagal terhubung ke Firebase.');
      }
    };

    void initAndSubscribe();

    return () => {
      cancelled = true;
      unsubArena?.();
      unsubMatches?.();
      unsubAthletes?.();
      unsubBrackets?.();
    };
  }, [authReady, user, joinedArenaId, reconnectTick, flushPendingFirestoreOps, onPendingOpsCountChange]);

  // 3. Operator access to another user's active match
  useEffect(() => {
    if (!user || !cloudArena || !joinedArenaId || cloudArena.ownerId === user.uid) return;
    if (!cloudArena.activeMatchId) return;

    const matchRef = doc(db, 'arenas', cloudArena.id, 'matches', cloudArena.activeMatchId);
    const unsub = onSnapshot(
      matchRef,
      (snap) => {
        if (snap.exists()) {
          setCloudMatches([snap.data() as MatchData]);
        }
      },
      (err) => {
        if (isOfflineNetworkError(err)) return;
        handleFirestoreError(err, OperationType.GET, `arenas/${cloudArena.id}/matches/${cloudArena.activeMatchId}`);
      }
    );
    return () => unsub();
  }, [user, cloudArena, joinedArenaId]);

  // 4. Active match events real-time subscription
  const effectiveActiveMatchId = cloudArena?.activeMatchId || activeMatchId;

  useEffect(() => {
    if (!isFirestoreActive || !user || !cloudArena || !effectiveActiveMatchId) return;
    const eventsQuery = query(
      collection(db, 'arenas', cloudArena.id, 'matches', effectiveActiveMatchId, 'events'),
      where('ownerId', '==', cloudArena.ownerId),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
    const unsub = onSnapshot(
      eventsQuery,
      (snap) => {
        setCloudEvents(snap.docs.map((d) => d.data() as MatchEvent));
      },
      (err) => {
        console.warn('Events listener warning:', err.message);
      }
    );
    return () => unsub();
  }, [isFirestoreActive, user, cloudArena, effectiveActiveMatchId, reconnectTick]);

  // 5. Continuously mirror live Firestore snapshots into localStorage when online and synced
  useEffect(() => {
    if (!isFirestoreActive || !cloudArena || !isOnline || cloudMatches.length === 0) return;
    if (getPendingFirestoreOps(cloudArena.id).length > 0) return;

    let cancelled = false;
    void getIndexedDbSyncQueueCount(cloudArena.id, 'firestore').then((pendingIdb) => {
      if (cancelled || pendingIdb > 0) return;

      const existingBackup = readOfflineBackup(cloudArena.id);
      const eventsByMatch: Record<string, MatchEvent[]> = {
        ...(existingBackup?.payload.eventsByMatch || {}),
      };
      if (effectiveActiveMatchId) {
        eventsByMatch[effectiveActiveMatchId] = cloudEvents;
      }

      const mirrored: LocalStorePayload = {
        arena: cloudArena,
        matches: cloudMatches,
        eventsByMatch,
        athletes: cloudAthletes,
        brackets: cloudBrackets,
      };
      saveFirestoreSnapshotBackup(cloudArena.id, mirrored);
      onFirestoreMirror?.(mirrored);
    });
    return () => {
      cancelled = true;
    };
  }, [
    isFirestoreActive,
    isOnline,
    cloudArena,
    cloudMatches,
    cloudEvents,
    cloudAthletes,
    cloudBrackets,
    effectiveActiveMatchId,
    onFirestoreMirror,
  ]);

  // 6. Auto-flush queued Firestore operations when online & authenticated
  useEffect(() => {
    if (!isOnline || !user || !cloudArena) return;
    void getIndexedDbSyncQueueCount(cloudArena.id, 'firestore').then((pendingIdb) => {
      if (pendingIdb > 0 || getPendingFirestoreOps(cloudArena.id).length > 0) {
        void flushPendingFirestoreOps(cloudArena.id);
      }
    });
  }, [isOnline, user, cloudArena, reconnectTick, flushPendingFirestoreOps]);

  // 7. Background retry safety timer ONLY while online and pending sync exists in IndexedDB
  useEffect(() => {
    if (!isOnline) return;
    const interval = window.setInterval(() => {
      if (isFirestoreActive && cloudArena) {
        void getIndexedDbSyncQueueCount(cloudArena.id, 'firestore').then((pendingIdb) => {
          if (pendingIdb > 0 || getPendingFirestoreOps(cloudArena.id).length > 0) {
            void flushPendingFirestoreOps(cloudArena.id);
          }
        });
      } else if (rtdb && rtdbConnected) {
        void getIndexedDbSyncQueueCount(rtdbArenaId, 'rtdb').then((pendingIdb) => {
          if (pendingIdb > 0 || isRtdbBackupDirty(rtdbArenaId)) {
            void flushRtdbBackup(rtdbArenaId);
          }
        });
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [
    isOnline,
    isFirestoreActive,
    cloudArena,
    rtdbConnected,
    rtdbArenaId,
    flushPendingFirestoreOps,
    flushRtdbBackup,
  ]);

  const retrySyncNow = useCallback(async () => {
    if (!isBrowserOnline()) return;
    if (isFirestoreActive && cloudArena) {
      await flushPendingFirestoreOps(cloudArena.id);
    } else if (rtdb) {
      const pendingIdb = await getIndexedDbSyncQueueCount(rtdbArenaId, 'rtdb');
      if (pendingIdb > 0 || isRtdbBackupDirty(rtdbArenaId)) {
        await flushRtdbBackup(rtdbArenaId);
      }
    }
  }, [isFirestoreActive, cloudArena, rtdbArenaId, flushPendingFirestoreOps, flushRtdbBackup]);

  return {
    cloudArena,
    cloudMatches,
    cloudEvents,
    cloudAthletes,
    cloudBrackets,
    rtdbConnected,
    isOnline,
    syncError,
    setSyncError,
    flushRtdbBackup,
    flushPendingFirestoreOps,
    retrySyncNow,
  };
}
