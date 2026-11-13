import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onValue, ref, set } from 'firebase/database';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, rtdb, userRtdbProjectId } from '../lib/firebase';
import type { ArenaData, MatchData, MatchEvent } from '../types/silat';

export interface LocalStorePayload {
  arena: ArenaData;
  matches: MatchData[];
  eventsByMatch: Record<string, MatchEvent[]>;
}

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

  return {
    arena: data.arena,
    matches: matchesArray,
    eventsByMatch,
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
}

export function useFirestoreSync({
  user,
  authReady,
  joinedArenaId,
  rtdbArenaId,
  activeMatchId,
  getSeedPayload,
  onRtdbSync,
}: UseFirestoreSyncParams) {
  const [cloudArena, setCloudArena] = useState<ArenaData | null>(null);
  const [cloudMatches, setCloudMatches] = useState<MatchData[]>([]);
  const [cloudEvents, setCloudEvents] = useState<MatchEvent[]>([]);
  const [rtdbConnected, setRtdbConnected] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isFirestoreActive = Boolean(user && cloudArena);

  // 1. Firebase Realtime Database (window.firebaseConfig) real-time sync
  useEffect(() => {
    if (!rtdb || isFirestoreActive) {
      setRtdbConnected(false);
      return;
    }

    const connectedRef = ref(rtdb, '.info/connected');
    const unsubConn = onValue(connectedRef, (snap) => {
      setRtdbConnected(Boolean(snap.val()));
    });

    const arenaRtdbRef = ref(rtdb, `silat_arenas/${rtdbArenaId}`);
    const unsubArena = onValue(
      arenaRtdbRef,
      (snap) => {
        const val = snap.val();
        if (val === null) {
          const seedPayload = sanitizeForRtdb(getSeedPayload());
          seedPayload.arena.id = rtdbArenaId;
          set(arenaRtdbRef, seedPayload).catch((err) => {
            console.warn('RTDB initial seed warning:', err?.message);
          });
          return;
        }
        const normalized = normalizeRtdbPayload(val);
        if (normalized) {
          onRtdbSync(normalized);
          setSyncError(null);
        }
      },
      (err) => {
        setSyncError(`Firebase RTDB (${userRtdbProjectId || 'rtdb'}): ${err.message}`);
      }
    );

    return () => {
      unsubConn();
      unsubArena();
    };
  }, [rtdbArenaId, isFirestoreActive, getSeedPayload, onRtdbSync]);

  // 2. Cloud Firestore arena & matches real-time subscription when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setCloudArena(null);
      setCloudMatches([]);
      setCloudEvents([]);
      return;
    }

    const targetArenaId = joinedArenaId || sanitizeId(`arena-${user.uid.slice(0, 12)}`);
    const arenaRef = doc(db, 'arenas', targetArenaId);

    let unsubArena: (() => void) | null = null;
    let unsubMatches: (() => void) | null = null;

    const initAndSubscribe = async () => {
      try {
        const snap = await getDoc(arenaRef);
        if (!snap.exists() && !joinedArenaId) {
          const initialMatchId = 'partai-01';
          await setDoc(arenaRef, {
            id: targetArenaId,
            name: 'Gelanggang A',
            tournamentName: 'Kejuaraan Nasional Pencak Silat IPSI 2026',
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        unsubArena = onSnapshot(
          arenaRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setCloudArena(docSnap.data() as ArenaData);
              setSyncError(null);
            }
          },
          (err) => {
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
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Gagal terhubung ke Firebase.');
      }
    };

    void initAndSubscribe();

    return () => {
      unsubArena?.();
      unsubMatches?.();
    };
  }, [authReady, user, joinedArenaId]);

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
        handleFirestoreError(err, OperationType.GET, `arenas/${cloudArena.id}/matches/${cloudArena.activeMatchId}`);
      }
    );
    return () => unsub();
  }, [user, cloudArena, joinedArenaId]);

  // 4. Active match events real-time subscription
  useEffect(() => {
    if (!isFirestoreActive || !user || !cloudArena || !activeMatchId) return;
    const eventsQuery = query(
      collection(db, 'arenas', cloudArena.id, 'matches', activeMatchId, 'events'),
      where('ownerId', '==', cloudArena.ownerId),
      orderBy('createdAt', 'desc'),
      limit(50)
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
  }, [isFirestoreActive, user, cloudArena, activeMatchId]);

  return {
    cloudArena,
    cloudMatches,
    cloudEvents,
    rtdbConnected,
    syncError,
    setSyncError,
  };
}
