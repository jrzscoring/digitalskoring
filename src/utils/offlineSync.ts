import type { ArenaData, AthleteData, BracketMatchSlot, MatchData, MatchEvent } from '../types/silat';

export interface LocalStorePayload {
  arena: ArenaData;
  matches: MatchData[];
  eventsByMatch: Record<string, MatchEvent[]>;
  athletes?: AthleteData[];
  brackets?: BracketMatchSlot[];
}

export type FirestoreTimestampMode = 'create' | 'update' | 'createdAtOnly' | 'none';

export interface PendingFirestoreOp {
  id: string;
  opType: 'set' | 'update' | 'delete';
  /** Document path relative to Firestore root, e.g. ['arenas', arenaId, 'matches', matchId] */
  pathSegments: string[];
  data?: Record<string, unknown>;
  timestampMode?: FirestoreTimestampMode;
  createdAtMs: number;
}

export interface OfflineBackupRecord {
  arenaId: string;
  targetBackend: 'rtdb' | 'firestore';
  dirty: boolean;
  dirtySinceMs: number;
  lastSyncedAtMs: number;
  lastUpdatedAtMs: number;
  payload: LocalStorePayload;
  pendingFirestoreOps: PendingFirestoreOp[];
}

const BACKUP_KEY_PREFIX = 'silat_offline_backup_v1_';
const SYNC_LOCK_KEY_PREFIX = 'silat_offline_sync_lock_v1_';
const SYNC_LOCK_TTL_MS = 10000;
const IDB_NAME = 'silat_offline_cache_v1';
const IDB_STORE = 'arena_backups';

export function getBackupStorageKey(arenaId: string): string {
  const safeId = arenaId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'gelanggang-a';
  return `${BACKUP_KEY_PREFIX}${safeId}`;
}

export function clonePayload(payload: LocalStorePayload): LocalStorePayload {
  return JSON.parse(JSON.stringify(payload)) as LocalStorePayload;
}

function compactPayloadForQuota(payload: LocalStorePayload, stripDataImages: boolean): LocalStorePayload {
  const activeId = payload.arena?.activeMatchId;
  const trimmedEvents: Record<string, MatchEvent[]> = {};
  if (payload.eventsByMatch) {
    for (const [mId, evList] of Object.entries(payload.eventsByMatch)) {
      if (mId === activeId) {
        trimmedEvents[mId] = Array.isArray(evList) ? evList.slice(0, 200) : [];
      } else {
        const matchObj = payload.matches?.find((m) => m.id === mId);
        if (matchObj && matchObj.status !== 'finished') {
          trimmedEvents[mId] = Array.isArray(evList) ? evList.slice(0, 50) : [];
        }
      }
    }
  }

  const matches = (payload.matches || []).map((m) => {
    if (!stripDataImages) return m;
    return {
      ...m,
      ...(m.bluePhoto?.startsWith('data:image/') ? { bluePhoto: '' } : {}),
      ...(m.redPhoto?.startsWith('data:image/') ? { redPhoto: '' } : {}),
    };
  });

  const athletes = (payload.athletes || []).map((a) => {
    if (!stripDataImages) return a;
    return a.photo?.startsWith('data:image/') ? { ...a, photo: '' } : a;
  });

  const arena =
    stripDataImages &&
    (payload.arena?.logoLeft?.startsWith('data:image/') ||
      payload.arena?.logoRight?.startsWith('data:image/'))
      ? {
          ...payload.arena,
          ...(payload.arena.logoLeft?.startsWith('data:image/') ? { logoLeft: '' } : {}),
          ...(payload.arena.logoRight?.startsWith('data:image/') ? { logoRight: '' } : {}),
        }
      : payload.arena;

  return {
    arena,
    matches,
    eventsByMatch: trimmedEvents,
    athletes,
    brackets: payload.brackets || [],
  };
}

