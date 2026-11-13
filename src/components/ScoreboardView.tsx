import { ArrowLeft, Award, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, JudgeId } from '../types/silat';
import { CONSENSUS_WINDOW_MS, formatMatchTime } from '../utils/ipsiRules';

interface ScoreboardViewProps {
  onNavigate: (view: AppView) => void;
}

export function ScoreboardView({ onNavigate }: ScoreboardViewProps) {
  const { arena, activeMatch, liveTimerMs } = useArena();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore fullscreen denial in headless/sandbox environments
    }
  };

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

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none relative">
      {/* Subtle Projector Controls (Top-Right) */}
      <div className="absolute top-3 right-3 z-40 flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          aria-label="Kembali ke Menu Utama"
          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Menu</span>
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label="Layar Penuh Proyektor"
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Top Tournament & Arena Banner */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-col items-center justify-center text-center gap-1">
        <div className="font-display text-lg sm:text-2xl font-bold tracking-wider uppercase text-amber-400">
          {arena.tournamentName}
        </div>
        <div className="text-xs sm:text-sm text-slate-300 font-medium flex flex-wrap items-center justify-center gap-2">
          <span>{arena.name}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="font-bold text-white">{activeMatch.matchNumber}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{activeMatch.stage}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{activeMatch.weightClass}</span>
        </div>
      </header>

      {/* Main Arena Split-Screen Scoreboard */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-3 sm:gap-4 p-3 sm:p-6">
        {/* Sudut Biru */}
        <section className="lg:col-span-5 rounded-3xl bg-gradient-to-b from-blue-800 to-blue-950 border-2 border-blue-500/60 p-5 sm:p-7 flex flex-col justify-between shadow-2xl">
          <div className="space-y-1">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-blue-200">
              Sudut Biru
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
              {activeMatch.blueName}
            </h2>
            <div className="text-sm sm:text-lg font-medium text-blue-100/90 truncate">
              {activeMatch.blueContingent}
            </div>
          </div>

          <div className="my-4 sm:my-6 flex items-center justify-center">
            <div
              data-testid="scoreboard-blue-score"
              className="font-mono text-8xl sm:text-[10rem] leading-none font-extrabold tabular-nums text-white drop-shadow"
            >
              {activeMatch.blueScore}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center bg-slate-950/55 rounded-2xl p-3 border border-blue-400/20">
            <div>
              <div className="text-[11px] text-blue-200/80">Jatuhan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-300">
                {activeMatch.blueFalls}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-blue-200/80">Binaan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-white">
                {activeMatch.blueBinaan}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-blue-200/80">Teguran</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-200">
                {activeMatch.blueTeguran1 + activeMatch.blueTeguran2}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-blue-200/80">Peringatan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-red-300">
                {activeMatch.bluePeringatan}
              </div>
            </div>
          </div>
        </section>

        {/* Center Clock, Round & Strike Totals */}
        <section className="lg:col-span-2 rounded-3xl bg-slate-900 border border-slate-800 p-4 flex flex-col items-center justify-between gap-4">
          <div className="text-center space-y-1">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Babak</div>
            <div className="font-display text-4xl sm:text-5xl font-extrabold text-amber-400 tabular-nums">
              {activeMatch.status === 'break' ? 'ISTIRAHAT' : activeMatch.currentRound}
            </div>
          </div>

          <div className="text-center">
            <div
              data-testid="scoreboard-timer"
              className={`font-mono text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight ${
                liveTimerMs <= 10000 && activeMatch.status === 'active'
                  ? 'text-red-400'
                  : 'text-white'
              }`}
            >
              {formatMatchTime(liveTimerMs)}
            </div>
            <div className="text-xs uppercase tracking-widest text-slate-400 mt-1">
              {activeMatch.status === 'waiting'
                ? 'SIAP'
                : activeMatch.status === 'active'
                ? 'BERJALAN'
                : activeMatch.status === 'paused'
                ? 'DIJEDA'
                : activeMatch.status === 'break'
                ? 'ISTIRAHAT'
                : 'SELESAI'}
            </div>
          </div>

          <div className="w-full space-y-2 text-xs font-mono tabular-nums border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-blue-400 font-bold">{activeMatch.bluePunches}</span>
              <span className="text-slate-400 font-sans">Pukulan (+1)</span>
              <span className="text-red-400 font-bold">{activeMatch.redPunches}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-blue-400 font-bold">{activeMatch.blueKicks}</span>
              <span className="text-slate-400 font-sans">Tendangan (+2)</span>
              <span className="text-red-400 font-bold">{activeMatch.redKicks}</span>
            </div>
          </div>
        </section>

        {/* Sudut Merah */}
        <section className="lg:col-span-5 rounded-3xl bg-gradient-to-b from-red-800 to-red-950 border-2 border-red-500/60 p-5 sm:p-7 flex flex-col justify-between shadow-2xl">
          <div className="space-y-1 text-right">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-red-200">
              Sudut Merah
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white truncate">
              {activeMatch.redName}
            </h2>
            <div className="text-sm sm:text-lg font-medium text-red-100/90 truncate">
              {activeMatch.redContingent}
            </div>
          </div>

          <div className="my-4 sm:my-6 flex items-center justify-center">
            <div
              data-testid="scoreboard-red-score"
              className="font-mono text-8xl sm:text-[10rem] leading-none font-extrabold tabular-nums text-white drop-shadow"
            >
              {activeMatch.redScore}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center bg-slate-950/55 rounded-2xl p-3 border border-red-400/20">
            <div>
              <div className="text-[11px] text-red-200/80">Jatuhan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-300">
                {activeMatch.redFalls}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-red-200/80">Binaan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-white">
                {activeMatch.redBinaan}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-red-200/80">Teguran</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-200">
                {activeMatch.redTeguran1 + activeMatch.redTeguran2}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-red-200/80">Peringatan</div>
              <div className="font-mono text-xl font-bold tabular-nums text-red-300">
                {activeMatch.redPeringatan}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Judge Consensus Indicator Lamps */}
      <footer className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-center gap-4 sm:gap-8">
        {judgeLights.map((j) => (
          <div
            key={j.jid}
            className={`px-4 py-1.5 rounded-xl border text-xs sm:text-sm font-mono font-bold flex items-center gap-2 transition-colors ${
              !j.active
                ? 'bg-slate-950 border-slate-800 text-slate-500'
                : j.corner === 'blue'
                ? 'bg-blue-700 border-blue-400 text-white'
                : 'bg-red-700 border-red-400 text-white'
            }`}
          >
            <span>Juri {j.jid}</span>
            {j.active && <span>+{j.points}</span>}
            {j.confirmed && <span className="text-amber-300">SAH</span>}
          </div>
        ))}
      </footer>

      {/* Winner Celebration Overlay when Match Finished */}
      {activeMatch.status === 'finished' && activeMatch.winner && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6">
          <div
            className={`max-w-2xl w-full rounded-3xl border-2 p-8 sm:p-10 text-center space-y-5 shadow-2xl ${
              activeMatch.winner === 'blue'
                ? 'bg-blue-950/95 border-blue-400'
                : activeMatch.winner === 'red'
                ? 'bg-red-950/95 border-red-400'
                : 'bg-slate-900 border-amber-400'
            }`}
          >
            <Award className="w-16 h-16 text-amber-400 mx-auto" />
            <div className="text-sm font-bold uppercase tracking-widest text-amber-300">
              Pemenang Resmi · {activeMatch.matchNumber}
            </div>
            <h2 className="font-display text-4xl sm:text-6xl font-extrabold text-white">
              {activeMatch.winner === 'blue'
                ? activeMatch.blueName
                : activeMatch.winner === 'red'
                ? activeMatch.redName
                : 'Pertandingan Seri'}
            </h2>
            <p className="text-lg text-slate-200">
              {activeMatch.winner === 'blue'
                ? `Sudut Biru · ${activeMatch.blueContingent}`
                : activeMatch.winner === 'red'
                ? `Sudut Merah · ${activeMatch.redContingent}`
                : 'Skor Seimbang'}
            </p>
            <div className="font-mono text-3xl font-extrabold text-amber-300 tabular-nums">
              {activeMatch.blueScore} &ndash; {activeMatch.redScore}
            </div>
            <div className="text-base font-semibold text-white/90">{activeMatch.winMethod}</div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('sekretaris')}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
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
