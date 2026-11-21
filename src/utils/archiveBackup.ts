import type { ArenaData, AthleteData, BracketMatchSlot, MatchData, MatchEvent } from '../types/silat';
import type { LocalStorePayload } from './offlineSync';

export interface ArenaArchiveSummary {
  tournamentName: string;
  arenaName: string;
  venue: string;
  eventDate: string;
  totalMatches: number;
  finishedMatches: number;
  totalAthletes: number;
  totalBrackets: number;
}

export interface ArenaArchiveFile {
  format: 'jrz-score-archive';
  version: 1;
  exportedAt: string;
  summary: ArenaArchiveSummary;
  payload: LocalStorePayload;
}

function stripServerTimestamps<T extends Record<string, unknown>>(obj: T): T {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone as T;
}

function sanitizeArchivePayload(raw: LocalStorePayload): LocalStorePayload {
  const arena: ArenaData = stripServerTimestamps({
    id: typeof raw.arena?.id === 'string' && raw.arena.id.trim() ? raw.arena.id.trim().slice(0, 64) : 'gelanggang-a',
    name: typeof raw.arena?.name === 'string' && raw.arena.name.trim() ? raw.arena.name.trim().slice(0, 80) : 'Gelanggang A',
    tournamentName:
      typeof raw.arena?.tournamentName === 'string' && raw.arena.tournamentName.trim()
        ? raw.arena.tournamentName.trim().slice(0, 120)
        : 'Kejuaraan Pencak Silat IPSI',
    venue: typeof raw.arena?.venue === 'string' ? raw.arena.venue.slice(0, 120) : '',
    eventDate: typeof raw.arena?.eventDate === 'string' ? raw.arena.eventDate.slice(0, 80) : '',
    logoLeft: typeof raw.arena?.logoLeft === 'string' ? raw.arena.logoLeft.slice(0, 250000) : '',
    logoRight: typeof raw.arena?.logoRight === 'string' ? raw.arena.logoRight.slice(0, 250000) : '',
    ownerId: typeof raw.arena?.ownerId === 'string' && raw.arena.ownerId.trim() ? raw.arena.ownerId.trim() : 'local-operator',
    activeMatchId: typeof raw.arena?.activeMatchId === 'string' ? raw.arena.activeMatchId : '',
  });

  const matches: MatchData[] = Array.isArray(raw.matches)
    ? raw.matches.filter((m): m is MatchData => Boolean(m && typeof m === 'object' && m.id && m.matchNumber)).map((m) =>
        stripServerTimestamps({ ...m })
      )
    : [];

  if (matches.length > 0 && !matches.some((m) => m.id === arena.activeMatchId)) {
    arena.activeMatchId = matches[0].id;
  }

  const eventsByMatch: Record<string, MatchEvent[]> = {};
  if (raw.eventsByMatch && typeof raw.eventsByMatch === 'object') {
    for (const [mId, list] of Object.entries(raw.eventsByMatch)) {
      if (Array.isArray(list)) {
        eventsByMatch[mId] = list
          .filter((ev): ev is MatchEvent => Boolean(ev && typeof ev === 'object' && ev.id))
          .map((ev) => stripServerTimestamps({ ...ev }));
      }
    }
  }

  const athletes: AthleteData[] = Array.isArray(raw.athletes)
    ? raw.athletes
        .filter((a): a is AthleteData => Boolean(a && typeof a === 'object' && a.id && a.name))
        .map((a) => stripServerTimestamps({ ...a }))
    : [];

  const brackets: BracketMatchSlot[] = Array.isArray(raw.brackets)
    ? raw.brackets
        .filter((b): b is BracketMatchSlot => Boolean(b && typeof b === 'object' && b.id))
        .map((b) => stripServerTimestamps({ ...b }))
    : [];

  return {
    arena,
    matches,
    eventsByMatch,
    athletes,
    brackets,
  };
}

export function buildArenaArchiveFile(rawPayload: LocalStorePayload): ArenaArchiveFile {
  const payload = sanitizeArchivePayload(rawPayload);
  const finishedMatches = payload.matches.filter((m) => m.status === 'finished').length;

  return {
    format: 'jrz-score-archive',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: {
      tournamentName: payload.arena.tournamentName,
      arenaName: payload.arena.name,
      venue: payload.arena.venue || '',
      eventDate: payload.arena.eventDate || '',
      totalMatches: payload.matches.length,
      finishedMatches,
      totalAthletes: payload.athletes?.length || 0,
      totalBrackets: payload.brackets?.length || 0,
    },
    payload,
  };
}

export function downloadArenaArchiveFile(archive: ArenaArchiveFile): void {
  if (typeof window === 'undefined') return;
  const slug = (archive.summary.tournamentName || 'event-pencak-silat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'event';
  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `JRZ_Arsip_${slug}_${dateTag}.json`;

  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseArenaArchiveFile(rawText: string): ArenaArchiveFile | null {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const record = parsed as Partial<ArenaArchiveFile> & Partial<LocalStorePayload>;
    const candidatePayload: LocalStorePayload | null =
      record.format === 'jrz-score-archive' && record.payload && typeof record.payload === 'object'
        ? record.payload
        : record.arena && Array.isArray(record.matches)
        ? (record as LocalStorePayload)
        : null;

    if (!candidatePayload?.arena || !Array.isArray(candidatePayload.matches) || candidatePayload.matches.length === 0) {
      return null;
    }

    const sanitizedPayload = sanitizeArchivePayload(candidatePayload);
    if (sanitizedPayload.matches.length === 0) return null;

    const finishedMatches = sanitizedPayload.matches.filter((m) => m.status === 'finished').length;
    return {
      format: 'jrz-score-archive',
      version: 1,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
      summary: {
        tournamentName: sanitizedPayload.arena.tournamentName,
        arenaName: sanitizedPayload.arena.name,
        venue: sanitizedPayload.arena.venue || '',
        eventDate: sanitizedPayload.arena.eventDate || '',
        totalMatches: sanitizedPayload.matches.length,
        finishedMatches,
        totalAthletes: sanitizedPayload.athletes?.length || 0,
        totalBrackets: sanitizedPayload.brackets?.length || 0,
      },
      payload: sanitizedPayload,
    };
  } catch {
    return null;
  }
}