export function safeWriteLocalPayload(storageKey: string, payload: LocalStorePayload): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    return true;
  } catch {
    try {
      const compact1 = compactPayloadForQuota(payload, false);
      window.localStorage.setItem(storageKey, JSON.stringify(compact1));
      return true;
    } catch {
      try {
        const compact2 = compactPayloadForQuota(payload, true);
        window.localStorage.setItem(storageKey, JSON.stringify(compact2));
        return true;
      } catch {
        return false;
      }
    }
  }
}

function openOfflineIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function mirrorRecordToIndexedDb(key: string, value: unknown): Promise<void> {
  const db = await openOfflineIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB failures in restricted browsing modes
  } finally {
    db.close();
  }
}

export async function readRecordFromIndexedDb<T>(key: string): Promise<T | null> {
  const db = await openOfflineIdb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearAllOfflineStorage(localStorageKey: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (
          key === localStorageKey ||
          key.startsWith(BACKUP_KEY_PREFIX) ||
          key.startsWith(SYNC_LOCK_KEY_PREFIX)
        ) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // ignore storage access errors
    }
  }

  const db = await openOfflineIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB errors
  } finally {
    db.close();
  }
}

export function readOfflineBackup(arenaId: string): OfflineBackupRecord | null {
  if (typeof window === 'undefined' || !arenaId) return null;
  try {
    const raw = window.localStorage.getItem(getBackupStorageKey(arenaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineBackupRecord>;
    if (!parsed || !parsed.payload || !parsed.payload.arena || !Array.isArray(parsed.payload.matches)) {
      return null;
    }
    return {
      arenaId: parsed.arenaId || arenaId,
      targetBackend: parsed.targetBackend === 'firestore' ? 'firestore' : 'rtdb',
      dirty: Boolean(parsed.dirty),
      dirtySinceMs: typeof parsed.dirtySinceMs === 'number' ? parsed.dirtySinceMs : 0,
      lastSyncedAtMs: typeof parsed.lastSyncedAtMs === 'number' ? parsed.lastSyncedAtMs : 0,
      lastUpdatedAtMs: typeof parsed.lastUpdatedAtMs === 'number' ? parsed.lastUpdatedAtMs : Date.now(),
      payload: parsed.payload,
      pendingFirestoreOps: Array.isArray(parsed.pendingFirestoreOps) ? parsed.pendingFirestoreOps : [],
    };
  } catch {
    return null;
  }
}

export function readLatestOfflineBackup(): OfflineBackupRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    let best: OfflineBackupRecord | null = null;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(BACKUP_KEY_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<OfflineBackupRecord>;
      if (!parsed?.payload?.arena || !Array.isArray(parsed.payload.matches) || parsed.payload.matches.length === 0) {
        continue;
      }
      const record: OfflineBackupRecord = {
        arenaId: parsed.arenaId || parsed.payload.arena.id,
        targetBackend: parsed.targetBackend === 'firestore' ? 'firestore' : 'rtdb',
        dirty: Boolean(parsed.dirty),
        dirtySinceMs: typeof parsed.dirtySinceMs === 'number' ? parsed.dirtySinceMs : 0,
        lastSyncedAtMs: typeof parsed.lastSyncedAtMs === 'number' ? parsed.lastSyncedAtMs : 0,
        lastUpdatedAtMs: typeof parsed.lastUpdatedAtMs === 'number' ? parsed.lastUpdatedAtMs : 0,
        payload: parsed.payload,
        pendingFirestoreOps: Array.isArray(parsed.pendingFirestoreOps) ? parsed.pendingFirestoreOps : [],
      };
      if (!best || record.lastUpdatedAtMs > best.lastUpdatedAtMs) {
        best = record;
      }
    }
    return best;
  } catch {
    return null;
  }
}

export function writeOfflineBackup(record: OfflineBackupRecord): void {
  if (typeof window === 'undefined' || !record.arenaId) return;
  const key = getBackupStorageKey(record.arenaId);
  void mirrorRecordToIndexedDb(key, record);

  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Quota fallback: prune old non-active finished match logs first, then large photo blobs if needed
    try {
      const compactRecord: OfflineBackupRecord = {
        ...record,
        payload: compactPayloadForQuota(record.payload, false),
      };
      window.localStorage.setItem(key, JSON.stringify(compactRecord));
    } catch {
      try {
        const minimalRecord: OfflineBackupRecord = {
          ...record,
          payload: compactPayloadForQuota(record.payload, true),
        };
        window.localStorage.setItem(key, JSON.stringify(minimalRecord));
      } catch {
        // IndexedDB mirror still holds the full record if localStorage is completely full
      }
    }
  }
}

