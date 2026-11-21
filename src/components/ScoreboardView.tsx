import { Award, Clock, FastForward, Lock, Shield, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import binaan1Icon from '@/binaan1.png';
import binaan2Icon from '@/binaan2.png';
import jatuhanBiruIcon from '@/Jatuhanbiru.png';
import jatuhanMerahIcon from '@/jatuhanmerah.png';
import peringatan1Icon from '@/peringatan1.png';
import peringatan2Icon from '@/peringatan2.png';
import teguran1Icon from '@/teguran1.png';
import teguran2Icon from '@/teguran2.png';
import pukulanWhite from '../assets/pukulan-white.png';
import tendanganWhite from '../assets/tendangan-white.png';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, JudgeId, MatchData } from '../types/silat';
import { getDefaultAthletePhoto, resolveAthletePhoto } from '../utils/athletePhotos';
import { CountryFlag, resolveCountryInfo } from '../utils/countries';
import {
  CONSENSUS_WINDOW_MS,
  computeCornerJurusSummary,
  ensureJurusState,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchScore,
  formatMatchTime,
  getJurusJudgeCount,
  getJurusJudgeIds,
  getJurusJudgeScore,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import { TournamentIdentityBanner } from './TournamentIdentityBanner';

interface ScoreboardViewProps {
  onNavigate: (view: AppView) => void;
}

function parseMatchNumberValue(matchNumber: string): number {
  const m = matchNumber.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function getNextThreeMatches(matches: MatchData[], activeMatch: MatchData): MatchData[] {
  const currentNum = parseMatchNumberValue(activeMatch.matchNumber);
  const currentIndex = matches.findIndex((m) => m.id === activeMatch.id);
  const candidates = matches.filter((m) => m.id !== activeMatch.id && m.status !== 'finished');

  const indexed = candidates.map((m) => {
    const idx = matches.findIndex((x) => x.id === m.id);
    const num = parseMatchNumberValue(m.matchNumber);
    const isAfter =
      num !== Number.MAX_SAFE_INTEGER && currentNum !== Number.MAX_SAFE_INTEGER
        ? num > currentNum
        : idx > currentIndex;
    return { m, num, idx, isAfter };
  });

  indexed.sort((a, b) => {
    if (a.isAfter !== b.isAfter) return a.isAfter ? -1 : 1;
    if (a.num !== b.num) return a.num - b.num;
    return a.idx - b.idx;
  });

  return indexed.slice(0, 3).map((item) => item.m);
}

function AthletePortrait({
  photo,
  corner,
  weightClass,
  alt,
  className = 'w-24 h-32 sm:w-32 sm:h-44 xl:w-36 xl:h-48',
  trailing = false,
}: {
  photo?: string;
  corner: Corner;
  weightClass?: string;
  alt: string;
  className?: string;
  trailing?: boolean;
}) {
  const resolved = resolveAthletePhoto(photo, corner, weightClass);
  const [src, setSrc] = useState(resolved.src);

  useEffect(() => {
    setSrc(resolved.src);
  }, [resolved.src]);

  const fallback = getDefaultAthletePhoto(corner, weightClass);
  const frameBorder = trailing
    ? 'border-slate-400/50'
    : corner === 'blue'
    ? 'border-sky-300/75 shadow-[0_12px_32px_rgba(37,99,235,0.45)]'
    : 'border-rose-300/75 shadow-[0_12px_32px_rgba(225,29,72,0.45)]';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-[#070b14] shrink-0 ${frameBorder} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => {
          if (src !== fallback) setSrc(fallback);
        }}
        className="w-full h-full object-cover object-top"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${
          corner === 'blue'
            ? 'bg-gradient-to-t from-blue-950/75 via-transparent to-sky-400/10'
            : 'bg-gradient-to-t from-red-950/75 via-transparent to-rose-400/10'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 inset-x-0 h-1 ${
          corner === 'blue' ? 'bg-sky-400' : 'bg-rose-400'
        }`}
      />
    </div>
  );
}

function SanctionTrack({
  count,
  max,
  tone,
}: {
  count: number;
  max: number;
  tone: 'amber' | 'yellow' | 'red';
}) {
  return (
    <div className="flex items-center justify-center gap-1 mt-1" aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => {
        const active = i < count;
        const activeClass =
          tone === 'amber'
            ? 'bg-amber-300 border-amber-200'
            : tone === 'yellow'
            ? 'bg-yellow-400 border-yellow-200'
            : 'bg-rose-500 border-rose-200';
        return (
          <span
            key={i}
            className={`h-1.5 w-3.5 rounded-[2px] border transition-colors ${
              active ? activeClass : 'bg-white/10 border-white/20'
            }`}
          />
        );
      })}
    </div>
  );
}

export function ScoreboardView({ onNavigate }: ScoreboardViewProps) {
  const { arena, matches, athletes, activeMatch, liveTimerMs } = useArena();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const findMatchedAthlete = useMemo(() => {
    return (name: string, contingent: string) => {
      const normName = name.trim().toLowerCase();
      if (!normName || normName === 'bye' || normName === 'menunggu pemenang') return undefined;
      const normCont = contingent.trim().toLowerCase();
      const exact = athletes.find(
        (a) =>
          a.name.trim().toLowerCase() === normName &&
          (!normCont || normCont === '-' || a.contingent.trim().toLowerCase() === normCont)
      );
      return exact || athletes.find((a) => a.name.trim().toLowerCase() === normName);
    };
  }, [athletes]);

  const isJurus = isJurusMatch(activeMatch);
  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const activeVerification = !isJurus && activeMatch.verification?.active ? activeMatch.verification : null;
  const verificationSummary = useMemo(
    () => evaluateVerificationConsensus(activeVerification),
    [activeVerification]
  );
  const isInterRoundBreak = !isJurus && activeMatch.status === 'break';
  const upcomingThreeMatches = useMemo(
    () => getNextThreeMatches(matches, activeMatch),
    [matches, activeMatch]
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isJurus || activeMatch.status !== 'active') return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isJurus, activeMatch.status, activeMatch.timerStartedAtMs]);

  const statusText =
    activeMatch.status === 'waiting'
      ? 'SIAP BERTANDING'
      : activeMatch.status === 'active'
      ? 'BERJALAN'
      : activeMatch.status === 'paused'
      ? 'DIJEDA'
      : activeMatch.status === 'break'
      ? 'ISTIRAHAT'
      : 'SELESAI';

  const now = Date.now();
  const judgeLights = ([1, 2, 3] as JudgeId[]).map((jid) => {
    const v =
      jid === 1 ? activeMatch.judge1Vote : jid === 2 ? activeMatch.judge2Vote : activeMatch.judge3Vote;
    const isFresh = v && v.corner !== 'none' && now - v.timestampMs <= CONSENSUS_WINDOW_MS;
    return {
      jid,
      active: Boolean(isFresh),
      corner: isFresh ? v?.corner : null,
      points: isFresh ? v?.points : 0,
      confirmed: Boolean(isFresh && v?.confirmed),
    };
  });

  const activePerformer: Corner = activeMatch.activePerformerCorner || 'blue';
  const jurusJudgeCount = getJurusJudgeCount(activeMatch);
  const jurusJudgeIds = useMemo(() => getJurusJudgeIds(jurusJudgeCount), [jurusJudgeCount]);
  const blueSummary = computeCornerJurusSummary(jurusType, jurusState.blue, jurusJudgeCount);
  const redSummary = computeCornerJurusSummary(jurusType, jurusState.red, jurusJudgeCount);
  const runningSegMs =
    isJurus && activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0
      ? Math.max(0, nowTick - activeMatch.timerStartedAtMs)
      : 0;
  const blueElapsedMs =
    jurusState.blue.recordedElapsedMs + (activePerformer === 'blue' ? runningSegMs : 0);
  const redElapsedMs =
    jurusState.red.recordedElapsedMs + (activePerformer === 'red' ? runningSegMs : 0);
  const activeElapsedMs = activePerformer === 'blue' ? blueElapsedMs : redElapsedMs;
  const activeCornerData = jurusState[activePerformer];
  const activeCornerSummary = activePerformer === 'blue' ? blueSummary : redSummary;

  const displayedBlueScore = isJurus ? blueSummary.finalScore : activeMatch.blueScore;
  const displayedRedScore = isJurus ? redSummary.finalScore : activeMatch.redScore;
  const blueTrailing = displayedBlueScore < displayedRedScore;
  const redTrailing = displayedRedScore < displayedBlueScore;
  const scoreDiff = displayedBlueScore - displayedRedScore;

  const matchedBlueAthlete = useMemo(
    () => findMatchedAthlete(activeMatch.blueName, activeMatch.blueContingent),
    [findMatchedAthlete, activeMatch.blueName, activeMatch.blueContingent]
  );
  const matchedRedAthlete = useMemo(
    () => findMatchedAthlete(activeMatch.redName, activeMatch.redContingent),
    [findMatchedAthlete, activeMatch.redName, activeMatch.redContingent]
  );

  const resolvedBluePhoto = activeMatch.bluePhoto || matchedBlueAthlete?.photo;
  const resolvedRedPhoto = activeMatch.redPhoto || matchedRedAthlete?.photo;

  const blueCountry = useMemo(
    () =>
      resolveCountryInfo(
        activeMatch.blueCountry || matchedBlueAthlete?.country,
        activeMatch.blueContingent
      ),
    [activeMatch.blueCountry, matchedBlueAthlete?.country, activeMatch.blueContingent]
  );
  const redCountry = useMemo(
    () =>
      resolveCountryInfo(
        activeMatch.redCountry || matchedRedAthlete?.country,
        activeMatch.redContingent
      ),
    [activeMatch.redCountry, matchedRedAthlete?.country, activeMatch.redContingent]
  );

  const [bluePulse, setBluePulse] = useState(false);
  const [redPulse, setRedPulse] = useState(false);
  const prevScoresRef = useRef<{ matchId: string; blue: number; red: number }>({
    matchId: activeMatch.id,
    blue: displayedBlueScore,
    red: displayedRedScore,
  });
  const bluePulseTimerRef = useRef<number | null>(null);
  const redPulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevScoresRef.current;
    if (prev.matchId !== activeMatch.id) {
      prevScoresRef.current = {
        matchId: activeMatch.id,
        blue: displayedBlueScore,
        red: displayedRedScore,
      };
      setBluePulse(false);
      setRedPulse(false);
      return;
    }

    if (prev.blue !== displayedBlueScore) {
      prev.blue = displayedBlueScore;
      setBluePulse(true);
      if (bluePulseTimerRef.current !== null) {
        window.clearTimeout(bluePulseTimerRef.current);
      }
      bluePulseTimerRef.current = window.setTimeout(() => {
        setBluePulse(false);
        bluePulseTimerRef.current = null;
      }, 600);
    }

    if (prev.red !== displayedRedScore) {
      prev.red = displayedRedScore;
      setRedPulse(true);
      if (redPulseTimerRef.current !== null) {
        window.clearTimeout(redPulseTimerRef.current);
      }
      redPulseTimerRef.current = window.setTimeout(() => {
        setRedPulse(false);
        redPulseTimerRef.current = null;
      }, 600);
    }
  }, [activeMatch.id, displayedBlueScore, displayedRedScore]);

  useEffect(() => {
    return () => {
      if (bluePulseTimerRef.current !== null) window.clearTimeout(bluePulseTimerRef.current);
      if (redPulseTimerRef.current !== null) window.clearTimeout(redPulseTimerRef.current);
    };
  }, []);

  const blueSectionBg = blueTrailing
    ? 'bg-gradient-to-br from-[#1b2434] via-[#121926] to-[#0a0f18]'
    : 'bg-gradient-to-br from-[#0d47a1] via-[#103888] to-[#081b4b]';
  const blueStatsBg = blueTrailing
    ? 'bg-black/45 border-slate-500/35'
    : 'bg-[#040d26]/70 border-sky-300/30';
  const redSectionBg = redTrailing
    ? 'bg-gradient-to-bl from-[#2c1d24] via-[#1e1419] to-[#110a0d]'
    : 'bg-gradient-to-bl from-[#b91c1c] via-[#991b1b] to-[#450a0a]';
  const redStatsBg = redTrailing
    ? 'bg-black/45 border-slate-500/35'
    : 'bg-[#260508]/70 border-rose-300/30';

  const totalRounds = activeMatch.totalRounds ?? 3;
  const blueTeguranTotal = activeMatch.blueTeguran1 + activeMatch.blueTeguran2;
  const redTeguranTotal = activeMatch.redTeguran1 + activeMatch.redTeguran2;

  // Momentum bar percentage for Tanding center tower
  const absTotal = Math.abs(displayedBlueScore) + Math.abs(displayedRedScore);
  const blueBarPct =
    scoreDiff === 0 || absTotal === 0
      ? 50
      : Math.min(88, Math.max(12, 50 + (scoreDiff / Math.max(10, absTotal)) * 45));

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(ellipse_at_top,_#1e1040_0%,_#090516_50%,_#030208_100%)] text-white flex flex-col justify-between overflow-hidden select-none relative">
      {/* Subtle Championship Arena Lighting Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-blue-600/10 via-purple-600/5 to-transparent"
      />

      <main className={`relative z-10 flex-1 flex flex-col ${isFullscreen ? 'gap-2 p-2 sm:p-3' : 'gap-3 sm:gap-4 p-3 sm:p-5'}`}>
        <TournamentIdentityBanner
          arena={arena}
          hideEventDetails
          onBack={() => onNavigate('landing')}
          showFullscreen
        />

        {isJurus ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-3 sm:gap-4">
            {/* Sudut Biru Jurus International Broadcast Card */}
            <section
              className={`lg:col-span-5 rounded-3xl ${blueSectionBg} border-2 p-4 sm:p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center relative overflow-hidden ${
                bluePulse
                  ? 'scale-[1.02] border-yellow-300 ring-4 ring-yellow-300/80 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : activePerformer === 'blue'
                  ? 'scale-100 border-yellow-300 ring-2 ring-yellow-300/45'
                  : blueTrailing
                  ? 'scale-100 border-slate-500/60'
                  : 'scale-100 border-sky-300/65'
              }`}
            >
              {/* Athlete Identity with Portrait + Flag + Name */}
              <div className="flex items-center gap-4 mb-2">
                <AthletePortrait
                  photo={resolvedBluePhoto}
                  corner="blue"
                  weightClass={activeMatch.weightClass}
                  alt={activeMatch.blueName}
                  trailing={blueTrailing}
                  className="w-24 h-32 sm:w-28 sm:h-36"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CountryFlag code={blueCountry.code} name={blueCountry.name} className="w-9 h-6" />
                      <span className="font-mono text-sm sm:text-base font-black tracking-wider text-yellow-300">
                        {blueCountry.code}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-sky-100/90 truncate">
                        {blueCountry.name}
                      </span>
                    </div>
                    {activePerformer === 'blue' && (
                      <span className="px-2 py-0.5 rounded bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider shrink-0">
                        Sedang Tampil
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl xl:text-5xl font-black tracking-tight uppercase text-white leading-[1.03] line-clamp-2">
                    {activeMatch.blueName}
                  </h2>
                  <div className="text-xs sm:text-sm font-semibold text-sky-100/80 truncate">
                    {activeMatch.blueContingent}
                  </div>
                </div>
              </div>

              {/* Score */}
              <div className="my-1 sm:my-2 flex-1 flex items-center justify-center">
                <div
                  data-testid="scoreboard-jurus-blue-score"
                  className={`font-mono text-[5.5rem] sm:text-[7.5rem] lg:text-[9rem] xl:text-[10.5rem] 2xl:text-[12rem] leading-[0.88] tracking-tighter font-black tabular-nums transition-all duration-300 ease-out ${
                    bluePulse
                      ? 'scale-110 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                  }`}
                >
                  {formatJurusScore(blueSummary.finalScore)}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${blueStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-sky-100/80 font-semibold">Median</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-yellow-300">
                    {formatJurusScore(blueSummary.median)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-sky-100/80 font-semibold">Potongan</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-rose-300">
                    -{formatJurusScore(blueSummary.penaltyTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-sky-100/80 font-semibold">Waktu</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white">
                    {formatJurusElapsedMs(blueElapsedMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-sky-100/80 font-semibold">Std. Dev</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-sky-100">
                    {(blueSummary.stdDev / 100).toFixed(3)}
                  </div>
                </div>
              </div>
            </section>

            {/* Center Panel: Kategori Jurus & Dual Clocks */}
            <section className="lg:col-span-2 rounded-3xl bg-gradient-to-b from-[#130a29]/95 via-[#0b0618]/95 to-black/95 border border-purple-600/55 p-4 flex flex-col items-center justify-between gap-3 text-center shadow-2xl">
              <div className="w-full pb-2.5 border-b border-white/10 space-y-0.5">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-sky-300">
                  Jurus TGRS
                </div>
                <div className="font-display text-xl sm:text-2xl font-black uppercase text-yellow-300">
                  {jurusType}
                </div>
              </div>

              <div className="w-full rounded-2xl bg-black/65 border border-purple-500/45 p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">
                  Waktu Tampil Arena
                </div>
                <div
                  data-testid="scoreboard-timer"
                  className={`font-mono text-4xl sm:text-5xl font-black tabular-nums tracking-tight ${
                    liveTimerMs <= 10000 && activeMatch.status === 'active'
                      ? 'text-yellow-300'
                      : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-sky-300">{statusText}</div>
              </div>

              <div className="w-full rounded-2xl bg-black/65 border border-yellow-400/45 p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-200">
                  Waktu Nyata Penampil
                </div>
                <div className="font-mono text-3xl sm:text-4xl font-black tabular-nums text-yellow-300">
                  {formatJurusElapsedMs(activeElapsedMs)}
                </div>
                <div className="text-[11px] font-semibold text-white">
                  {activePerformer === 'blue' ? 'Sudut Biru Tampil' : 'Sudut Merah Tampil'}
                </div>
              </div>
            </section>

            {/* Sudut Merah Jurus International Broadcast Card */}
            <section
              className={`lg:col-span-5 rounded-3xl ${redSectionBg} border-2 p-4 sm:p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center relative overflow-hidden ${
                redPulse
                  ? 'scale-[1.02] border-yellow-300 ring-4 ring-yellow-300/80 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : activePerformer === 'red'
                  ? 'scale-100 border-yellow-300 ring-2 ring-yellow-300/45'
                  : redTrailing
                  ? 'scale-100 border-slate-500/60'
                  : 'scale-100 border-rose-300/65'
              }`}
            >
              {/* Athlete Identity with Portrait (Right Edge) + Flag + Name */}
              <div className="flex items-center gap-4 mb-2 flex-row-reverse text-right">
                <AthletePortrait
                  photo={resolvedRedPhoto}
                  corner="red"
                  weightClass={activeMatch.weightClass}
                  alt={activeMatch.redName}
                  trailing={redTrailing}
                  className="w-24 h-32 sm:w-28 sm:h-36"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                    {activePerformer === 'red' ? (
                      <span className="px-2 py-0.5 rounded bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider shrink-0">
                        Sedang Tampil
                      </span>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center justify-end gap-2.5 min-w-0">
                      <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-rose-100/90 truncate">
                        {redCountry.name}
                      </span>
                      <span className="font-mono text-sm sm:text-base font-black tracking-wider text-yellow-300">
                        {redCountry.code}
                      </span>
                      <CountryFlag code={redCountry.code} name={redCountry.name} className="w-9 h-6" />
                    </div>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl xl:text-5xl font-black tracking-tight uppercase text-white leading-[1.03] line-clamp-2">
                    {activeMatch.redName}
                  </h2>
                  <div className="text-xs sm:text-sm font-semibold text-rose-100/80 truncate">
                    {activeMatch.redContingent}
                  </div>
                </div>
              </div>

              <div className="my-1 sm:my-2 flex-1 flex items-center justify-center">
                <div
                  data-testid="scoreboard-jurus-red-score"
                  className={`font-mono text-[5.5rem] sm:text-[7.5rem] lg:text-[9rem] xl:text-[10.5rem] 2xl:text-[12rem] leading-[0.88] tracking-tighter font-black tabular-nums transition-all duration-300 ease-out ${
                    redPulse
                      ? 'scale-110 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                  }`}
                >
                  {formatJurusScore(redSummary.finalScore)}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${redStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-rose-100/80 font-semibold">Median</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-yellow-300">
                    {formatJurusScore(redSummary.median)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-rose-100/80 font-semibold">Potongan</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-rose-300">
                    -{formatJurusScore(redSummary.penaltyTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-rose-100/80 font-semibold">Waktu</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white">
                    {formatJurusElapsedMs(redElapsedMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-rose-100/80 font-semibold">Std. Dev</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-rose-100">
                    {(redSummary.stdDev / 100).toFixed(3)}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : isInterRoundBreak ? (
          <div
            data-testid="scoreboard-break-upcoming"
            className="flex-1 flex flex-col gap-4 justify-between"
          >
            {/* Ringkasan Pertandingan Berjalan & Hitung Mundur Jeda */}
            <section className="rounded-3xl bg-[#0b061a]/95 border border-purple-600/55 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 items-center gap-4 shadow-2xl">
              {/* Sudut Biru */}
              <div className="lg:col-span-4 rounded-2xl bg-gradient-to-r from-blue-700/80 to-blue-950/90 border border-sky-400/55 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AthletePortrait
                    photo={resolvedBluePhoto}
                    corner="blue"
                    weightClass={activeMatch.weightClass}
                    alt={activeMatch.blueName}
                    className="w-12 h-16"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <CountryFlag code={blueCountry.code} name={blueCountry.name} className="w-5 h-3.5" />
                      <span className="font-mono text-[11px] font-extrabold text-yellow-300">
                        {blueCountry.code}
                      </span>
                    </div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-white truncate">
                      {activeMatch.blueName}
                    </div>
                    <div className="text-xs text-blue-100 truncate">{activeMatch.blueContingent}</div>
                  </div>
                </div>
                <div className="font-mono text-4xl sm:text-5xl font-black tabular-nums text-white shrink-0">
                  {activeMatch.blueScore}
                </div>
              </div>

              {/* Timer Jeda Antar Babak */}
              <div className="lg:col-span-4 text-center space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-yellow-300">
                  <Clock className="w-4 h-4" />
                  <span>Jeda Antar Babak &middot; Babak {activeMatch.currentRound} Selesai</span>
                </div>
                <div
                  data-testid="scoreboard-timer"
                  className={`font-mono text-5xl sm:text-6xl font-black tabular-nums tracking-tight leading-none ${
                    liveTimerMs <= 10000 && activeMatch.timerStartedAtMs > 0
                      ? 'text-yellow-300'
                      : 'text-sky-300'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-blue-200">
                  {activeMatch.timerStartedAtMs > 0 ? 'Waktu Istirahat Berjalan' : 'Waktu Istirahat Dijeda'}
                </div>
              </div>

              {/* Sudut Merah */}
              <div className="lg:col-span-4 rounded-2xl bg-gradient-to-l from-red-700/80 to-red-950/90 border border-rose-400/55 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="font-mono text-4xl sm:text-5xl font-black tabular-nums text-white shrink-0">
                  {activeMatch.redScore}
                </div>
                <div className="flex items-center gap-3 min-w-0 flex-row-reverse text-right">
                  <AthletePortrait
                    photo={resolvedRedPhoto}
                    corner="red"
                    weightClass={activeMatch.weightClass}
                    alt={activeMatch.redName}
                    className="w-12 h-16"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center justify-end gap-1.5 mb-0.5">
                      <span className="font-mono text-[11px] font-extrabold text-yellow-300">
                        {redCountry.code}
                      </span>
                      <CountryFlag code={redCountry.code} name={redCountry.name} className="w-5 h-3.5" />
                    </div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-white truncate">
                      {activeMatch.redName}
                    </div>
                    <div className="text-xs text-red-100 truncate">{activeMatch.redContingent}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3 Partai Pertandingan Selanjutnya */}
            <section className="flex-1 rounded-3xl bg-[#0d051c]/90 border border-purple-700/60 p-4 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-800/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <FastForward className="w-5 h-5 text-yellow-300" />
                  <h2 className="font-display text-lg sm:text-2xl font-extrabold uppercase tracking-wider text-yellow-300">
                    3 Partai Pertandingan Selanjutnya
                  </h2>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-200">
                  Persiapan Atlet &amp; Kontingen
                </span>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                {[0, 1, 2].map((slotIdx) => {
                  const m = upcomingThreeMatches[slotIdx];
                  if (!m) {
                    return (
                      <div
                        key={`upcoming-empty-${slotIdx}`}
                        className="rounded-2xl bg-black/40 border border-dashed border-purple-700/50 p-5 flex flex-col items-center justify-center text-center gap-2 text-purple-300/60"
                      >
                        <div className="text-xs font-extrabold uppercase tracking-widest">
                          Antrean #{slotIdx + 1}
                        </div>
                        <div className="text-sm font-semibold">
                          Belum ada partai pertandingan terjadwal
                        </div>
                      </div>
                    );
                  }

                  const mBlueAth = findMatchedAthlete(m.blueName, m.blueContingent);
                  const mRedAth = findMatchedAthlete(m.redName, m.redContingent);
                  const mBlueCountry = resolveCountryInfo(m.blueCountry || mBlueAth?.country, m.blueContingent);
                  const mRedCountry = resolveCountryInfo(m.redCountry || mRedAth?.country, m.redContingent);
                  const mBluePhoto = m.bluePhoto || mBlueAth?.photo;
                  const mRedPhoto = m.redPhoto || mRedAth?.photo;

                  return (
                    <div
                      key={m.id}
                      data-testid={`scoreboard-upcoming-match-${slotIdx + 1}`}
                      className="rounded-2xl bg-gradient-to-b from-[#170a32] to-[#0a0418] border border-purple-500/50 p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-purple-800/60 pb-2.5">
                        <div>
                          <div className="font-display text-xl sm:text-2xl font-black uppercase text-yellow-300">
                            {m.matchNumber}
                          </div>
                          <div className="text-xs font-semibold text-blue-200">
                            {m.weightClass}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-purple-900/80 border border-purple-400/50 text-[11px] font-extrabold uppercase tracking-wider text-white shrink-0">
                          {m.stage}
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col justify-center gap-2.5">
                        <div className="rounded-xl bg-blue-950/80 border border-blue-400/50 px-3.5 py-2.5 flex items-center gap-3">
                          <AthletePortrait
                            photo={mBluePhoto}
                            corner="blue"
                            weightClass={m.weightClass}
                            alt={m.blueName}
                            className="w-10 h-12"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-sky-300">
                              <CountryFlag code={mBlueCountry.code} name={mBlueCountry.name} className="w-4 h-3" />
                              <span>{mBlueCountry.code} &middot; Sudut Biru</span>
                            </div>
                            <div className="font-display text-lg sm:text-xl font-extrabold text-white truncate">
                              {m.blueName}
                            </div>
                            <div className="text-xs font-medium text-blue-200 truncate">
                              {m.blueContingent}
                            </div>
                          </div>
                        </div>

                        <div className="text-center text-[11px] font-black uppercase tracking-[0.25em] text-yellow-300">
                          VS
                        </div>

                        <div className="rounded-xl bg-red-950/80 border border-red-400/50 px-3.5 py-2.5 flex items-center gap-3 flex-row-reverse text-right">
                          <AthletePortrait
                            photo={mRedPhoto}
                            corner="red"
                            weightClass={m.weightClass}
                            alt={m.redName}
                            className="w-10 h-12"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-end gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-rose-300">
                              <span>Sudut Merah &middot; {mRedCountry.code}</span>
                              <CountryFlag code={mRedCountry.code} name={mRedCountry.name} className="w-4 h-3" />
                            </div>
                            <div className="font-display text-lg sm:text-xl font-extrabold text-white truncate">
                              {m.redName}
                            </div>
                            <div className="text-xs font-medium text-red-200 truncate">
                              {m.redContingent}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          /* TANDING INTERNATIONAL CHAMPIONSHIP BROADCAST BOARD */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-3 sm:gap-4">
            {/* SUDUT BIRU / BLUE CORNER */}
            <section
              data-testid="scoreboard-blue-corner"
              className={`lg:col-span-5 rounded-3xl ${blueSectionBg} border-2 p-4 sm:p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center relative overflow-hidden ${
                bluePulse
                  ? 'scale-[1.02] border-yellow-300 ring-4 ring-yellow-300/80 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : blueTrailing
                  ? 'scale-100 border-slate-500/60'
                  : 'scale-100 border-sky-300/70'
              }`}
            >
              {/* Athlete Portrait + Nation Flag + Athlete Name */}
              <div className="flex items-center gap-3.5 sm:gap-5 mb-2">
                <AthletePortrait
                  photo={resolvedBluePhoto}
                  corner="blue"
                  weightClass={activeMatch.weightClass}
                  alt={activeMatch.blueName}
                  trailing={blueTrailing}
                  className="w-24 h-32 sm:w-28 sm:h-38 xl:w-32 xl:h-42"
                />

                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Nation Row */}
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CountryFlag code={blueCountry.code} name={blueCountry.name} className="w-10 h-6 sm:w-11 sm:h-7" />
                      <span className="font-mono text-base sm:text-lg font-black tracking-wider text-yellow-300">
                        {blueCountry.code}
                      </span>
                      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-100/90 truncate">
                        {blueCountry.name}
                      </span>
                    </div>
                    {scoreDiff > 0 && (
                      <span className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300 tabular-nums shrink-0">
                        UNGGUL +{scoreDiff}
                      </span>
                    )}
                  </div>

                  {/* Fighter Name */}
                  <h2 className="font-display text-3xl sm:text-4xl xl:text-[2.75rem] font-black tracking-tight uppercase text-white leading-[1.02] line-clamp-2">
                    {activeMatch.blueName}
                  </h2>

                  {/* Contingent */}
                  <div
                    className={`text-xs sm:text-base font-semibold truncate ${
                      blueTrailing ? 'text-slate-300' : 'text-sky-100/85'
                    }`}
                  >
                    {activeMatch.blueContingent}
                  </div>
                </div>
              </div>

              {/* Giant Tabular Broadcast Score */}
              <div className="my-1 sm:my-2 flex-1 flex items-center justify-center">
                <div
                  data-testid="scoreboard-blue-score"
                  className={`font-mono text-[7.5rem] sm:text-[11rem] lg:text-[13rem] xl:text-[15.5rem] 2xl:text-[18rem] leading-[0.86] tracking-tighter font-black tabular-nums transition-all duration-300 ease-out ${
                    bluePulse
                      ? 'scale-110 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)]'
                  }`}
                >
                  {activeMatch.blueScore}
                </div>
              </div>

              {/* Official Fall & Sanction Telemetry Bar */}
              <div className={`grid grid-cols-4 gap-2 text-center ${blueStatsBg} rounded-2xl px-2.5 py-3 border transition-colors duration-300`}>
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                    <img src={jatuhanBiruIcon} alt="" className="w-3.5 h-3.5 object-contain" />
                    <span>Jatuhan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-yellow-300 leading-tight mt-0.5">
                    {activeMatch.blueFalls}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                    <img
                      src={activeMatch.blueBinaan >= 2 ? binaan2Icon : binaan1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Binaan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-white leading-tight mt-0.5">
                    {activeMatch.blueBinaan}
                  </div>
                  <SanctionTrack count={activeMatch.blueBinaan} max={2} tone="amber" />
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                    <img
                      src={blueTeguranTotal >= 2 ? teguran2Icon : teguran1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Teguran</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-yellow-200 leading-tight mt-0.5">
                    {blueTeguranTotal}
                  </div>
                  <SanctionTrack count={blueTeguranTotal} max={2} tone="yellow" />
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                    <img
                      src={activeMatch.bluePeringatan >= 2 ? peringatan2Icon : peringatan1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Peringatan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-rose-200 leading-tight mt-0.5">
                    {activeMatch.bluePeringatan}
                  </div>
                  <SanctionTrack count={activeMatch.bluePeringatan} max={3} tone="red" />
                </div>
              </div>
            </section>

            {/* CENTER ARENA BROADCAST TOWER */}
            <section className="lg:col-span-2 rounded-3xl bg-gradient-to-b from-[#130a29]/95 via-[#0a0616]/95 to-[#040308]/95 border border-purple-600/55 p-3.5 sm:p-4 flex flex-col items-center justify-between gap-3.5 shadow-2xl">
              {/* Round Progress Block */}
              <div className="w-full text-center space-y-2 pb-3 border-b border-white/10">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-sky-300">
                  Babak
                </div>
                <div className="font-display text-4xl sm:text-5xl font-black text-yellow-300 tabular-nums leading-none">
                  {activeMatch.currentRound}
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1" aria-label={`Babak ${activeMatch.currentRound} dari ${totalRounds}`}>
                  {Array.from({ length: totalRounds }).map((_, idx) => {
                    const rNum = idx + 1;
                    const isCurrent = rNum === activeMatch.currentRound;
                    const isDone = rNum < activeMatch.currentRound;
                    return (
                      <div
                        key={rNum}
                        className={`py-1 rounded-md text-[11px] font-mono font-black border tabular-nums ${
                          isCurrent
                            ? 'bg-yellow-400 border-yellow-200 text-black'
                            : isDone
                            ? 'bg-purple-800/70 border-purple-400/50 text-white'
                            : 'bg-black/50 border-white/15 text-slate-400'
                        }`}
                      >
                        R{rNum}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Master Countdown Clock */}
              <div className="w-full rounded-2xl bg-black/75 border border-purple-500/45 py-3.5 px-2 text-center shadow-inner">
                <div
                  data-testid="scoreboard-timer"
                  className={`font-mono text-4xl sm:text-5xl xl:text-[3.25rem] font-black tabular-nums tracking-tight leading-none ${
                    liveTimerMs <= 10000 && activeMatch.status === 'active'
                      ? 'text-yellow-300'
                      : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-300 mt-2">
                  {statusText}
                </div>
              </div>

              {/* Score Momentum / Advantage Differential */}
              <div className="w-full space-y-1.5 px-0.5">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300 tabular-nums">
                  <span className="text-sky-300">Biru</span>
                  <span className="text-yellow-300">
                    {scoreDiff === 0
                      ? 'Imbang'
                      : scoreDiff > 0
                      ? `Biru +${scoreDiff}`
                      : `Merah +${Math.abs(scoreDiff)}`}
                  </span>
                  <span className="text-rose-300">Merah</span>
                </div>
                <div className="h-2 w-full rounded-full bg-rose-600/80 overflow-hidden flex border border-white/15">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${blueBarPct}%` }}
                  />
                </div>
              </div>

              {/* Head-to-Head Technique Breakdown */}
              <div className="w-full space-y-2.5 text-xs font-mono tabular-nums border-t border-white/10 pt-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <span className="text-sky-300 font-black text-base text-left">{activeMatch.bluePunches}</span>
                  <div className="flex items-center gap-1.5 text-white/90 font-sans text-[11px] font-semibold">
                    <img src={pukulanWhite} alt="" className="w-3.5 h-3.5 object-contain opacity-90" />
                    <span>Pukulan</span>
                  </div>
                  <span className="text-rose-300 font-black text-base text-right">{activeMatch.redPunches}</span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <span className="text-sky-300 font-black text-base text-left">{activeMatch.blueKicks}</span>
                  <div className="flex items-center gap-1.5 text-white/90 font-sans text-[11px] font-semibold">
                    <img src={tendanganWhite} alt="" className="w-3.5 h-3.5 object-contain opacity-90" />
                    <span>Tendangan</span>
                  </div>
                  <span className="text-rose-300 font-black text-base text-right">{activeMatch.redKicks}</span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <span className="text-sky-300 font-black text-base text-left">{activeMatch.blueFalls}</span>
                  <span className="text-yellow-300 font-sans text-[11px] font-semibold">Jatuhan</span>
                  <span className="text-rose-300 font-black text-base text-right">{activeMatch.redFalls}</span>
                </div>
              </div>
            </section>

            {/* SUDUT MERAH / RED CORNER */}
            <section
              data-testid="scoreboard-red-corner"
              className={`lg:col-span-5 rounded-3xl ${redSectionBg} border-2 p-4 sm:p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center relative overflow-hidden ${
                redPulse
                  ? 'scale-[1.02] border-yellow-300 ring-4 ring-yellow-300/80 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : redTrailing
                  ? 'scale-100 border-slate-500/60'
                  : 'scale-100 border-rose-300/70'
              }`}
            >
              {/* Athlete Portrait (Outer Right Edge) + Nation Flag + Athlete Name */}
              <div className="flex items-center gap-3.5 sm:gap-5 mb-2 flex-row-reverse text-right">
                <AthletePortrait
                  photo={resolvedRedPhoto}
                  corner="red"
                  weightClass={activeMatch.weightClass}
                  alt={activeMatch.redName}
                  trailing={redTrailing}
                  className="w-24 h-32 sm:w-28 sm:h-38 xl:w-32 xl:h-42"
                />

                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Nation Row */}
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                    {scoreDiff < 0 ? (
                      <span className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300 tabular-nums shrink-0">
                        UNGGUL +{Math.abs(scoreDiff)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center justify-end gap-2.5 min-w-0">
                      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-100/90 truncate">
                        {redCountry.name}
                      </span>
                      <span className="font-mono text-base sm:text-lg font-black tracking-wider text-yellow-300">
                        {redCountry.code}
                      </span>
                      <CountryFlag code={redCountry.code} name={redCountry.name} className="w-10 h-6 sm:w-11 sm:h-7" />
                    </div>
                  </div>

                  {/* Fighter Name */}
                  <h2 className="font-display text-3xl sm:text-4xl xl:text-[2.75rem] font-black tracking-tight uppercase text-white leading-[1.02] line-clamp-2">
                    {activeMatch.redName}
                  </h2>

                  {/* Contingent */}
                  <div
                    className={`text-xs sm:text-base font-semibold truncate ${
                      redTrailing ? 'text-slate-300' : 'text-rose-100/85'
                    }`}
                  >
                    {activeMatch.redContingent}
                  </div>
                </div>
              </div>

              {/* Giant Tabular Broadcast Score */}
              <div className="my-1 sm:my-2 flex-1 flex items-center justify-center">
                <div
                  data-testid="scoreboard-red-score"
                  className={`font-mono text-[7.5rem] sm:text-[11rem] lg:text-[13rem] xl:text-[15.5rem] 2xl:text-[18rem] leading-[0.86] tracking-tighter font-black tabular-nums transition-all duration-300 ease-out ${
                    redPulse
                      ? 'scale-110 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)]'
                  }`}
                >
                  {activeMatch.redScore}
                </div>
              </div>

              {/* Official Fall & Sanction Telemetry Bar */}
              <div className={`grid grid-cols-4 gap-2 text-center ${redStatsBg} rounded-2xl px-2.5 py-3 border transition-colors duration-300`}>
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-100/90">
                    <img src={jatuhanMerahIcon} alt="" className="w-3.5 h-3.5 object-contain" />
                    <span>Jatuhan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-yellow-300 leading-tight mt-0.5">
                    {activeMatch.redFalls}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-100/90">
                    <img
                      src={activeMatch.redBinaan >= 2 ? binaan2Icon : binaan1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Binaan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-white leading-tight mt-0.5">
                    {activeMatch.redBinaan}
                  </div>
                  <SanctionTrack count={activeMatch.redBinaan} max={2} tone="amber" />
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-100/90">
                    <img
                      src={redTeguranTotal >= 2 ? teguran2Icon : teguran1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Teguran</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-yellow-200 leading-tight mt-0.5">
                    {redTeguranTotal}
                  </div>
                  <SanctionTrack count={redTeguranTotal} max={2} tone="yellow" />
                </div>

                <div className="flex flex-col items-center justify-center border-l border-white/10">
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-100/90">
                    <img
                      src={activeMatch.redPeringatan >= 2 ? peringatan2Icon : peringatan1Icon}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                    />
                    <span>Peringatan</span>
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tabular-nums text-rose-200 leading-tight mt-0.5">
                    {activeMatch.redPeringatan}
                  </div>
                  <SanctionTrack count={activeMatch.redPeringatan} max={3} tone="red" />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Bottom Broadcast Console Strip */}
      {isJurus ? (
        <footer className="relative z-10 px-6 py-3 bg-[#080412]/95 border-t border-purple-700/50 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-200">
            <span>{arena.name}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-yellow-300">{activeMatch.matchNumber}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-white">{activeMatch.stage}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-white">{activeMatch.weightClass}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-yellow-300">
              {activePerformer === 'blue' ? 'Sudut Biru Tampil' : 'Sudut Merah Tampil'}
            </span>
          </div>
          <div
            data-testid="scoreboard-jurus-judges"
            className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
          >
            {jurusJudgeIds.map((jid, idx) => {
              const jScore = getJurusJudgeScore(activeCornerData, jid);
              const locked = jScore.submitted;
              const total = activeCornerSummary.judgeTotals[idx] ?? 0;
              return (
                <div
                  key={jid}
                  data-testid={`scoreboard-jurus-judge-${jid}`}
                  className={`${
                    jurusJudgeCount > 6 ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs sm:text-sm'
                  } rounded-xl border font-mono font-bold tabular-nums flex items-center gap-1.5 ${
                    locked
                      ? 'bg-emerald-950/75 border-emerald-400 text-emerald-200'
                      : 'bg-black/70 border-purple-500/45 text-white'
                  }`}
                >
                  <span>Juri {jid}:</span>
                  <span className="text-yellow-300">{formatJurusScore(total)}</span>
                  {locked && <Lock className="w-3.5 h-3.5 text-emerald-300" />}
                </div>
              );
            })}
          </div>
        </footer>
      ) : (
        <footer className="relative z-10 px-6 py-3 bg-[#080412]/95 border-t border-purple-700/50 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-200">
            <span>{arena.name}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-yellow-300">{activeMatch.matchNumber}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-white">{activeMatch.stage}</span>
            <span aria-hidden="true" className="mx-2 text-yellow-400/70">&middot;</span>
            <span className="text-white">{activeMatch.weightClass}</span>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-5 mx-auto sm:mx-0">
            {judgeLights.map((j) => (
              <div
                key={j.jid}
                className={`px-4 py-1.5 rounded-xl border text-xs sm:text-sm font-mono font-bold tabular-nums flex items-center gap-2 transition-colors ${
                  !j.active
                    ? 'bg-black/75 border-purple-500/40 text-slate-300'
                    : j.corner === 'blue'
                    ? 'bg-blue-600 border-sky-300 text-white shadow-[0_0_16px_rgba(37,99,235,0.5)]'
                    : 'bg-red-600 border-rose-300 text-white shadow-[0_0_16px_rgba(220,38,38,0.5)]'
                }`}
              >
                <span>JURI {j.jid}</span>
                {j.active ? (
                  <>
                    <span className="text-yellow-300">+{j.points}</span>
                    {j.confirmed && <span className="text-white font-black">SAH</span>}
                  </>
                ) : (
                  <span className="text-[10px] tracking-wider text-slate-400">SIAGA</span>
                )}
              </div>
            ))}
          </div>
        </footer>
      )}

      {/* Overlay Verifikasi Dewan Real-Time pada Monitor Pertandingan (Kategori Tanding) */}
      {activeVerification && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Monitor Verifikasi Dewan"
          className="fixed inset-0 z-40 bg-[#050814]/88 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        >
          <div className="max-w-3xl w-full rounded-2xl bg-gradient-to-b from-[#071538] via-[#050d24] to-[#04091a] border-2 border-amber-400/85 shadow-[0_0_50px_rgba(251,191,36,0.28)] p-6 sm:p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#091533] border border-amber-400/70 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
              <Shield className="w-7 h-7 text-amber-400" />
            </div>

            <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
              Proses Verifikasi Dewan Aktif
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-white">
              VERIFIKASI: {activeVerification.kind === 'jatuhan' ? 'JATUHAN' : 'PELANGGARAN'}
            </h2>

            <div className="px-5 py-2 rounded-xl bg-[#071026] border border-blue-800/70 text-xs sm:text-sm font-semibold">
              <span className="text-amber-300 font-bold">KASUS :</span>{' '}
              <span className="text-slate-100">
                &ldquo;Verifikasi {activeVerification.kind === 'jatuhan' ? 'Jatuhan' : 'Pelanggaran'}&rdquo;
              </span>
            </div>

            <div className="w-full text-left font-mono text-xs font-bold uppercase tracking-widest text-cyan-300 pt-1">
              RESPON KONSENSUS 3 JURI:
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-8 py-2">
              {([1, 2, 3] as JudgeId[]).map((jid) => {
                const vote =
                  jid === 1
                    ? activeVerification.j1Vote
                    : jid === 2
                    ? activeVerification.j2Vote
                    : activeVerification.j3Vote;

                const ringClass =
                  vote === 'blue'
                    ? 'border-blue-400 bg-blue-950/75 shadow-[0_0_24px_rgba(59,130,246,0.55)]'
                    : vote === 'red'
                    ? 'border-red-400 bg-red-950/75 shadow-[0_0_24px_rgba(239,68,68,0.55)]'
                    : vote === 'invalid'
                    ? 'border-amber-400 bg-amber-950/70 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
                    : 'border-blue-900/80 border-t-amber-400 bg-[#070d1f] shadow-[0_0_20px_rgba(59,130,246,0.2)]';

                return (
                  <div
                    key={jid}
                    className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 flex flex-col items-center justify-center gap-1 transition-all ${ringClass}`}
                  >
                    <span className="text-sm sm:text-base font-extrabold text-slate-200">
                      JURI {jid}
                    </span>
                    {vote === 'none' ? (
                      <span className="text-[11px] font-semibold text-amber-300">Menunggu</span>
                    ) : (
                      <span
                        className={`text-xs font-extrabold uppercase ${
                          vote === 'blue'
                            ? 'text-blue-300'
                            : vote === 'red'
                            ? 'text-red-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {vote === 'blue' ? 'SAH BIRU' : vote === 'red' ? 'SAH MERAH' : 'TIDAK SAH'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="w-full rounded-xl bg-[#071026] border border-blue-900/70 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3">
              <span>
                {verificationSummary.votedCount}/3 Suara Juri Masuk (Diperlukan minimal 2 suara sepadan)
              </span>
              {(verificationSummary.hasConsensus || verificationSummary.allVoted) && (
                <span
                  className={`px-2.5 py-0.5 rounded font-extrabold uppercase ${
                    verificationSummary.consensus === 'blue'
                      ? 'bg-blue-600/80 text-white'
                      : verificationSummary.consensus === 'red'
                      ? 'bg-red-600/80 text-white'
                      : 'bg-amber-500/80 text-black'
                  }`}
                >
                  HASIL VALIDASI: {verificationSummary.label}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* International Winner Celebration Overlay */}
      {activeMatch.status === 'finished' && activeMatch.winner && (
        <div className="fixed inset-0 z-50 bg-black/88 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
          <div
            className={`max-w-3xl w-full rounded-3xl border-2 p-6 sm:p-9 text-center space-y-5 shadow-2xl ${
              activeMatch.winner === 'blue'
                ? 'bg-gradient-to-b from-[#0d47a1] via-[#0a2d6e] to-[#051438] border-sky-300'
                : activeMatch.winner === 'red'
                ? 'bg-gradient-to-b from-[#b91c1c] via-[#7f1d1d] to-[#330707] border-rose-300'
                : 'bg-gradient-to-b from-[#1a0a36] to-black border-yellow-400'
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold uppercase tracking-[0.22em] text-yellow-300">
              <Trophy className="w-5 h-5" />
              <span>Pemenang Resmi &middot; {activeMatch.matchNumber} &middot; {activeMatch.stage}</span>
            </div>

            {activeMatch.winner !== 'draw' ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-7 py-2">
                <AthletePortrait
                  photo={activeMatch.winner === 'blue' ? resolvedBluePhoto : resolvedRedPhoto}
                  corner={activeMatch.winner}
                  weightClass={activeMatch.weightClass}
                  alt={activeMatch.winner === 'blue' ? activeMatch.blueName : activeMatch.redName}
                  className="w-32 h-44 sm:w-36 sm:h-48"
                />
                <div className="space-y-2 text-center sm:text-left min-w-0">
                  <div className="flex items-center justify-center sm:justify-start gap-2.5">
                    {(() => {
                      const wc = activeMatch.winner === 'blue' ? blueCountry : redCountry;
                      return (
                        <>
                          <CountryFlag code={wc.code} name={wc.name} className="w-11 h-7" />
                          <span className="font-mono text-lg font-black text-yellow-300">{wc.code}</span>
                          <span className="text-sm font-bold uppercase tracking-wider text-white/90">
                            {wc.name}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <h2 className="font-display text-4xl sm:text-5xl font-black uppercase text-white leading-none">
                    {activeMatch.winner === 'blue' ? activeMatch.blueName : activeMatch.redName}
                  </h2>
                  <p className="text-base sm:text-lg font-semibold text-white/85">
                    {activeMatch.winner === 'blue'
                      ? `Sudut Biru · ${activeMatch.blueContingent}`
                      : `Sudut Merah · ${activeMatch.redContingent}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-3 space-y-2">
                <Award className="w-16 h-16 text-yellow-300 mx-auto" />
                <h2 className="font-display text-4xl sm:text-6xl font-black text-white">
                  Pertandingan Seri
                </h2>
                <p className="text-lg text-blue-100">Skor Seimbang</p>
              </div>
            )}

            <div className="pt-2 border-t border-white/15 space-y-2">
              <div className="font-mono text-4xl font-black text-yellow-300 tabular-nums">
                {formatMatchScore(activeMatch, 'blue')} &ndash; {formatMatchScore(activeMatch, 'red')}
              </div>
              <div className="text-base font-bold uppercase tracking-wider text-white">
                {activeMatch.winMethod}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('sekretaris')}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm cursor-pointer transition-colors"
              >
                Kembali ke Panel Sekretaris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
