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

export function getBackupStorageKey(arenaId: string): string {
  const safeId = arenaId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'gelanggang-a';
  return `${BACKUP_KEY_PREFIX}${safeId}`;
}

export function clonePayload(payload: LocalStorePayload): LocalStorePayload {
  return JSON.parse(JSON.stringify(payload)) as LocalStorePayload;
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

export function writeOfflineBackup(record: OfflineBackupRecord): void {
  if (typeof window === 'undefined' || !record.arenaId) return;
  try {
    window.localStorage.setItem(getBackupStorageKey(record.arenaId), JSON.stringify(record));
  } catch {
    // Ignore storage quota errors cleanly
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
    msg.includes('unavailable') ||
    msg.includes('could not reach') ||
    msg.includes('timeout') ||
    msg.includes('disconnected')
  );
}
