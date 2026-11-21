import {
  ArrowLeftRight,
  Clock,
  Coffee,
  FastForward,
  Flame,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Unlock,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, MatchData } from '../types/silat';
import {
  ensureJurusState,
  formatJurusElapsedMs,
  formatMatchTime,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import { playArenaGong } from '../utils/soundEffects';
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

const TIMER_DURATION_OPTIONS = [
  { seconds: 90, label: '01.30s' },
  { seconds: 120, label: '02.00s' },
  { seconds: 180, label: '03.00s' },
] as const;

function formatDurationOptionLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}.${String(secs).padStart(2, '0')}s`;
}

function parseMatchNumberValue(matchNumber: string): number {
  const m = matchNumber.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function getOrderedUpcomingMatches(matches: MatchData[], activeMatch: MatchData): MatchData[] {
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

  return indexed.map((item) => item.m);
}

function extractClassAndGender(weightClass: string): { kelas: string; gender: string } {
  const raw = (weightClass || '').trim();
  const isPutri = /\bputri\b/i.test(raw);
  const isPutra = /\bputra\b/i.test(raw);
  const gender = isPutri ? 'Putri' : isPutra ? 'Putra' : '-';
  const cleaned = raw
    .replace(/\(\s*(putra|putri)\s*\)/gi, '')
    .replace(/\b(putra|putri)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    kelas: cleaned || raw || '-',
    gender,
  };
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const {
    arena,
    matches,
    activeMatch,
    events,
    liveTimerMs,
    startTimer,
    pauseTimer,
    resetTimer,
    setRound,
    startBreakTimer,
    resumeBreakTimer,
    resetBreakTimer,
    toggleJuriLock,
    setMatchTotalRounds,
    setMatchRoundDuration,
    setActivePerformerCorner,
    recordJurusElapsedAndSwitch,
  } = useArena();

  const isJurus = isJurusMatch(activeMatch);
  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const [showScoreSummary, setShowScoreSummary] = useState(false);

  useEffect(() => {
    if (!isJurus || activeMatch.status !== 'active') return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isJurus, activeMatch.status, activeMatch.timerStartedAtMs]);

  const totalRounds = activeMatch.totalRounds ?? 3;
  const roundList = totalRounds === 2 ? [1, 2] : [1, 2, 3];
  const isRunning =
    (activeMatch.status === 'active' || activeMatch.status === 'break') &&
    activeMatch.timerStartedAtMs > 0;
  const isFinished = activeMatch.status === 'finished';
  const isBreakActive = !isJurus && activeMatch.status === 'break';
  const isBreakRunning = isBreakActive && activeMatch.timerStartedAtMs > 0;
  const isBreakPaused = isBreakActive && activeMatch.timerStartedAtMs === 0;
  const isInterRoundEnded =
    !isJurus &&
    activeMatch.status === 'active' &&
    liveTimerMs === 0 &&
    activeMatch.currentRound < totalRounds;
  const breakBannerKey = isBreakActive
    ? `break-${activeMatch.id}-r${activeMatch.currentRound}`
    : isInterRoundEnded
    ? `ended-${activeMatch.id}-r${activeMatch.currentRound}`
    : null;
  const showBreakBanner = Boolean(breakBannerKey && dismissedBannerKey !== breakBannerKey);
  const hasNextRound = activeMatch.currentRound < totalRounds;
  const nextRound = Math.min(totalRounds, activeMatch.currentRound + 1);

  const upcomingMatches = useMemo(
    () => getOrderedUpcomingMatches(matches, activeMatch),
    [matches, activeMatch]
  );
  const nextMatch = upcomingMatches[0] || null;
  const nextMatchMeta = nextMatch ? extractClassAndGender(nextMatch.weightClass) : null;

  useEffect(() => {
    if (!showBreakBanner) {
      setShowScoreSummary(false);
    }
  }, [showBreakBanner]);

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
      <div className="min-h-[100dvh] bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4">
          <TournamentIdentityBanner
            arena={arena}
            compact
            onBack={() => onNavigate('landing')}
            showFullscreen
          />

          {/* Match Identity */}
          <section className="shrink-0 text-center space-y-1">
            <div className="text-xs sm:text-sm text-yellow-300 font-bold uppercase tracking-wider">
              Timer Kategori Jurus TGRS &middot; {jurusType}
            </div>
            <div className="text-xs sm:text-sm text-blue-200">
              {activeMatch.matchNumber} &middot; {activeMatch.stage} &middot; {activeMatch.weightClass}
            </div>
          </section>

          {/* Performer Corner Switcher */}
          <section className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className={`rounded-2xl p-3 sm:p-4 border-2 text-left transition-all cursor-pointer disabled:cursor-default ${
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
          <section className="flex-1 min-h-0 rounded-3xl bg-[#0d051c]/90 border border-purple-700/60 p-4 sm:p-6 lg:p-8 flex flex-col justify-between gap-4 sm:gap-6">
            <div className="shrink-0 flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-200">
                Status:{' '}
                <span className="text-yellow-300">
                  {STATUS_LABEL[activeMatch.status] || activeMatch.status}
                </span>
              </span>
              <span className={`px-3 py-1 rounded-lg border text-xs sm:text-sm font-bold ${toleranceTone}`}>
                {toleranceLabel}
              </span>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
              {/* Timer 1: Waktu Tampil Arena (Countdown) */}
              <div className="rounded-2xl bg-black/65 border-2 border-purple-500/60 p-4 sm:p-6 text-center flex flex-col justify-between gap-2">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-blue-200">
                  <Timer className="w-4 h-4 text-yellow-300" />
                  <span>Waktu Tampil Arena</span>
                </div>
                <div
                  data-testid="jurus-arena-timer"
                  className={`font-mono text-[clamp(3.5rem,min(13vw,20dvh),9.5rem)] font-black tabular-nums tracking-tight leading-none py-2 ${
                    liveTimerMs <= 10000 && isRunning ? 'text-yellow-300' : 'text-white'
                  }`}
                >
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-xs sm:text-sm text-blue-200">
                  Hitung Mundur Arena (Standar 03:00 IPSI 2026)
                </div>
              </div>

              {/* Timer 2: Waktu Nyata Penampil (Elapsed Count-up + Overtime) */}
              <div className="rounded-2xl bg-black/65 border-2 border-yellow-400/70 p-4 sm:p-6 text-center flex flex-col justify-between gap-2">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-yellow-300">
                  <Timer className="w-4 h-4 text-yellow-300" />
                  <span>Waktu Nyata Penampil</span>
                </div>
                <div
                  data-testid="jurus-performer-timer"
                  className="font-mono text-[clamp(3.5rem,min(13vw,20dvh),9.5rem)] font-black tabular-nums tracking-tight leading-none py-2 text-yellow-300"
                >
                  {formatJurusElapsedMs(currentElapsedMs)}
                </div>
                <div className="text-xs sm:text-sm text-yellow-100">
                  Penampil Aktif:{' '}
                  <span className="font-bold">
                    {activePerformer === 'blue' ? `Sudut Biru (${activeMatch.blueName})` : `Sudut Merah (${activeMatch.redName})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Controls */}
            <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
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
    <div className="min-h-[100dvh] bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4">
        <div className="shrink-0">
          <TournamentIdentityBanner
            arena={arena}
            match={activeMatch}
            compact
            hideEventDetails
            onBack={() => onNavigate('landing')}
            showFullscreen
          />
        </div>

        {/* Central Digital Clock Display */}
        <section className="flex-1 min-h-0 rounded-3xl bg-[#0d051c]/90 border border-purple-700/60 px-4 py-4 sm:px-8 sm:py-6 lg:px-10 lg:py-8 flex flex-col items-center justify-between gap-4 sm:gap-6">
          <div className="shrink-0 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <span className="font-display text-lg sm:text-2xl lg:text-3xl font-bold text-yellow-300 uppercase tracking-wider">
              {activeMatch.status === 'break' ? 'Istirahat' : `Babak ${activeMatch.currentRound} / ${totalRounds}`}
            </span>
            <span aria-hidden="true" className="text-blue-400">&middot;</span>
            <span className="text-xs sm:text-sm lg:text-base font-medium text-blue-200">
              {STATUS_LABEL[activeMatch.status] || activeMatch.status}
            </span>
          </div>

          <div className="flex-1 min-h-0 w-full flex items-center justify-center">
            <div
              data-testid="timer-display"
              className={`font-mono text-[clamp(4rem,min(22vw,34dvh),18rem)] font-extrabold tabular-nums tracking-tight leading-none select-none ${
                liveTimerMs <= 10000 && isRunning
                  ? 'text-yellow-300'
                  : activeMatch.status === 'break'
                  ? 'text-blue-300'
                  : 'text-white'
              }`}
            >
              {formatMatchTime(liveTimerMs)}
            </div>
          </div>

          {/* Primary Play / Pause / Reset Controls */}
          <div className="shrink-0 w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            {isRunning ? (
              <button
                type="button"
                onClick={() => void pauseTimer()}
                className="min-h-[54px] sm:min-h-[64px] lg:min-h-[74px] px-5 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-display text-xl sm:text-2xl lg:text-3xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Pause className="w-6 h-6 lg:w-7 lg:h-7" />
                <span>Jeda</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void (isBreakPaused ? resumeBreakTimer() : startTimer())}
                className="min-h-[54px] sm:min-h-[64px] lg:min-h-[74px] px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-display text-xl sm:text-2xl lg:text-3xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6 lg:w-7 lg:h-7 text-yellow-300" />
                <span>{isBreakPaused ? 'Lanjut Jeda' : 'Mulai'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void resetTimer()}
              className="min-h-[54px] sm:min-h-[64px] lg:min-h-[74px] px-5 py-3 rounded-2xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 disabled:opacity-40 text-white font-display text-xl sm:text-2xl lg:text-3xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5 lg:w-6 lg:h-6 text-blue-300" />
              <span>Reset Babak</span>
            </button>

            <button
              type="button"
              onClick={() => playArenaGong()}
              className="min-h-[54px] sm:min-h-[64px] lg:min-h-[74px] px-5 py-3 rounded-2xl bg-black/70 border border-yellow-400/60 hover:bg-yellow-400 hover:text-black text-yellow-300 font-display text-xl sm:text-2xl lg:text-3xl font-bold flex items-center justify-center gap-2.5 cursor-pointer transition-colors"
            >
              <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" />
              <span>Bunyikan Gong</span>
            </button>
          </div>
        </section>

        {/* Round Switcher, Dropdown Pengaturan, Break Mode & Reset Timer */}
        <section className="shrink-0 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3 sm:p-4 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2.5 sm:gap-3">
          {/* Dropdown Pilihan Babak & Timer Babak */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
            <select
              aria-label="Pilihan Babak"
              data-testid="timer-total-rounds-select"
              value={totalRounds === 2 ? 2 : 3}
              disabled={isFinished}
              onChange={(e) =>
                void setMatchTotalRounds(activeMatch.id, Number(e.target.value) === 2 ? 2 : 3)
              }
              className="w-full sm:w-auto min-h-[44px] px-3 py-2 rounded-xl bg-black/70 border border-purple-500/50 text-xs sm:text-sm font-bold text-yellow-300 focus:outline-none focus:border-yellow-400 disabled:opacity-50 cursor-pointer"
            >
              <option value={2}>2 Babak</option>
              <option value={3}>3 Babak</option>
            </select>

            <select
              aria-label="Pilihan Timer"
              data-testid="timer-duration-select"
              value={activeMatch.roundDurationSec}
              disabled={isFinished}
              onChange={(e) =>
                void setMatchRoundDuration(activeMatch.id, Number(e.target.value))
              }
              className="w-full sm:w-auto min-h-[44px] px-3 py-2 rounded-xl bg-black/70 border border-purple-500/50 text-xs sm:text-sm font-mono font-bold text-yellow-300 focus:outline-none focus:border-yellow-400 disabled:opacity-50 cursor-pointer"
            >
              {!TIMER_DURATION_OPTIONS.some((opt) => opt.seconds === activeMatch.roundDurationSec) && (
                <option value={activeMatch.roundDurationSec}>
                  {formatDurationOptionLabel(activeMatch.roundDurationSec)}
                </option>
              )}
              {TIMER_DURATION_OPTIONS.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tombol Babak 1, 2, 3 */}
          <div className="flex items-center gap-2 w-full sm:w-auto lg:flex-1 lg:justify-center">
            {roundList.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isFinished}
                onClick={() => void setRound(r)}
                className={`flex-1 lg:max-w-[150px] min-h-[44px] px-4 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-colors ${
                  activeMatch.currentRound === r && activeMatch.status !== 'break'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-black/70 border border-blue-500/40 text-blue-200 hover:bg-blue-950 hover:text-white'
                }`}
              >
                Babak {r}
              </button>
            ))}
          </div>

          {/* Mulai Istirahat & Reset Timer */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto shrink-0 lg:justify-end">
            {isBreakActive && !showBreakBanner && (
              <button
                type="button"
                onClick={() => setDismissedBannerKey(null)}
                className="min-h-[44px] px-3.5 rounded-xl bg-yellow-400/90 hover:bg-yellow-300 text-black font-bold text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-colors"
              >
                Tampilkan Banner Jeda
              </button>
            )}
            <button
              type="button"
              disabled={isFinished}
              onClick={() => {
                setDismissedBannerKey(null);
                void startBreakTimer(60);
              }}
              className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl bg-blue-950/80 border border-blue-400/60 hover:bg-blue-900 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Coffee className="w-4 h-4 text-yellow-300 shrink-0" />
              <span>Mulai Istirahat (01:00)</span>
            </button>
            <button
              type="button"
              data-testid="timer-reset-button"
              disabled={isFinished}
              onClick={() => {
                setDismissedBannerKey(null);
                void resetTimer();
              }}
              className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl bg-black/70 border border-purple-500/50 hover:bg-purple-950 hover:border-yellow-400 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-blue-300 shrink-0" />
              <span>Reset Timer</span>
            </button>
          </div>
        </section>
      </main>

      {/* Banner Pop-Up Jeda Antar Babak (Sesuai Referensi Antar Babak) */}
      {showBreakBanner && breakBannerKey && (() => {
        const breakSec = isBreakActive ? Math.min(60, Math.max(0, Math.ceil(liveTimerMs / 1000))) : 60;
        const ringRadius = 24;
        const ringCircumference = 2 * Math.PI * ringRadius;
        const ringOffset = ringCircumference * (1 - breakSec / 60);
        const targetNextRound = hasNextRound ? nextRound : activeMatch.currentRound;
        const isDraw = activeMatch.blueScore === activeMatch.redScore;
        const recommendationText = isDraw
          ? 'Skor sudut SAMA KUAT/DRAW. Pilih Ya di panel sebelah kanan setelah dewan juri siap.'
          : activeMatch.blueScore > activeMatch.redScore
          ? `Sudut Biru UNGGUL SEMENTARA (${activeMatch.blueScore} - ${activeMatch.redScore}). Pilih Ya di panel sebelah kanan setelah dewan juri siap.`
          : `Sudut Merah UNGGUL SEMENTARA (${activeMatch.redScore} - ${activeMatch.blueScore}). Pilih Ya di panel sebelah kanan setelah dewan juri siap.`;
        const recentSummaryEvents = events.filter((e) => !e.undone && e.type !== 'judge_press').slice(0, 8);

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Jeda Antar Babak"
            data-testid="inter-round-break-banner"
            className="fixed inset-0 z-50 bg-[#04010c]/88 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          >
            <div className="max-w-5xl w-full rounded-3xl bg-gradient-to-br from-[#14072b] via-[#0b0419] to-[#080212] border border-purple-500/40 shadow-[0_0_70px_rgba(124,58,237,0.28)] p-5 sm:p-7 relative my-auto">
              {/* Close X */}
              <button
                type="button"
                aria-label="Tutup Jeda Antar Babak"
                onClick={() => setDismissedBannerKey(breakBannerKey)}
                className="absolute top-3.5 right-3.5 z-10 w-9 h-9 rounded-full bg-[#1a1030] hover:bg-purple-900 border border-purple-500/40 text-purple-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {showScoreSummary ? (
                /* Sub-panel: Intip Lembar Ringkasan Nilai */
                <div data-testid="break-score-summary-panel" className="space-y-5 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-purple-300">
                        Lembar Ringkasan Nilai Sementara &middot; {activeMatch.matchNumber}
                      </div>
                      <h2 className="font-display text-2xl sm:text-3xl font-black uppercase text-white">
                        Rekap Skor Babak {activeMatch.currentRound}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowScoreSummary(false)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-900/70 hover:bg-purple-800 border border-purple-400/50 text-white text-xs font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      &larr; Kembali ke Jeda Antar Babak
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sudut Biru Breakdown */}
                    <div className="rounded-2xl bg-gradient-to-br from-[#0e1b3d] to-[#091022] border border-blue-500/45 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-blue-500/30 pb-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Sudut Biru</div>
                          <div className="font-display text-lg font-extrabold text-white truncate uppercase">{activeMatch.blueName}</div>
                          <div className="text-xs text-blue-200/80 truncate">{activeMatch.blueContingent}</div>
                        </div>
                        <div className="font-mono text-4xl font-black text-sky-400 tabular-nums shrink-0">{activeMatch.blueScore}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Pukulan (+1)</div>
                          <div className="font-mono text-lg font-extrabold text-white">{activeMatch.bluePunches}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Tendangan (+2)</div>
                          <div className="font-mono text-lg font-extrabold text-white">{activeMatch.blueKicks}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Jatuhan (+3)</div>
                          <div className="font-mono text-lg font-extrabold text-emerald-300">{activeMatch.blueFalls}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Binaan</div>
                          <div className="font-mono text-lg font-extrabold text-orange-300">{activeMatch.blueBinaan}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Teguran</div>
                          <div className="font-mono text-lg font-extrabold text-yellow-300">{activeMatch.blueTeguran1 + activeMatch.blueTeguran2}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-blue-200/75 uppercase">Peringatan</div>
                          <div className="font-mono text-lg font-extrabold text-rose-400">{activeMatch.bluePeringatan}</div>
                        </div>
                      </div>
                    </div>

                    {/* Sudut Merah Breakdown */}
                    <div className="rounded-2xl bg-gradient-to-br from-[#35101b] to-[#1a0912] border border-red-500/45 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-red-500/30 pb-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Sudut Merah</div>
                          <div className="font-display text-lg font-extrabold text-white truncate uppercase">{activeMatch.redName}</div>
                          <div className="text-xs text-rose-200/80 truncate">{activeMatch.redContingent}</div>
                        </div>
                        <div className="font-mono text-4xl font-black text-rose-400 tabular-nums shrink-0">{activeMatch.redScore}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Pukulan (+1)</div>
                          <div className="font-mono text-lg font-extrabold text-white">{activeMatch.redPunches}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Tendangan (+2)</div>
                          <div className="font-mono text-lg font-extrabold text-white">{activeMatch.redKicks}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Jatuhan (+3)</div>
                          <div className="font-mono text-lg font-extrabold text-emerald-300">{activeMatch.redFalls}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Binaan</div>
                          <div className="font-mono text-lg font-extrabold text-orange-300">{activeMatch.redBinaan}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Teguran</div>
                          <div className="font-mono text-lg font-extrabold text-yellow-300">{activeMatch.redTeguran1 + activeMatch.redTeguran2}</div>
                        </div>
                        <div className="rounded-xl bg-black/35 p-2">
                          <div className="text-[10px] text-rose-200/75 uppercase">Peringatan</div>
                          <div className="font-mono text-lg font-extrabold text-rose-400">{activeMatch.redPeringatan}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Riwayat Nilai Terbaru */}
                  <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-4 space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-300">
                      Riwayat Kejadian Sah Terbaru
                    </div>
                    {recentSummaryEvents.length === 0 ? (
                      <div className="text-xs text-purple-200/70">Belum ada catatan poin atau hukuman sah pada pertandingan ini.</div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {recentSummaryEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className="rounded-lg bg-black/40 border border-purple-800/40 px-3 py-1.5 text-xs flex items-center justify-between gap-2"
                          >
                            <span className="text-white/90 truncate">{ev.description}</span>
                            <span className="font-mono text-[11px] text-purple-300 shrink-0">
                              B{ev.round} &middot; {ev.matchTimeFormatted}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
                  {/* LEFT COLUMN */}
                  <div className="lg:col-span-7 flex flex-col justify-between gap-3.5">
                    {/* Clock Icon + BABAK X SELESAI */}
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-full bg-purple-900/45 border border-purple-500/45 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-purple-300" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-wide text-white">
                          BABAK {activeMatch.currentRound} SELESAI
                        </h2>
                        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-300/75">
                          {isInterRoundEnded ? 'WAKTU MATCH HABIS' : 'JEDA ANTAR BABAK'}
                        </div>
                      </div>
                    </div>

                    {/* Card 1: TIMER JEDA ANTAR BABAK (1 MENIT) */}
                    <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-3.5 sm:p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3.5">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Circular SVG Ring */}
                        <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
                            <circle
                              cx="30"
                              cy="30"
                              r={ringRadius}
                              fill="none"
                              stroke="rgba(168, 85, 247, 0.22)"
                              strokeWidth="4.5"
                            />
                            <circle
                              cx="30"
                              cy="30"
                              r={ringRadius}
                              fill="none"
                              stroke={breakSec === 0 ? '#34d399' : '#f59e0b'}
                              strokeWidth="4.5"
                              strokeLinecap="round"
                              strokeDasharray={ringCircumference}
                              strokeDashoffset={ringOffset}
                              className="transition-all duration-200"
                            />
                          </svg>
                          <span
                            data-testid="break-banner-countdown"
                            className="absolute font-mono text-xs font-black tabular-nums text-amber-300"
                          >
                            {breakSec}s
                          </span>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                            <Flame className="w-3.5 h-3.5 shrink-0" />
                            <span>TIMER JEDA ANTAR BABAK (1 MENIT)</span>
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-white leading-snug">
                            {isBreakRunning
                              ? 'Hitung mundur otomatis sedang berjalan...'
                              : isBreakPaused
                              ? 'Hitung mundur jeda sedang dijeda...'
                              : breakSec === 0 && isBreakActive
                              ? 'Waktu jeda selesai — buzzer akhir jeda berbunyi.'
                              : 'Siap memulai hitung mundur jeda 60 detik...'}
                          </div>
                          <div className="text-[11px] text-purple-200/70 leading-snug">
                            Mundur dari 60 dtk. Mengeluarkan sinyal buzzer di akhir jeda.
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        {isBreakRunning ? (
                          <button
                            type="button"
                            data-testid="break-pause-btn"
                            onClick={() => void pauseTimer()}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
                          >
                            PAUSE
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-testid="break-resume-btn"
                            onClick={() => void resumeBreakTimer()}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
                          >
                            RESUME
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="break-reset-btn"
                          onClick={() => void resetBreakTimer()}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#231545] hover:bg-[#311f5e] border border-purple-500/40 text-white font-extrabold text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
                        >
                          RESET
                        </button>
                      </div>
                    </div>

                    {/* Card 2: REKOMENDASI TRANSISI */}
                    <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-3.5 sm:p-4 space-y-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-fuchsia-400">
                        REKOMENDASI TRANSISI
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-white/95 leading-relaxed">
                        {recommendationText}
                      </p>
                    </div>

                    {/* Card 3: PARTAI SELANJUTNYA (UPCOMING) */}
                    <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-3.5 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-400">
                          <FastForward className="w-3.5 h-3.5 shrink-0" />
                          <span>PARTAI SELANJUTNYA (UPCOMING)</span>
                        </div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                          {nextMatch ? nextMatch.matchNumber.toUpperCase() : 'TIDAK ADA PARTAI'}
                        </span>
                      </div>

                      {nextMatch && nextMatchMeta ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="rounded-xl bg-gradient-to-br from-[#0e1e42] to-[#0a1226] border border-blue-500/35 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                                SUDUT BIRU
                              </div>
                              <div className="text-xs sm:text-sm font-extrabold uppercase text-white truncate mt-0.5">
                                {nextMatch.blueName}
                              </div>
                              <div className="text-[10px] font-semibold uppercase text-blue-200/70 truncate">
                                {nextMatch.blueContingent}
                              </div>
                            </div>

                            <div className="rounded-xl bg-gradient-to-br from-[#341120] to-[#190912] border border-red-500/35 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                                SUDUT MERAH
                              </div>
                              <div className="text-xs sm:text-sm font-extrabold uppercase text-white truncate mt-0.5">
                                {nextMatch.redName}
                              </div>
                              <div className="text-[10px] font-semibold uppercase text-rose-200/70 truncate">
                                {nextMatch.redContingent}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl bg-[#0b0618]/85 border border-purple-800/40 px-3 py-2 grid grid-cols-3 text-center gap-2">
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-purple-300/70">
                                KELAS:
                              </div>
                              <div className="text-[11px] font-extrabold uppercase text-white truncate">
                                {nextMatchMeta.kelas}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-purple-300/70">
                                GENDER:
                              </div>
                              <div className="text-[11px] font-extrabold uppercase text-white truncate">
                                {nextMatchMeta.gender}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-purple-300/70">
                                TAHAPAN:
                              </div>
                              <div className="text-[11px] font-extrabold uppercase text-white truncate">
                                {nextMatch.stage}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl bg-[#0b0618]/75 border border-purple-800/35 p-3 text-center text-xs text-purple-200/70">
                          Belum ada partai pertandingan selanjutnya yang dijadwalkan.
                        </div>
                      )}
                    </div>

                    {/* Footer Link: INTIP LEMBAR RINGKASAN NILAI -> */}
                    <div className="pt-0.5">
                      <button
                        type="button"
                        data-testid="peek-score-summary-btn"
                        onClick={() => setShowScoreSummary(true)}
                        className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-purple-200/80 hover:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span>INTIP LEMBAR RINGKASAN NILAI</span>
                        <span aria-hidden="true">&rarr;</span>
                      </button>
                    </div>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="lg:col-span-5 flex flex-col justify-between gap-3.5">
                    {/* Top 2 Score Summary Cards */}
                    <div className="grid grid-cols-2 gap-3 pr-10 lg:pr-9">
                      <div className="rounded-xl bg-gradient-to-br from-[#0e1b3d] to-[#091022] border border-blue-500/45 px-3.5 py-3 flex flex-col justify-between gap-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                          SUDUT BIRU
                        </div>
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span className="text-xs sm:text-sm font-extrabold uppercase text-white truncate">
                            {activeMatch.blueName}
                          </span>
                          <span className="font-mono text-2xl sm:text-3xl font-black tabular-nums text-sky-400 shrink-0">
                            &ndash; {activeMatch.blueScore}
                          </span>
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-blue-200/65">
                          TOTAL SKOR
                        </div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-br from-[#35101b] to-[#1a0912] border border-red-500/45 px-3.5 py-3 flex flex-col justify-between gap-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                          SUDUT MERAH
                        </div>
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span className="text-xs sm:text-sm font-extrabold uppercase text-white truncate">
                            {activeMatch.redName}
                          </span>
                          <span className="font-mono text-2xl sm:text-3xl font-black tabular-nums text-rose-400 shrink-0">
                            &ndash; {activeMatch.redScore}
                          </span>
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-rose-200/65">
                          TOTAL SKOR
                        </div>
                      </div>
                    </div>

                    {/* Card: MONITOR JURI SINKRON / KUNCI PANEL JURI */}
                    <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-4 space-y-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                        {activeMatch.juriLocked ? (
                          <Lock className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>
                          {activeMatch.juriLocked ? 'PANEL JURI TERKUNCI' : 'MONITOR JURI SINKRON'}
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid="toggle-juri-lock-btn"
                        onClick={() => void toggleJuriLock()}
                        className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          activeMatch.juriLocked
                            ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                            : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-[0_0_24px_rgba(236,72,153,0.35)]'
                        }`}
                      >
                        {activeMatch.juriLocked ? (
                          <>
                            <Unlock className="w-4 h-4 shrink-0" />
                            <span>BUKA KUNCI PANEL JURI</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4 shrink-0" />
                            <span>KUNCI PANEL JURI</span>
                          </>
                        )}
                      </button>

                      <p className="text-[10px] leading-relaxed uppercase tracking-wide text-purple-200/70">
                        {activeMatch.juriLocked
                          ? '*PANEL JURI SEDANG TERKUNCI. JURI TIDAK DAPAT MENGINPUT NILAI HINGGA KUNCI DIBUKA ATAU BABAK DILANJUTKAN.'
                          : '*JIKA BELUM DITEKAN, LAYAR PANEL JURI TIDAK AKAN TERKUNCI DAN JURI MASIH BISA MEMANTAU.'}
                      </p>
                    </div>

                    {/* Card: KONFIRMASI TRANSISI BABAK */}
                    <div className="rounded-2xl bg-[#160a2e]/90 border border-purple-500/30 p-4 sm:p-5 space-y-2.5 text-center">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-amber-400">
                        KONFIRMASI TRANSISI BABAK
                      </div>
                      <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
                        Apakah Anda yakin ingin melanjutkan pertandingan ke{' '}
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm mx-0.5">
                          BABAK {targetNextRound}
                        </span>{' '}
                        ?
                      </p>
                      <p className="text-[11px] text-purple-200/70 leading-relaxed">
                        Pilihan ini menghindari kesalahan penekanan babak oleh sekretaris. Seluruh panel juri dan dewan akan disinkronkan otomatis.
                      </p>
                    </div>

                    {/* Bottom TIDAK / YA Buttons */}
                    <div className="grid grid-cols-2 gap-3 pt-0.5">
                      <button
                        type="button"
                        data-testid="break-cancel-btn"
                        onClick={() => setDismissedBannerKey(breakBannerKey)}
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#18102b] hover:bg-[#23173d] border border-purple-700/40 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        TIDAK
                      </button>
                      <button
                        type="button"
                        data-testid="break-confirm-next-round-btn"
                        onClick={() => {
                          setDismissedBannerKey(null);
                          void setRound(targetNextRound);
                        }}
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer shadow-[0_0_25px_rgba(52,211,153,0.35)] transition-colors"
                      >
                        YA
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
