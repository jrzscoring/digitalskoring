import { ArrowLeft, Award, Lock, Maximize2, Minimize2, Shield } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, JudgeId } from '../types/silat';
import {
  CONSENSUS_WINDOW_MS,
  computeCornerJurusSummary,
  ensureJurusState,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchScore,
  formatMatchTime,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import { TournamentIdentityBanner } from './TournamentIdentityBanner';

interface ScoreboardViewProps {
  onNavigate: (view: AppView) => void;
}

export function ScoreboardView({ onNavigate }: ScoreboardViewProps) {
  const { arena, activeMatch, liveTimerMs } = useArena();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const isJurus = isJurusMatch(activeMatch);
  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const activeVerification = !isJurus && activeMatch.verification?.active ? activeMatch.verification : null;
  const verificationSummary = useMemo(
    () => evaluateVerificationConsensus(activeVerification),
    [activeVerification]
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

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen denial in headless/sandbox environments
    }
  };

  const statusText =
    activeMatch.status === 'waiting'
      ? 'SIAP'
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
  const blueSummary = computeCornerJurusSummary(jurusType, jurusState.blue);
  const redSummary = computeCornerJurusSummary(jurusType, jurusState.red);
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
    ? 'bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800'
    : 'bg-gradient-to-b from-blue-600 via-blue-700 to-blue-800';
  const blueStatsBg = blueTrailing
    ? 'bg-slate-900/60 border-slate-400/40'
    : 'bg-blue-900/60 border-blue-300/40';
  const redSectionBg = redTrailing
    ? 'bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800'
    : 'bg-gradient-to-b from-red-600 via-red-700 to-red-800';
  const redStatsBg = redTrailing
    ? 'bg-slate-900/60 border-slate-400/40'
    : 'bg-red-900/60 border-red-300/40';

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col justify-between overflow-hidden select-none relative">
      {/* Kembali & Full Screen Controls */}
      <div className={`flex items-center justify-between gap-3 ${isFullscreen ? 'px-2.5 pt-2' : 'px-4 sm:px-6 pt-3'}`}>
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          aria-label="Kembali ke Menu Utama"
          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-blue-950/75 hover:bg-blue-900/85 border border-blue-500/45 hover:border-yellow-400 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-yellow-300" />
          <span>Kembali</span>
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-blue-950/75 hover:bg-blue-900/85 border border-blue-500/45 hover:border-yellow-400 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-yellow-300" />
          ) : (
            <Maximize2 className="w-4 h-4 text-yellow-300" />
          )}
          <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
        </button>
      </div>

      {/* Main Arena Split-Screen Scoreboard */}
      <main className={`flex-1 flex flex-col ${isFullscreen ? 'gap-2 p-2' : 'gap-3 sm:gap-4 p-3 sm:p-6'}`}>
        <TournamentIdentityBanner arena={arena} match={activeMatch} />

        {isJurus ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-3 sm:gap-4">
            {/* Sudut Biru Jurus */}
            <section
              className={`lg:col-span-5 rounded-3xl ${blueSectionBg} border-2 p-5 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center ${
                bluePulse
                  ? 'scale-[1.025] border-yellow-300 ring-4 ring-yellow-300/85 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : activePerformer === 'blue'
                  ? 'scale-100 border-yellow-300 ring-2 ring-yellow-300/40'
                  : blueTrailing
                  ? 'scale-100 border-slate-400/75'
                  : 'scale-100 border-blue-300/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div
                    className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${
                      blueTrailing ? 'text-blue-300' : 'text-yellow-300'
                    }`}
                  >
                    Sudut Biru
                  </div>
                  <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
                    {activeMatch.blueName}
                  </h2>
                  <div
                    className={`text-sm sm:text-lg font-medium truncate ${
                      blueTrailing ? 'text-slate-200' : 'text-blue-100'
                    }`}
                  >
                    {activeMatch.blueContingent}
                  </div>
                </div>
                {activePerformer === 'blue' && (
                  <span className="px-2.5 py-1 rounded-lg bg-yellow-400 text-black text-xs font-extrabold uppercase shrink-0">
                    Sedang Tampil
                  </span>
                )}
              </div>

              <div className="my-4 sm:my-6 flex items-center justify-center">
                <div
                  data-testid="scoreboard-jurus-blue-score"
                  className={`font-mono text-7xl sm:text-9xl leading-none font-extrabold tabular-nums transition-all duration-300 ease-out ${
                    bluePulse
                      ? 'scale-125 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow'
                  }`}
                >
                  {formatJurusScore(blueSummary.finalScore)}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${blueStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] text-blue-100">Median</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-yellow-300">
                    {formatJurusScore(blueSummary.median)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Potongan</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-red-200">
                    -{formatJurusScore(blueSummary.penaltyTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Waktu Tampil</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white">
                    {formatJurusElapsedMs(blueElapsedMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Std. Dev</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-blue-100">
                    {(blueSummary.stdDev / 100).toFixed(3)}
                  </div>
                </div>
              </div>
            </section>

            {/* Center Panel: Kategori Jurus & Dual Clocks */}
            <section className="lg:col-span-2 rounded-3xl bg-gradient-to-b from-[#130829]/95 to-black/95 border border-purple-700/60 p-4 flex flex-col items-center justify-between gap-3 text-center">
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-widest text-blue-300">
                  Jurus TGRS
                </div>
                <div className="font-display text-xl sm:text-2xl font-extrabold text-yellow-300">
                  {jurusType}
                </div>
              </div>

              <div className="w-full rounded-2xl bg-black/50 border border-purple-700/50 p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                  Waktu Tampil Arena
                </div>
                <div
                  data-testid="scoreboard-timer"
                  className={`font-mono text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight ${
                    liveTimerMs <= 10000 && activeMatch.status === 'active'
                      ? 'text-yellow-300'
                      : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-blue-300">{statusText}</div>
              </div>

              <div className="w-full rounded-2xl bg-black/50 border border-yellow-400/50 p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-200">
                  Waktu Nyata Penampil
                </div>
                <div className="font-mono text-3xl sm:text-4xl font-extrabold tabular-nums text-yellow-300">
                  {formatJurusElapsedMs(activeElapsedMs)}
                </div>
                <div className="text-[11px] font-semibold text-white">
                  {activePerformer === 'blue' ? 'Sudut Biru Tampil' : 'Sudut Merah Tampil'}
                </div>
              </div>
            </section>

            {/* Sudut Merah Jurus */}
            <section
              className={`lg:col-span-5 rounded-3xl ${redSectionBg} border-2 p-5 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center ${
                redPulse
                  ? 'scale-[1.025] border-yellow-300 ring-4 ring-yellow-300/85 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : activePerformer === 'red'
                  ? 'scale-100 border-yellow-300 ring-2 ring-yellow-300/40'
                  : redTrailing
                  ? 'scale-100 border-slate-400/75'
                  : 'scale-100 border-red-300/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                {activePerformer === 'red' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-yellow-400 text-black text-xs font-extrabold uppercase shrink-0">
                    Sedang Tampil
                  </span>
                ) : (
                  <span />
                )}
                <div className="space-y-1 text-right min-w-0">
                  <div
                    className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${
                      redTrailing ? 'text-red-300' : 'text-yellow-300'
                    }`}
                  >
                    Sudut Merah
                  </div>
                  <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
                    {activeMatch.redName}
                  </h2>
                  <div
                    className={`text-sm sm:text-lg font-medium truncate ${
                      redTrailing ? 'text-slate-200' : 'text-red-100'
                    }`}
                  >
                    {activeMatch.redContingent}
                  </div>
                </div>
              </div>

              <div className="my-4 sm:my-6 flex items-center justify-center">
                <div
                  data-testid="scoreboard-jurus-red-score"
                  className={`font-mono text-7xl sm:text-9xl leading-none font-extrabold tabular-nums transition-all duration-300 ease-out ${
                    redPulse
                      ? 'scale-125 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow'
                  }`}
                >
                  {formatJurusScore(redSummary.finalScore)}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${redStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] text-red-100">Median</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-yellow-300">
                    {formatJurusScore(redSummary.median)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Potongan</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-red-200">
                    -{formatJurusScore(redSummary.penaltyTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Waktu Tampil</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white">
                    {formatJurusElapsedMs(redElapsedMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Std. Dev</div>
                  <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-red-100">
                    {(redSummary.stdDev / 100).toFixed(3)}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-3 sm:gap-4">
            {/* Sudut Biru */}
            <section
              data-testid="scoreboard-blue-corner"
              className={`lg:col-span-5 rounded-3xl ${blueSectionBg} border-2 p-5 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center ${
                bluePulse
                  ? 'scale-[1.025] border-yellow-300 ring-4 ring-yellow-300/85 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : blueTrailing
                  ? 'scale-100 border-slate-400/75'
                  : 'scale-100 border-blue-300/80'
              }`}
            >
              <div className="space-y-1">
                <div
                  className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${
                    blueTrailing ? 'text-blue-300' : 'text-yellow-300'
                  }`}
                >
                  Sudut Biru
                </div>
                <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
                  {activeMatch.blueName}
                </h2>
                <div
                  className={`text-sm sm:text-lg font-medium truncate ${
                    blueTrailing ? 'text-slate-200' : 'text-blue-100'
                  }`}
                >
                  {activeMatch.blueContingent}
                </div>
              </div>

              <div className="my-4 sm:my-6 flex items-center justify-center">
                <div
                  data-testid="scoreboard-blue-score"
                  className={`font-mono text-8xl sm:text-[10rem] leading-none font-extrabold tabular-nums transition-all duration-300 ease-out ${
                    bluePulse
                      ? 'scale-125 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow'
                  }`}
                >
                  {activeMatch.blueScore}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${blueStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] text-blue-100">Jatuhan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-yellow-300">
                    {activeMatch.blueFalls}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Binaan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-white">
                    {activeMatch.blueBinaan}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Teguran</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-yellow-200">
                    {activeMatch.blueTeguran1 + activeMatch.blueTeguran2}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-100">Peringatan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-red-200">
                    {activeMatch.bluePeringatan}
                  </div>
                </div>
              </div>
            </section>

            {/* Center Clock, Round & Strike Totals */}
            <section className="lg:col-span-2 rounded-3xl bg-gradient-to-b from-[#130829]/95 to-black/95 border border-purple-700/60 p-4 flex flex-col items-center justify-between gap-4">
              <div className="text-center space-y-1">
                <div className="text-xs font-bold uppercase tracking-widest text-blue-300">Babak</div>
                <div className="font-display text-4xl sm:text-5xl font-extrabold text-yellow-300 tabular-nums">
                  {activeMatch.status === 'break' ? 'ISTIRAHAT' : activeMatch.currentRound}
                </div>
              </div>

              <div className="text-center">
                <div
                  data-testid="scoreboard-timer"
                  className={`font-mono text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight ${
                    liveTimerMs <= 10000 && activeMatch.status === 'active'
                      ? 'text-yellow-300'
                      : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-xs uppercase tracking-widest text-blue-300 mt-1">
                  {statusText}
                </div>
              </div>

              <div className="w-full space-y-2 text-xs font-mono tabular-nums border-t border-purple-800/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-blue-300 font-bold">{activeMatch.bluePunches}</span>
                  <span className="text-white/90 font-sans">Pukulan (+1)</span>
                  <span className="text-red-300 font-bold">{activeMatch.redPunches}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-300 font-bold">{activeMatch.blueKicks}</span>
                  <span className="text-white/90 font-sans">Tendangan (+2)</span>
                  <span className="text-red-300 font-bold">{activeMatch.redKicks}</span>
                </div>
              </div>
            </section>

            {/* Sudut Merah */}
            <section
              data-testid="scoreboard-red-corner"
              className={`lg:col-span-5 rounded-3xl ${redSectionBg} border-2 p-5 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 ease-out origin-center ${
                redPulse
                  ? 'scale-[1.025] border-yellow-300 ring-4 ring-yellow-300/85 shadow-[0_0_45px_rgba(250,204,21,0.45)] z-10'
                  : redTrailing
                  ? 'scale-100 border-slate-400/75'
                  : 'scale-100 border-red-300/80'
              }`}
            >
              <div className="space-y-1 text-right">
                <div
                  className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${
                    redTrailing ? 'text-red-300' : 'text-yellow-300'
                  }`}
                >
                  Sudut Merah
                </div>
                <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
                  {activeMatch.redName}
                </h2>
                <div
                  className={`text-sm sm:text-lg font-medium truncate ${
                    redTrailing ? 'text-slate-200' : 'text-red-100'
                  }`}
                >
                  {activeMatch.redContingent}
                </div>
              </div>

              <div className="my-4 sm:my-6 flex items-center justify-center">
                <div
                  data-testid="scoreboard-red-score"
                  className={`font-mono text-8xl sm:text-[10rem] leading-none font-extrabold tabular-nums transition-all duration-300 ease-out ${
                    redPulse
                      ? 'scale-125 text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.75)]'
                      : 'scale-100 text-white drop-shadow'
                  }`}
                >
                  {activeMatch.redScore}
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-2 text-center ${redStatsBg} rounded-2xl p-3 border transition-colors duration-300`}>
                <div>
                  <div className="text-[11px] text-red-100">Jatuhan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-yellow-300">
                    {activeMatch.redFalls}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Binaan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-white">
                    {activeMatch.redBinaan}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Teguran</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-yellow-200">
                    {activeMatch.redTeguran1 + activeMatch.redTeguran2}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-red-100">Peringatan</div>
                  <div className="font-mono text-xl font-bold tabular-nums text-red-200">
                    {activeMatch.redPeringatan}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Bottom Judge Strip */}
      {isJurus ? (
        <footer className="px-6 py-3 bg-[#090413]/95 border-t border-purple-800/60 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
            Nilai Juri ({activePerformer === 'blue' ? 'Sudut Biru' : 'Sudut Merah'}):
          </span>
          {([1, 2, 3] as JudgeId[]).map((jid, idx) => {
            const jKey = jid === 1 ? 'judge1' : jid === 2 ? 'judge2' : 'judge3';
            const locked = activeCornerData[jKey].submitted;
            const total = activeCornerSummary.judgeTotals[idx];
            return (
              <div
                key={jid}
                className={`px-4 py-1.5 rounded-xl border text-xs sm:text-sm font-mono font-bold flex items-center gap-2 ${
                  locked
                    ? 'bg-emerald-950/75 border-emerald-400 text-emerald-200'
                    : 'bg-black/70 border-purple-500/50 text-white'
                }`}
              >
                <span>Juri {jid}:</span>
                <span className="text-yellow-300">{formatJurusScore(total)}</span>
                {locked && <Lock className="w-3.5 h-3.5 text-emerald-300" />}
              </div>
            );
          })}
        </footer>
      ) : (
        <footer className="px-6 py-3 bg-[#090413]/95 border-t border-purple-800/60 flex items-center justify-center gap-4 sm:gap-8">
          {judgeLights.map((j) => (
            <div
              key={j.jid}
              className={`px-4 py-1.5 rounded-xl border text-xs sm:text-sm font-mono font-bold flex items-center gap-2 transition-colors ${
                !j.active
                  ? 'bg-black/70 border-blue-500/40 text-blue-200'
                  : j.corner === 'blue'
                  ? 'bg-blue-600 border-blue-300 text-white'
                  : 'bg-red-600 border-red-300 text-white'
              }`}
            >
              <span>Juri {j.jid}</span>
              {j.active && <span>+{j.points}</span>}
              {j.confirmed && <span className="text-yellow-300">SAH</span>}
            </div>
          ))}
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

            <div className="px-5 py-1 rounded-full bg-[#13182a] border border-amber-400/60 text-xs font-semibold text-amber-300">
              Proses verifikasi dewan aktif
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

      {/* Winner Celebration Overlay when Match Finished */}
      {activeMatch.status === 'finished' && activeMatch.winner && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div
            className={`max-w-2xl w-full rounded-3xl border-2 p-8 sm:p-10 text-center space-y-5 shadow-2xl ${
              activeMatch.winner === 'blue'
                ? 'bg-gradient-to-b from-blue-600 to-blue-800 border-blue-300'
                : activeMatch.winner === 'red'
                ? 'bg-gradient-to-b from-red-600 to-red-800 border-red-300'
                : 'bg-gradient-to-b from-[#1a0a36] to-black border-yellow-400'
            }`}
          >
            <Award className="w-16 h-16 text-yellow-300 mx-auto" />
            <div className="text-sm font-bold uppercase tracking-widest text-yellow-300">
              Pemenang Resmi &middot; {activeMatch.matchNumber}
            </div>
            <h2 className="font-display text-4xl sm:text-6xl font-extrabold text-white">
              {activeMatch.winner === 'blue'
                ? activeMatch.blueName
                : activeMatch.winner === 'red'
                ? activeMatch.redName
                : 'Pertandingan Seri'}
            </h2>
            <p className="text-lg text-blue-100">
              {activeMatch.winner === 'blue'
                ? `Sudut Biru · ${activeMatch.blueContingent}`
                : activeMatch.winner === 'red'
                ? `Sudut Merah · ${activeMatch.redContingent}`
                : 'Skor Seimbang'}
            </p>
            <div className="font-mono text-3xl font-extrabold text-yellow-300 tabular-nums">
              {formatMatchScore(activeMatch, 'blue')} &ndash; {formatMatchScore(activeMatch, 'red')}
            </div>
            <div className="text-base font-semibold text-white">{activeMatch.winMethod}</div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('sekretaris')}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm cursor-pointer"
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
