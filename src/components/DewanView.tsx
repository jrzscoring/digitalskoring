import { Award, FileDown, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, WinMethod } from '../types/silat';
import { determineOfficialWinner, formatMatchTime } from '../utils/ipsiRules';
import { exportMatchPdf } from '../utils/pdfExport';
import { ModuleHeader } from './ModuleHeader';

interface DewanViewProps {
  onNavigate: (view: AppView) => void;
}

const WIN_METHODS: Exclude<WinMethod, ''>[] = [
  'Menang Angka',
  'Menang Teknik (TKO)',
  'Menang Mutlak',
  'Menang Diskualifikasi',
  'Menang Undur Diri',
  'Menang WMP',
];

export function DewanView({ onNavigate }: DewanViewProps) {
  const {
    arena,
    activeMatch,
    events,
    liveTimerMs,
    triggerDewanAction,
    undoLastEvent,
    declareWinner,
    autoAdjudicateWinner,
    resetMatch,
    setRound,
  } = useArena();

  const [manualMethod, setManualMethod] = useState<Exclude<WinMethod, ''>>('Menang Teknik (TKO)');

  const isFinished = activeMatch.status === 'finished';
  const suggested = determineOfficialWinner(activeMatch);

  const renderCornerControls = (corner: Corner) => {
    const isBlue = corner === 'blue';
    const name = isBlue ? activeMatch.blueName : activeMatch.redName;
    const contingent = isBlue ? activeMatch.blueContingent : activeMatch.redContingent;
    const score = isBlue ? activeMatch.blueScore : activeMatch.redScore;
    const punches = isBlue ? activeMatch.bluePunches : activeMatch.redPunches;
    const kicks = isBlue ? activeMatch.blueKicks : activeMatch.redKicks;
    const falls = isBlue ? activeMatch.blueFalls : activeMatch.redFalls;
    const binaan = isBlue ? activeMatch.blueBinaan : activeMatch.redBinaan;
    const teguran1 = isBlue ? activeMatch.blueTeguran1 : activeMatch.redTeguran1;
    const teguran2 = isBlue ? activeMatch.blueTeguran2 : activeMatch.redTeguran2;
    const peringatan = isBlue ? activeMatch.bluePeringatan : activeMatch.redPeringatan;

    const accentBorder = isBlue ? 'border-blue-700/70' : 'border-red-700/70';
    const headerBg = isBlue ? 'bg-blue-700' : 'bg-red-700';
    const scoreColor = isBlue ? 'text-blue-400' : 'text-red-400';

    return (
      <section className={`rounded-2xl bg-slate-900 border ${accentBorder} overflow-hidden flex flex-col`}>
        <div className={`${headerBg} px-5 py-3 flex items-center justify-between gap-2`}>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-white/80">
              {isBlue ? 'Sudut Biru' : 'Sudut Merah'}
            </div>
            <h2 className="font-display text-2xl font-bold text-white truncate">{name}</h2>
            <div className="text-xs text-white/90 truncate">{contingent}</div>
          </div>
          <div className={`font-mono text-5xl font-extrabold tabular-nums bg-slate-950/90 ${scoreColor} px-4 py-2 rounded-xl`}>
            {score}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Technical Tally Summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-950/70 rounded-xl p-2.5 border border-slate-800">
            <div>
              <div className="text-slate-400">Pukulan (+1)</div>
              <div className="font-mono text-base font-bold text-white tabular-nums">{punches}</div>
            </div>
            <div>
              <div className="text-slate-400">Tendangan (+2)</div>
              <div className="font-mono text-base font-bold text-white tabular-nums">{kicks}</div>
            </div>
            <div>
              <div className="text-slate-400">Jatuhan (+3)</div>
              <div className="font-mono text-base font-bold text-amber-300 tabular-nums">{falls}</div>
            </div>
          </div>

          {/* Primary Referee Action: Jatuhan (+3) */}
          <button
            type="button"
            disabled={isFinished}
            onClick={() => void triggerDewanAction('fall', corner)}
            className="w-full min-h-[54px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-display text-xl font-bold tracking-wide transition-colors cursor-pointer"
          >
            Jatuhan Sah (+3) · {isBlue ? 'Biru' : 'Merah'}
          </button>

          {/* Penalties Grid (Binaan, Teguran, Peringatan) */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-400">
              Pelanggaran Wasit ({isBlue ? 'Biru' : 'Merah'})
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('binaan', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-100 flex flex-col items-center justify-center cursor-pointer"
              >
                <span>Binaan (0)</span>
                <span className="font-mono text-[11px] text-slate-400">Total: {binaan}</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('teguran1', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-700/60 disabled:opacity-40 text-xs font-bold text-amber-200 flex flex-col items-center justify-center cursor-pointer"
              >
                <span>Teguran I (-1)</span>
                <span className="font-mono text-[11px] text-amber-300/80">Total: {teguran1}</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('teguran2', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-amber-900/70 hover:bg-amber-800/80 border border-amber-600/70 disabled:opacity-40 text-xs font-bold text-amber-100 flex flex-col items-center justify-center cursor-pointer"
              >
                <span>Teguran II (-2)</span>
                <span className="font-mono text-[11px] text-amber-200/80">Total: {teguran2}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isFinished || peringatan >= 1}
                onClick={() => void triggerDewanAction('peringatan1', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-orange-950/70 hover:bg-orange-900/80 border border-orange-700/60 disabled:opacity-40 text-xs font-bold text-orange-200 whitespace-nowrap cursor-pointer"
              >
                Peringatan I (-5)
              </button>

              <button
                type="button"
                disabled={isFinished || peringatan >= 2}
                onClick={() => void triggerDewanAction('peringatan2', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-red-950/80 hover:bg-red-900/80 border border-red-700/70 disabled:opacity-40 text-xs font-bold text-red-200 whitespace-nowrap cursor-pointer"
              >
                Peringatan II (-10)
              </button>

              <button
                type="button"
                disabled={isFinished || peringatan >= 3}
                onClick={() => void triggerDewanAction('peringatan3', corner)}
                className="min-h-[46px] px-2 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-40 text-xs font-bold text-white flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Peringatan III</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <ModuleHeader currentView="dewan" onNavigate={onNavigate} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top Match Status & Round Strip */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <div className="text-xs text-slate-400">
              {activeMatch.matchNumber} &middot; {activeMatch.stage} &middot; {activeMatch.weightClass}
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              Dewan Pertandingan &amp; Input Nilai Wasit
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[1, 2, 3].map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={isFinished}
                  onClick={() => void setRound(r)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                    activeMatch.currentRound === r
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Babak {r}
                </button>
              ))}
            </div>
            <div className="font-mono text-3xl font-extrabold tabular-nums text-amber-300 bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800">
              {formatMatchTime(liveTimerMs)}
            </div>
          </div>
        </section>

        {/* Winner Banner if Finished */}
        {isFinished && (
          <section className="rounded-2xl bg-amber-500/15 border border-amber-500/60 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Award className="w-7 h-7 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-bold uppercase text-amber-300">Pertandingan Selesai</div>
                <div className="font-display text-2xl font-bold text-white">
                  Pemenang:{' '}
                  {activeMatch.winner === 'blue'
                    ? `Sudut Biru — ${activeMatch.blueName}`
                    : activeMatch.winner === 'red'
                    ? `Sudut Merah — ${activeMatch.redName}`
                    : 'Seri'}
                  {' · '}
                  {activeMatch.winMethod}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportMatchPdf(arena, activeMatch, events)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>Ekspor PDF Resmi</span>
              </button>
              <button
                type="button"
                onClick={() => void resetMatch(activeMatch.id)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Partai</span>
              </button>
            </div>
          </section>
        )}

        {/* Dual Corner Control Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {renderCornerControls('blue')}
          {renderCornerControls('red')}
        </div>

        {/* Bottom Adjudication & Event History */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-white">Pengesahan Pemenang (IPSI 2026)</h2>
              <button
                type="button"
                disabled={isFinished || events.filter((e) => !e.undone).length === 0}
                onClick={() => void undoLastEvent()}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo Terakhir</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Rekomendasi Sistem IPSI 2026:</div>
              <div className="text-sm font-bold text-amber-300">
                {suggested.winner === 'blue'
                  ? `Sudut Biru (${activeMatch.blueName})`
                  : suggested.winner === 'red'
                  ? `Sudut Merah (${activeMatch.redName})`
                  : 'Seri'}{' '}
                &middot; {suggested.winMethod}
              </div>
              <div className="text-slate-400">{suggested.reason}</div>
            </div>

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void autoAdjudicateWinner()}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Award className="w-4 h-4" />
              <span>Sahkan Pemenang Otomatis</span>
            </button>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label htmlFor="win-method" className="block text-xs font-medium text-slate-400">
                Atau Sahkan Kemenangan Khusus (TKO / Mutlak / Undur Diri / WMP)
              </label>
              <select
                id="win-method"
                value={manualMethod}
                onChange={(e) => setManualMethod(e.target.value as Exclude<WinMethod, ''>)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              >
                {WIN_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isFinished}
                  onClick={() => void declareWinner('blue', manualMethod)}
                  className="min-h-[40px] rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-xs font-bold text-white cursor-pointer"
                >
                  Biru Menang
                </button>
                <button
                  type="button"
                  disabled={isFinished}
                  onClick={() => void declareWinner('red', manualMethod)}
                  className="min-h-[40px] rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-40 text-xs font-bold text-white cursor-pointer"
                >
                  Merah Menang
                </button>
              </div>
            </div>
          </section>

          <section className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Log Penilaian &amp; Pelanggaran Real-Time</h2>
            {events.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Belum ada catatan nilai atau pelanggaran pada partai ini.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-800 pr-1">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className={`py-2.5 flex items-center justify-between gap-3 text-xs ${
                      ev.undone ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-slate-400 shrink-0">
                        B{ev.round} {ev.matchTimeFormatted}
                      </span>
                      <span
                        className={`font-semibold truncate ${
                          ev.corner === 'blue'
                            ? 'text-blue-300'
                            : ev.corner === 'red'
                            ? 'text-red-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {ev.description}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-200 shrink-0 tabular-nums">
                      {ev.pointsDelta > 0 ? `+${ev.pointsDelta}` : ev.pointsDelta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
