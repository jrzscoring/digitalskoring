import { ArrowLeftRight, Coffee, Pause, Play, RotateCcw, Timer, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner } from '../types/silat';
import {
  ensureJurusState,
  formatJurusElapsedMs,
  formatMatchTime,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import { playArenaGong } from '../utils/soundEffects';
import { ModuleHeader } from './ModuleHeader';
import { TournamentIdentityBanner } from './TournamentIdentityBanner';

interface TimerViewProps {
  onNavigate: (view: AppView) => void;
}

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Siap Dimulai',
  active: 'Pertandingan Berjalan',
  paused: 'Waktu Dijeda',
  break: 'Waktu Istirahat',
  finished: 'Pertandingan Selesai',
};

export function TimerView({ onNavigate }: TimerViewProps) {
  const {
    arena,
    activeMatch,
    liveTimerMs,
    startTimer,
    pauseTimer,
    resetTimer,
    setRound,
    startBreakTimer,
    setActivePerformerCorner,
    recordJurusElapsedAndSwitch,
  } = useArena();

  const isJurus = isJurusMatch(activeMatch);
  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isJurus || activeMatch.status !== 'active') return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isJurus, activeMatch.status, activeMatch.timerStartedAtMs]);

  const totalRounds = activeMatch.totalRounds ?? 3;
  const roundList = totalRounds === 2 ? [1, 2] : [1, 2, 3];
  const isRunning = activeMatch.status === 'active' || activeMatch.status === 'break';
  const isFinished = activeMatch.status === 'finished';

  if (isJurus) {
    const activePerformer: Corner = activeMatch.activePerformerCorner || 'blue';
    const runningSegMs =
      activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0
        ? Math.max(0, nowTick - activeMatch.timerStartedAtMs)
        : 0;
    const blueElapsedMs =
      jurusState.blue.recordedElapsedMs + (activePerformer === 'blue' ? runningSegMs : 0);
    const redElapsedMs =
      jurusState.red.recordedElapsedMs + (activePerformer === 'red' ? runningSegMs : 0);
    const currentElapsedMs = activePerformer === 'blue' ? blueElapsedMs : redElapsedMs;

    const toleranceLabel =
      currentElapsedMs === 0
        ? 'Siap Tampil (Standar 03:00)'
        : currentElapsedMs < 175000
        ? 'Berjalan (< 02:55)'
        : currentElapsedMs <= 185000
        ? 'Dalam Toleransi IPSI (02:55 – 03:05)'
        : 'Melebihi Toleransi (> 03:05)';

    const toleranceTone =
      currentElapsedMs === 0
        ? 'text-blue-200 border-blue-400/40 bg-black/50'
        : currentElapsedMs >= 175000 && currentElapsedMs <= 185000
        ? 'text-emerald-300 border-emerald-400/60 bg-emerald-950/50'
        : currentElapsedMs > 185000
        ? 'text-red-300 border-red-400/60 bg-red-950/60'
        : 'text-yellow-300 border-yellow-400/50 bg-black/50';

    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
        <ModuleHeader currentView="timer" onNavigate={onNavigate} />

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col justify-center gap-5">
          <TournamentIdentityBanner arena={arena} compact />

          {/* Match Identity */}
          <section className="text-center space-y-1.5">
            <div className="text-xs sm:text-sm text-yellow-300 font-bold uppercase tracking-wider">
              Timer Kategori Jurus TGRS &middot; {jurusType}
            </div>
            <div className="text-xs sm:text-sm text-blue-200">
              {activeMatch.matchNumber} &middot; {activeMatch.stage} &middot; {activeMatch.weightClass}
            </div>
          </section>

          {/* Performer Corner Switcher */}
          <section className="grid grid-cols-2 gap-3">
            {(['blue', 'red'] as Corner[]).map((corner) => {
              const isBlue = corner === 'blue';
              const isActiveCorner = activePerformer === corner;
              const name = isBlue ? activeMatch.blueName : activeMatch.redName;
              const cont = isBlue ? activeMatch.blueContingent : activeMatch.redContingent;
              const elapsed = isBlue ? blueElapsedMs : redElapsedMs;
              const completed = jurusState[corner].completed;

              return (
                <button
                  key={corner}
                  type="button"
                  disabled={isFinished}
                  onClick={() => void setActivePerformerCorner(corner)}
                  className={`rounded-2xl p-3.5 sm:p-4 border-2 text-left transition-all cursor-pointer disabled:cursor-default ${
                    isActiveCorner
                      ? isBlue
                        ? 'bg-gradient-to-r from-blue-700/90 via-blue-900/90 to-black border-yellow-400 shadow-lg'
                        : 'bg-gradient-to-l from-red-700/90 via-red-900/90 to-black border-yellow-400 shadow-lg'
                      : 'bg-[#0d051c]/85 border-purple-700/60 hover:border-purple-400 opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                      {isBlue ? 'Sudut Biru' : 'Sudut Merah'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {completed && (
                        <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-400/50 text-[10px] font-bold text-blue-200">
                          TERSIMPAN
                        </span>
                      )}
                      {isActiveCorner && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-[10px] font-bold text-emerald-300">
                          SEDANG TAMPIL
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-lg sm:text-xl font-bold text-white truncate">
                        {name}
                      </div>
                      <div className="text-xs text-blue-100 truncate">{cont}</div>
                    </div>
                    <div className="font-mono text-lg sm:text-xl font-extrabold tabular-nums text-yellow-300 shrink-0">
                      {formatJurusElapsedMs(elapsed)}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* 2 Primary Clocks: Waktu Tampil Arena & Waktu Nyata Penampil */}
          <section className="rounded-3xl bg-[#0d051c]/90 border border-purple-700/60 p-5 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
                Status:{' '}
                <span className="text-yellow-300">
                  {STATUS_LABEL[activeMatch.status] || activeMatch.status}
                </span>
              </span>
              <span className={`px-3 py-1 rounded-lg border text-xs font-bold ${toleranceTone}`}>
                {toleranceLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timer 1: Waktu Tampil Arena (Countdown) */}
              <div className="rounded-2xl bg-black/65 border-2 border-purple-500/60 p-5 text-center flex flex-col justify-between gap-2">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-blue-200">
                  <Timer className="w-4 h-4 text-yellow-300" />
                  <span>Waktu Tampil Arena</span>
                </div>
                <div
                  data-testid="jurus-arena-timer"
                  className={`font-mono text-6xl sm:text-7xl font-black tabular-nums tracking-tight leading-none py-2 ${
                    liveTimerMs <= 10000 && isRunning ? 'text-yellow-300' : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-xs text-blue-200">
                  Hitung Mundur Arena (Standar 03:00 IPSI 2026)
                </div>
              </div>

              {/* Timer 2: Waktu Nyata Penampil (Elapsed Count-up + Overtime) */}
              <div className="rounded-2xl bg-black/65 border-2 border-yellow-400/70 p-5 text-center flex flex-col justify-between gap-2">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-yellow-300">
                  <Timer className="w-4 h-4 text-yellow-300" />
                  <span>Waktu Nyata Penampil</span>
                </div>
                <div
                  data-testid="jurus-performer-timer"
                  className="font-mono text-6xl sm:text-7xl font-black tabular-nums tracking-tight leading-none py-2 text-yellow-300"
                >
                  {formatJurusElapsedMs(currentElapsedMs)}
                </div>
                <div className="text-xs text-yellow-100">
                  Penampil Aktif:{' '}
                  <span className="font-bold">
                    {activePerformer === 'blue' ? `Sudut Biru (${activeMatch.blueName})` : `Sudut Merah (${activeMatch.redName})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Controls */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {isRunning ? (
                <button
                  type="button"
                  onClick={() => void pauseTimer()}
                  className="min-h-[58px] px-4 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-display text-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Pause className="w-5 h-5" />
                  <span>Jeda</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isFinished}
                  onClick={() => void startTimer()}
                  className="min-h-[58px] px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-display text-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 text-yellow-300" />
                  <span>Mulai</span>
                </button>
              )}

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void resetTimer()}
                className="min-h-[58px] px-4 py-3 rounded-2xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 disabled:opacity-40 text-white font-display text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5 text-blue-300" />
                <span>Reset Waktu</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void recordJurusElapsedAndSwitch()}
                className="min-h-[58px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-300/60 disabled:opacity-40 text-white font-display text-base sm:text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeftRight className="w-5 h-5 text-yellow-200 shrink-0" />
                <span>Simpan &amp; Ganti Sudut</span>
              </button>

              <button
                type="button"
                onClick={() => playArenaGong()}
                className="min-h-[58px] px-4 py-3 rounded-2xl bg-black/70 border border-yellow-400/60 hover:bg-yellow-400 hover:text-black text-yellow-300 font-display text-lg font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Volume2 className="w-5 h-5" />
                <span>Bunyikan Gong</span>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
      <ModuleHeader currentView="timer" onNavigate={onNavigate} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-center gap-6">
        <TournamentIdentityBanner arena={arena} compact />

        {/* Match Identity */}
        <section className="text-center space-y-1">
          <div className="text-xs sm:text-sm text-blue-200">
            {activeMatch.matchNumber} &middot; {activeMatch.stage} &middot; {activeMatch.weightClass}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            <span className="text-blue-400">{activeMatch.blueName}</span>
            <span className="text-yellow-300 mx-3">vs</span>
            <span className="text-red-400">{activeMatch.redName}</span>
          </h1>
        </section>

        {/* Central Digital Clock Display */}
        <section className="rounded-3xl bg-[#0d051c]/90 border border-purple-700/60 p-6 sm:p-10 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl sm:text-2xl font-bold text-yellow-300 uppercase tracking-wider">
              {activeMatch.status === 'break' ? 'Istirahat' : `Babak ${activeMatch.currentRound} / ${totalRounds}`}
            </span>
            <span aria-hidden="true" className="text-blue-400">&middot;</span>
            <span className="text-sm font-medium text-blue-200">
              {STATUS_LABEL[activeMatch.status] || activeMatch.status}
            </span>
          </div>

          <div
            data-testid="timer-display"
            className={`font-mono text-7xl sm:text-9xl font-extrabold tabular-nums tracking-tight leading-none ${
              liveTimerMs <= 10000 && isRunning
                ? 'text-yellow-300'
                : activeMatch.status === 'break'
                ? 'text-blue-300'
                : 'text-white'
            }`}
          >
            {formatMatchTime(liveTimerMs)}
          </div>

          {/* Primary Play / Pause / Reset Controls */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {isRunning ? (
              <button
                type="button"
                onClick={() => void pauseTimer()}
                className="min-h-[60px] px-6 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Pause className="w-6 h-6" />
                <span>Jeda</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void startTimer()}
                className="min-h-[60px] px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6 text-yellow-300" />
                <span>Mulai</span>
              </button>
            )}

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void resetTimer()}
              className="min-h-[60px] px-6 py-3 rounded-2xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 disabled:opacity-40 text-white font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5 text-blue-300" />
              <span>Reset Babak</span>
            </button>

            <button
              type="button"
              onClick={() => playArenaGong()}
              className="min-h-[60px] px-6 py-3 rounded-2xl bg-black/70 border border-yellow-400/60 hover:bg-yellow-400 hover:text-black text-yellow-300 font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer transition-colors"
            >
              <Volume2 className="w-5 h-5" />
              <span>Bunyikan Gong</span>
            </button>
          </div>
        </section>

        {/* Round Switcher & Break Mode */}
        <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {roundList.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isFinished}
                onClick={() => void setRound(r)}
                className={`flex-1 sm:flex-none min-h-[46px] px-5 rounded-xl font-bold text-sm cursor-pointer ${
                  activeMatch.currentRound === r && activeMatch.status !== 'break'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-black/70 border border-blue-500/40 text-blue-200 hover:bg-blue-950 hover:text-white'
                }`}
              >
                Babak {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isFinished}
            onClick={() => void startBreakTimer(60)}
            className="w-full sm:w-auto min-h-[46px] px-5 rounded-xl bg-blue-950/80 border border-blue-400/60 hover:bg-blue-900 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Coffee className="w-4 h-4 text-yellow-300" />
            <span>Mulai Istirahat (01:00)</span>
          </button>
        </section>
      </main>
    </div>
  );
}