export function saveRtdbLocalBackup(
  arenaId: string,
  payload: LocalStorePayload,
  dirty: boolean
): OfflineBackupRecord {
  const existing = readOfflineBackup(arenaId);
  const now = Math.max(Date.now(), (existing?.lastUpdatedAtMs || 0) + 1);
  const next: OfflineBackupRecord = {
    arenaId,
    targetBackend: 'rtdb',
    dirty,
    dirtySinceMs: dirty ? (existing?.dirty && existing.dirtySinceMs ? existing.dirtySinceMs : now) : 0,
    lastSyncedAtMs: dirty ? (existing?.lastSyncedAtMs || 0) : now,
    lastUpdatedAtMs: now,
    payload: clonePayload(payload),
    pendingFirestoreOps: existing?.pendingFirestoreOps || [],
  };
  writeOfflineBackup(next);
  return next;
}

export function isRtdbBackupDirty(arenaId: string): boolean {
  const existing = readOfflineBackup(arenaId);
  return Boolean(existing && existing.targetBackend === 'rtdb' && existing.dirty);
}

export function markRtdbBackupSynced(arenaId: string, expectedUpdatedAtMs?: number): void {
  const existing = readOfflineBackup(arenaId);
  if (!existing) return;
  if (
    typeof expectedUpdatedAtMs === 'number' &&
    existing.lastUpdatedAtMs > expectedUpdatedAtMs
  ) {
    return;
  }
  const now = Date.now();
  writeOfflineBackup({
    ...existing,
    targetBackend: 'rtdb',
    dirty: false,
    dirtySinceMs: 0,
    lastSyncedAtMs: now,
  });
}

export function saveFirestoreSnapshotBackup(
  arenaId: string,
  payload: LocalStorePayload
): void {
  const existing = readOfflineBackup(arenaId);
  const now = Date.now();
  writeOfflineBackup({
    arenaId,
    targetBackend: 'firestore',
    dirty: Boolean(existing?.pendingFirestoreOps?.length),
    dirtySinceMs: existing?.dirtySinceMs || 0,
    lastSyncedAtMs: existing?.pendingFirestoreOps?.length ? existing.lastSyncedAtMs : now,
    lastUpdatedAtMs: now,
    payload: clonePayload(payload),
    pendingFirestoreOps: existing?.pendingFirestoreOps || [],
  });
}

