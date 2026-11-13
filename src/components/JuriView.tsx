import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, JudgeId } from '../types/silat';
import { CONSENSUS_WINDOW_MS, formatMatchTime } from '../utils/ipsiRules';
import { ModuleHeader } from './ModuleHeader';

interface JuriViewProps {
  onNavigate: (view: AppView) => void;
}

export function JuriView({ onNavigate }: JuriViewProps) {
  const { activeMatch, liveTimerMs, sendJudgeVote, clearJudgeVote } = useArena();
  const [judgeId, setJudgeId] = useState<JudgeId>(() => {
    try {
      const saved = sessionStorage.getItem('silat_selected_judge');
      if (saved === '1' || saved === '2' || saved === '3') return Number(saved) as JudgeId;
    } catch {
      // ignore
    }
    return 1;
  });

  const [feedback, setFeedback] = useState<{ text: string; tone: 'pending' | 'awarded' } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('silat_selected_judge', String(judgeId));
    } catch {
      // ignore
    }
  }, [judgeId]);

  const handleVote = async (corner: Corner, points: 1 | 2) => {
    if (activeMatch.status === 'finished') return;
    const label = points === 1 ? 'Pukulan (+1)' : 'Tendangan (+2)';
    const cornerText = corner === 'blue' ? 'Biru' : 'Merah';
    const result = await sendJudgeVote(judgeId, corner, points);

    if (result.awarded) {
      setFeedback({ text: `KONSENSUS SAH: ${label} untuk Sudut ${cornerText}`, tone: 'awarded' });
    } else {
      setFeedback({ text: `Terkirim (${label} ${cornerText}) — menunggu konsensus juri lain`, tone: 'pending' });
    }
    window.setTimeout(() => {
      setFeedback(null);
    }, CONSENSUS_WINDOW_MS);
  };

  const myVote =
    judgeId === 1
      ? activeMatch.judge1Vote
      : judgeId === 2
      ? activeMatch.judge2Vote
      : activeMatch.judge3Vote;

  const now = Date.now();
  const renderVoteBadge = (jid: JudgeId) => {
    const v = jid === 1 ? activeMatch.judge1Vote : jid === 2 ? activeMatch.judge2Vote : activeMatch.judge3Vote;
    const isFresh = v && v.corner !== 'none' && now - v.timestampMs <= CONSENSUS_WINDOW_MS;
    const colorClass = !isFresh
      ? 'bg-slate-900 border-slate-800 text-slate-500'
      : v.corner === 'blue'
      ? 'bg-blue-700 border-blue-400 text-white'
      : 'bg-red-700 border-red-400 text-white';

    return (
      <div
        key={jid}
        className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 ${colorClass}`}
      >
        <span>J{jid}</span>
        {isFresh && <span>+{v.points}</span>}
      </div>
    );
  };

  const isFinished = activeMatch.status === 'finished';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <ModuleHeader currentView="juri" onNavigate={onNavigate} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4 justify-between">
        {/* Top Judge Identity & Match Clock Strip */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            {([1, 2, 3] as JudgeId[]).map((jid) => (
              <button
                key={jid}
                type="button"
                onClick={() => setJudgeId(jid)}
                className={`flex-1 sm:flex-none min-h-[40px] px-4 rounded-lg text-sm font-bold cursor-pointer transition-colors ${
                  judgeId === jid
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Juri {jid}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-amber-400 uppercase">
              Babak {activeMatch.currentRound}
            </span>
            <span className="font-mono text-2xl font-extrabold tabular-nums text-white">
              {formatMatchTime(liveTimerMs)}
            </span>
            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as JudgeId[]).map(renderVoteBadge)}
            </div>
          </div>
        </section>

        {/* Live Consensus Feedback Strip */}
        <div className="min-h-[44px] flex items-center justify-center">
          {feedback ? (
            <div
              role="status"
              className={`w-full px-4 py-2.5 rounded-xl border text-center text-sm font-bold flex items-center justify-center gap-2 ${
                feedback.tone === 'awarded'
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                  : 'bg-amber-950/70 border-amber-600/60 text-amber-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center">
              {activeMatch.matchNumber} &middot; Tekan Pukulan (+1) atau Tendangan (+2) sesuai teknik sah (Konsensus min. 2 dari 3 Juri)
            </div>
          )}
        </div>

        {/* Ergonomic 2-Column Thumb Pads (Blue Left, Red Right) */}
        <section className="flex-1 grid grid-cols-2 gap-3 sm:gap-5">
          {/* Sudut Biru Pad */}
          <div className="rounded-3xl bg-blue-950/35 border-2 border-blue-700/70 p-3 sm:p-5 flex flex-col justify-between gap-4">
            <div className="text-center space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-300">Sudut Biru</div>
              <div className="font-display text-xl sm:text-3xl font-bold text-white truncate">
                {activeMatch.blueName}
              </div>
              <div className="text-xs text-blue-200/80 truncate">{activeMatch.blueContingent}</div>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-end">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('blue', 1)}
                className="min-h-[96px] sm:min-h-[132px] rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-40 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-blue-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Pukulan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold">+1</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('blue', 2)}
                className="min-h-[112px] sm:min-h-[156px] rounded-2xl bg-blue-700 hover:bg-blue-600 active:scale-[0.98] disabled:opacity-40 border-2 border-blue-400/50 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-blue-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Tendangan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold">+2</span>
              </button>
            </div>
          </div>

          {/* Sudut Merah Pad */}
          <div className="rounded-3xl bg-red-950/35 border-2 border-red-700/70 p-3 sm:p-5 flex flex-col justify-between gap-4">
            <div className="text-center space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-red-300">Sudut Merah</div>
              <div className="font-display text-xl sm:text-3xl font-bold text-white truncate">
                {activeMatch.redName}
              </div>
              <div className="text-xs text-red-200/80 truncate">{activeMatch.redContingent}</div>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-end">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('red', 1)}
                className="min-h-[96px] sm:min-h-[132px] rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] disabled:opacity-40 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-red-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Pukulan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold">+1</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('red', 2)}
                className="min-h-[112px] sm:min-h-[156px] rounded-2xl bg-red-700 hover:bg-red-600 active:scale-[0.98] disabled:opacity-40 border-2 border-red-400/50 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-red-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Tendangan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold">+2</span>
              </button>
            </div>
          </div>
        </section>

        {/* Bottom Clear Vote / Current Score Summary */}
        <section className="flex items-center justify-between gap-2 py-2 border-t border-slate-800 text-xs text-slate-400">
          <div className="font-mono tabular-nums whitespace-nowrap">
            Skor: <span className="text-blue-400 font-bold">Biru {activeMatch.blueScore}</span> &ndash;{' '}
            <span className="text-red-400 font-bold">{activeMatch.redScore} Merah</span>
          </div>
          <button
            type="button"
            disabled={isFinished || !myVote || myVote.corner === 'none'}
            onClick={() => void clearJudgeVote(judgeId)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-200 font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Hapus Vote J{judgeId}</span>
          </button>
        </section>
      </main>
    </div>
  );
}
