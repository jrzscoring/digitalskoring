import type {
  ArenaData,
  AthleteData,
  BracketMatchSlot,
  JurusCornerData,
  MatchData,
  MatchEvent,
} from '../types/silat';
import type { LocalStorePayload } from './offlineSync';

export function sanitizeRtdbKey(raw: string): string {
  const cleaned = raw.replace(/[.#$\[\]/]/g, '-').slice(0, 64);
  return cleaned.length >= 1 ? cleaned : `k-${Date.now()}`;
}

export function cleanUndefinedForRtdb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sanitizeForRtdb(payload: LocalStorePayload): LocalStorePayload {
  return cleanUndefinedForRtdb(payload);
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
      const arr = Array.isArray(list)
        ? list.filter(Boolean)
        : list && typeof list === 'object'
        ? Object.values(list as Record<string, MatchEvent>).filter(Boolean)
        : [];
      arr.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      eventsByMatch[mId] = arr;
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

function stripTimestampsForDigest(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripTimestampsForDigest);
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    for (const [k, v] of entries) {
      if (
        k === 'createdAt' ||
        k === 'updatedAt' ||
        k === '_bridgeWriterId' ||
        k === '_bridgeUpdatedAtMs'
      ) {
        continue;
      }
      if (v !== undefined) {
        out[k] = stripTimestampsForDigest(v);
      }
    }
    return out;
  }
  return obj;
}

export function computeBridgeDigest(payload: LocalStorePayload): string {
  return JSON.stringify(stripTimestampsForDigest(payload));
}

export interface RtdbWireSnapshot {
  arena: ArenaData;
  matches: MatchData[];
  eventsByMatch: Record<string, Record<string, MatchEvent>>;
  athletes: AthleteData[];
  brackets: BracketMatchSlot[];
  _bridgeWriterId?: string;
  _bridgeUpdatedAtMs?: number;
}

export function toRtdbWireSnapshot(
  payload: LocalStorePayload,
  writerId?: string
): RtdbWireSnapshot {
  const cleaned = cleanUndefinedForRtdb(payload);
  const eventsMapByMatch: Record<string, Record<string, MatchEvent>> = {};

  for (const [mId, list] of Object.entries(cleaned.eventsByMatch || {})) {
    const mapForMatch: Record<string, MatchEvent> = {};
    for (const ev of list || []) {
      if (!ev || !ev.id) continue;
      mapForMatch[sanitizeRtdbKey(ev.id)] = ev;
    }
    if (Object.keys(mapForMatch).length > 0) {
      eventsMapByMatch[sanitizeRtdbKey(mId)] = mapForMatch;
    }
  }

  return {
    arena: cleaned.arena,
    matches: cleaned.matches,
    eventsByMatch: eventsMapByMatch,
    athletes: cleaned.athletes || [],
    brackets: cleaned.brackets || [],
    ...(writerId
      ? {
          _bridgeWriterId: writerId,
          _bridgeUpdatedAtMs: Date.now(),
        }
      : {}),
  };
}

function diffJurusCorner(
  basePath: string,
  prevCorner: JurusCornerData | undefined,
  nextCorner: JurusCornerData | undefined,
  updates: Record<string, unknown>
) {
  if (!prevCorner || !nextCorner) {
    updates[basePath] = nextCorner === undefined ? null : cleanUndefinedForRtdb(nextCorner);
    return;
  }

  const keys = new Set([
    ...Object.keys(prevCorner as unknown as Record<string, unknown>),
    ...Object.keys(nextCorner as unknown as Record<string, unknown>),
  ]);

  for (const k of keys) {
    const pv = (prevCorner as unknown as Record<string, unknown>)[k];
    const nv = (nextCorner as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(pv) !== JSON.stringify(nv)) {
      updates[`${basePath}/${k}`] = nv === undefined ? null : cleanUndefinedForRtdb(nv);
    }
  }
}

export interface ComputeRtdbPatchOptions {
  preserveRecentEventsWindowMs?: number;
  nowMs?: number;
}

/**
 * Computes granular atomic RTDB path updates between `prev` and `next` so concurrent writes
 * from different devices (e.g. Juri 1, Juri 2, Dewan, Timer, Sekretaris) never overwrite each other.
 * Returns `undefined` when structural changes (match list length/order, athletes, brackets) require
 * a full snapshot write, or `null` when nothing changed.
 */
export function computeRtdbPatch(
  prev: LocalStorePayload,
  next: LocalStorePayload,
  writerId: string,
  options?: ComputeRtdbPatchOptions
): Record<string, unknown> | null | undefined {
  if (!prev?.arena?.id || !next?.arena?.id || prev.arena.id !== next.arena.id) {
    return undefined;
  }

  if (prev.matches.length !== next.matches.length) {
    return undefined;
  }
  for (let i = 0; i < prev.matches.length; i += 1) {
    if (prev.matches[i]?.id !== next.matches[i]?.id) {
      return undefined;
    }
  }

  if (
    JSON.stringify(prev.athletes || []) !== JSON.stringify(next.athletes || []) ||
    JSON.stringify(prev.brackets || []) !== JSON.stringify(next.brackets || [])
  ) {
    return undefined;
  }

  const updates: Record<string, unknown> = {};

  // 1. Arena fields
  const arenaKeys = new Set([
    ...Object.keys(prev.arena as unknown as Record<string, unknown>),
    ...Object.keys(next.arena as unknown as Record<string, unknown>),
  ]);
  for (const key of arenaKeys) {
    if (key === 'createdAt' || key === 'updatedAt') continue;
    const pv = (prev.arena as unknown as Record<string, unknown>)[key];
    const nv = (next.arena as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(pv) !== JSON.stringify(nv)) {
      updates[`arena/${key}`] = nv === undefined ? null : cleanUndefinedForRtdb(nv);
    }
  }

  // 2. Match fields per index
  for (let i = 0; i < next.matches.length; i += 1) {
    const pm = prev.matches[i];
    const nm = next.matches[i];
    if (pm === nm) continue;

    const matchKeys = new Set([
      ...Object.keys(pm as unknown as Record<string, unknown>),
      ...Object.keys(nm as unknown as Record<string, unknown>),
    ]);

    for (const key of matchKeys) {
      if (key === 'createdAt' || key === 'updatedAt') continue;

      if (key === 'jurusState' && pm.jurusState && nm.jurusState) {
        if (JSON.stringify(pm.jurusState) !== JSON.stringify(nm.jurusState)) {
          diffJurusCorner(`matches/${i}/jurusState/blue`, pm.jurusState.blue, nm.jurusState.blue, updates);
          diffJurusCorner(`matches/${i}/jurusState/red`, pm.jurusState.red, nm.jurusState.red, updates);
        }
        continue;
      }

      const pv = (pm as unknown as Record<string, unknown>)[key];
      const nv = (nm as unknown as Record<string, unknown>)[key];
      if (JSON.stringify(pv) !== JSON.stringify(nv)) {
        updates[`matches/${i}/${key}`] = nv === undefined ? null : cleanUndefinedForRtdb(nv);
      }
    }
  }

  // 3. Events keyed by event ID (atomic per-event updates)
  const matchIds = new Set([
    ...Object.keys(prev.eventsByMatch || {}),
    ...Object.keys(next.eventsByMatch || {}),
  ]);
  const preserveWindow = options?.preserveRecentEventsWindowMs ?? 0;
  const nowMs = options?.nowMs ?? Date.now();

  for (const mId of matchIds) {
    const safeMatchKey = sanitizeRtdbKey(mId);
    const prevList = prev.eventsByMatch?.[mId] || [];
    const nextList = next.eventsByMatch?.[mId] || [];

    const prevMap = new Map(prevList.filter((e) => e?.id).map((e) => [e.id, e]));
    const nextMap = new Map(nextList.filter((e) => e?.id).map((e) => [e.id, e]));

    for (const [evId, nextEv] of nextMap.entries()) {
      const prevEv = prevMap.get(evId);
      if (!prevEv || JSON.stringify(prevEv) !== JSON.stringify(nextEv)) {
        updates[`eventsByMatch/${safeMatchKey}/${sanitizeRtdbKey(evId)}`] =
          cleanUndefinedForRtdb(nextEv);
      }
    }

    for (const [evId, prevEv] of prevMap.entries()) {
      if (!nextMap.has(evId)) {
        if (
          preserveWindow > 0 &&
          typeof prevEv.createdAtMs === 'number' &&
          nowMs - prevEv.createdAtMs < preserveWindow
        ) {
          continue;
        }
        updates[`eventsByMatch/${safeMatchKey}/${sanitizeRtdbKey(evId)}`] = null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return null;
  }

  updates._bridgeWriterId = writerId;
  updates._bridgeUpdatedAtMs = nowMs;
  return updates;
}