export function enqueueFirestoreOp(
  arenaId: string,
  op: Omit<PendingFirestoreOp, 'id' | 'createdAtMs'>,
  latestPayload?: LocalStorePayload
): PendingFirestoreOp[] {
  const existing = readOfflineBackup(arenaId);
  const now = Date.now();
  const newOp: PendingFirestoreOp = {
    ...op,
    id: `fop-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAtMs: now,
  };

  const prevOps = existing?.pendingFirestoreOps ? [...existing.pendingFirestoreOps] : [];

  // Coalesce consecutive plain 'update' operations on the same document path only when keys match
  // so Firestore affectedKeys().hasOnly() security rules remain valid for non-owner operators.
  const last = prevOps[prevOps.length - 1];
  const samePath =
    last &&
    last.opType === 'update' &&
    newOp.opType === 'update' &&
    last.timestampMode === newOp.timestampMode &&
    last.pathSegments.length === newOp.pathSegments.length &&
    last.pathSegments.every((seg, idx) => seg === newOp.pathSegments[idx]);

  const sameKeySet =
    samePath &&
    Boolean(last.data && newOp.data) &&
    Object.keys(last.data!).length === Object.keys(newOp.data!).length &&
    Object.keys(newOp.data!).every((k) => k in last.data!);

  if (sameKeySet && last.data && newOp.data && newOp.data.status !== 'finished') {
    prevOps[prevOps.length - 1] = {
      ...last,
      data: { ...last.data, ...newOp.data },
      createdAtMs: now,
    };
  } else {
    prevOps.push(newOp);
  }

  const fallbackPayload: LocalStorePayload = latestPayload
    ? clonePayload(latestPayload)
    : existing?.payload || {
        arena: {
          id: arenaId,
          name: 'Gelanggang A',
          tournamentName: 'Kejuaraan Pencak Silat IPSI 2026',
          ownerId: 'local-operator',
          activeMatchId: '',
        },
        matches: [],
        eventsByMatch: {},
        athletes: [],
        brackets: [],
      };

  writeOfflineBackup({
    arenaId,
    targetBackend: 'firestore',
    dirty: true,
    dirtySinceMs: existing?.dirtySinceMs || now,
    lastSyncedAtMs: existing?.lastSyncedAtMs || 0,
    lastUpdatedAtMs: now,
    payload: fallbackPayload,
    pendingFirestoreOps: prevOps,
  });

  return prevOps;
}

export function getPendingFirestoreOps(arenaId: string): PendingFirestoreOp[] {
  const existing = readOfflineBackup(arenaId);
  return existing?.pendingFirestoreOps || [];
}

export function removePendingFirestoreOps(arenaId: string, opIds: string[]): PendingFirestoreOp[] {
  const existing = readOfflineBackup(arenaId);
  if (!existing) return [];
  const removeSet = new Set(opIds);
  const remaining = existing.pendingFirestoreOps.filter((op) => !removeSet.has(op.id));
  const now = Date.now();
  writeOfflineBackup({
    ...existing,
    dirty: remaining.length > 0,
    dirtySinceMs: remaining.length > 0 ? existing.dirtySinceMs : 0,
    lastSyncedAtMs: remaining.length === 0 ? now : existing.lastSyncedAtMs,
    pendingFirestoreOps: remaining,
  });
  return remaining;
}

export function clearPendingFirestoreOps(arenaId: string): void {
  const existing = readOfflineBackup(arenaId);
  if (!existing) return;
  const now = Date.now();
  writeOfflineBackup({
    ...existing,
    dirty: false,
    dirtySinceMs: 0,
    lastSyncedAtMs: now,
    pendingFirestoreOps: [],
  });
}

export function acquireOfflineSyncLock(arenaId: string, ownerToken: string): boolean {
  if (typeof window === 'undefined') return true;
  const key = `${SYNC_LOCK_KEY_PREFIX}${arenaId}`;
  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { owner?: string; expiresAtMs?: number };
      if (parsed.owner && parsed.owner !== ownerToken && (parsed.expiresAtMs || 0) > now) {
        return false;
      }
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({ owner: ownerToken, expiresAtMs: now + SYNC_LOCK_TTL_MS })
    );
    return true;
  } catch {
    return true;
  }
}

export function releaseOfflineSyncLock(arenaId: string, ownerToken: string): void {
  if (typeof window === 'undefined') return;
  const key = `${SYNC_LOCK_KEY_PREFIX}${arenaId}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { owner?: string };
    if (parsed.owner === ownerToken) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (code === 'permission-denied' || code === 'PERMISSION_DENIED') return true;
  if (typeof message === 'string' && message.toLowerCase().includes('missing or insufficient permissions')) {
    return true;
  }
  return false;
}

export function isOfflineNetworkError(err: unknown): boolean {
  if (!isBrowserOnline()) return true;
  if (!err) return false;
  if (isPermissionDeniedError(err)) return false;
  const code = typeof err === 'object' ? String((err as { code?: unknown }).code || '').toLowerCase() : '';
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message || '').toLowerCase()
      : String(err).toLowerCase();

  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    code === 'deadline-exceeded' ||
    code === 'failed-precondition' ||
    code === 'aborted'
  ) {
    return true;
  }
  return (
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('unavailable') ||
    msg.includes('could not reach') ||
    msg.includes('timeout') ||
    msg.includes('disconnected') ||
    msg.includes('connection') ||
    msg.includes('transport') ||
    msg.includes('err_internet')
  );
}

