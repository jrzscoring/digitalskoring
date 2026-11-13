import { Coffee, Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';
import { formatMatchTime } from '../utils/ipsiRules';
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
  const { arena, activeMatch, liveTimerMs, startTimer, pauseTimer, resetTimer, setRound, startBreakTimer } = useArena();

  const isRunning = activeMatch.status === 'active' || activeMatch.status === 'break';
  const isFinished = activeMatch.status === 'finished';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <ModuleHeader currentView="timer" onNavigate={onNavigate} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-center gap-6">
        <TournamentIdentityBanner arena={arena} compact />

        {/* Match Identity */}
        <section className="text-center space-y-1">
          <div className="text-xs sm:text-sm text-slate-400">
            {activeMatch.matchNumber} &middot; {activeMatch.stage} &middot; {activeMatch.weightClass}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            <span className="text-blue-400">{activeMatch.blueName}</span>
            <span className="text-slate-500 mx-3">vs</span>
            <span className="text-red-400">{activeMatch.redName}</span>
          </h1>
        </section>

        {/* Central Digital Clock Display */}
        <section className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-10 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl sm:text-2xl font-bold text-amber-400 uppercase tracking-wider">
              {activeMatch.status === 'break' ? 'Istirahat' : `Babak ${activeMatch.currentRound} / 3`}
            </span>
            <span aria-hidden="true" className="text-slate-600">&middot;</span>
            <span className="text-sm font-medium text-slate-300">
              {STATUS_LABEL[activeMatch.status] || activeMatch.status}
            </span>
          </div>

          <div
            data-testid="timer-display"
            className={`font-mono text-7xl sm:text-9xl font-extrabold tabular-nums tracking-tight leading-none ${
              liveTimerMs <= 10000 && isRunning
                ? 'text-red-400'
                : activeMatch.status === 'break'
                ? 'text-sky-400'
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
                className="min-h-[60px] px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Pause className="w-6 h-6" />
                <span>Jeda</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void startTimer()}
                className="min-h-[60px] px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6" />
                <span>Mulai</span>
              </button>
            )}

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void resetTimer()}
              className="min-h-[60px] px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Reset Babak</span>
            </button>

            <button
              type="button"
              onClick={() => playArenaGong()}
              className="min-h-[60px] px-6 py-3 rounded-2xl bg-slate-950 border border-slate-700 hover:border-amber-400 text-amber-300 font-display text-2xl font-bold flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Volume2 className="w-5 h-5" />
              <span>Bunyikan Gong</span>
            </button>
          </div>
        </section>

        {/* Round Switcher & Break Mode */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                disabled={isFinished}
                onClick={() => void setRound(r)}
                className={`flex-1 sm:flex-none min-h-[46px] px-5 rounded-xl font-bold text-sm cursor-pointer ${
                  activeMatch.currentRound === r && activeMatch.status !== 'break'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800'
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
            className="w-full sm:w-auto min-h-[46px] px-5 rounded-xl bg-sky-950/70 border border-sky-700/60 hover:bg-sky-900/70 disabled:opacity-40 text-sky-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Coffee className="w-4 h-4" />
            <span>Mulai Istirahat (01:00)</span>
          </button>
        </section>
      </main>
    </div>
  );
}
