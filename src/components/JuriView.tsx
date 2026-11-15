import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, Minus, Plus, RotateCcw, Shield, Unlock } from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, JudgeId } from '../types/silat';
import {
  CONSENSUS_WINDOW_MS,
  computeCornerJurusSummary,
  computeJudgeCornerScore,
  ensureJurusState,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchTime,
  getJurusType,
  isJurusMatch,
  isTunggalOrRegu,
} from '../utils/ipsiRules';
import { ModuleHeader } from './ModuleHeader';
import { TournamentIdentityBanner } from './TournamentIdentityBanner';

interface JuriViewProps {
  onNavigate: (view: AppView) => void;
}

const STAMINA_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CREATIVE_PRESETS = [15, 20, 25, 28, 30];

export function JuriView({ onNavigate }: JuriViewProps) {
  const {
    arena,
    activeMatch,
    liveTimerMs,
    sendJudgeVote,
    clearJudgeVote,
    castVerificationVote,
    recordJurusWrongMove,
    setJurusStaminaScore,
    setJurusCreativeScore,
    toggleJurusJudgeSubmit,
  } = useArena();

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
  const [selectedJurusCorner, setSelectedJurusCorner] = useState<Corner>(
    activeMatch.activePerformerCorner || 'blue'
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    try {
      sessionStorage.setItem('silat_selected_judge', String(judgeId));
    } catch {
      // ignore
    }
  }, [judgeId]);

  useEffect(() => {
    if (activeMatch.activePerformerCorner) {
      setSelectedJurusCorner(activeMatch.activePerformerCorner);
    }
  }, [activeMatch.id, activeMatch.activePerformerCorner]);

  const isJurus = isJurusMatch(activeMatch);
  const activeVerification = !isJurus && activeMatch.verification?.active ? activeMatch.verification : null;
  const verificationSummary = useMemo(
    () => evaluateVerificationConsensus(activeVerification),
    [activeVerification]
  );
  const myVerificationVote = activeVerification
    ? judgeId === 1
      ? activeVerification.j1Vote
      : judgeId === 2
      ? activeVerification.j2Vote
      : activeVerification.j3Vote
    : 'none';

  useEffect(() => {
    if (!isJurus || activeMatch.status !== 'active') return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isJurus, activeMatch.status, activeMatch.timerStartedAtMs]);

  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const isFinished = activeMatch.status === 'finished';

  if (isJurus) {
    const activePerformer = activeMatch.activePerformerCorner || 'blue';
    const judgeKey = judgeId === 1 ? 'judge1' : judgeId === 2 ? 'judge2' : 'judge3';
    const cornerData = jurusState[selectedJurusCorner];
    const myScore = cornerData[judgeKey];
    const myTotal = computeJudgeCornerScore(jurusType, myScore);
    const cornerSummary = computeCornerJurusSummary(jurusType, cornerData);
    const isLocked = myScore.submitted || isFinished;
    const isTruthCategory = isTunggalOrRegu(jurusType);

    const runningMs =
      activeMatch.status === 'active' &&
      activeMatch.timerStartedAtMs > 0 &&
      selectedJurusCorner === activePerformer
        ? Math.max(0, nowTick - activeMatch.timerStartedAtMs)
        : 0;
    const cornerElapsedMs = cornerData.recordedElapsedMs + runningMs;

    const creativeFields: Array<{
      key: 'attackScore' | 'harmonyScore' | 'soulScore';
      label: string;
      hint: string;
    }> = [
      { key: 'attackScore', label: 'Teknik Serangan & Pertahanan', hint: 'Kualitas, variasi & ketepatan jurus (0.00 – 0.30)' },
      { key: 'harmonyScore', label: 'Kemantapan & Keserasian', hint: 'Keseimbangan, ritme & kekompakan (0.00 – 0.30)' },
      { key: 'soulScore', label: 'Penghayatan / Penampilan', hint: 'Ekspresi, kemantapan gerak & tenaga (0.00 – 0.30)' },
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
        <ModuleHeader currentView="juri" onNavigate={onNavigate} />

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4 justify-between">
          <TournamentIdentityBanner arena={arena} compact />

          {/* Top Judge Selector + Jurus Category & Dual Clock Strip */}
          <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-black/70 p-1 rounded-xl border border-purple-500/40 w-full md:w-auto">
              {([1, 2, 3] as JudgeId[]).map((jid) => (
                <button
                  key={jid}
                  type="button"
                  onClick={() => setJudgeId(jid)}
                  className={`flex-1 md:flex-none min-h-[40px] px-4 rounded-lg text-sm font-bold cursor-pointer transition-colors ${
                    judgeId === jid
                      ? 'bg-yellow-400 text-black'
                      : 'text-blue-200 hover:bg-purple-950 hover:text-white'
                  }`}
                >
                  Juri {jid}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="px-3 py-1 rounded-lg bg-purple-900/80 border border-purple-400/50 text-xs font-extrabold uppercase tracking-wider text-yellow-300">
                Jurus &middot; {jurusType}
              </span>
              <div className="text-center px-3 py-1 rounded-lg bg-black/60 border border-purple-700/50">
                <div className="text-[10px] uppercase tracking-wider text-blue-200">Waktu Arena</div>
                <div className="font-mono text-xl font-extrabold tabular-nums text-white leading-tight">
                  {formatMatchTime(liveTimerMs)}
                </div>
              </div>
              <div className="text-center px-3 py-1 rounded-lg bg-black/60 border border-yellow-400/40">
                <div className="text-[10px] uppercase tracking-wider text-yellow-200">Waktu Penampil</div>
                <div className="font-mono text-xl font-extrabold tabular-nums text-yellow-300 leading-tight">
                  {formatJurusElapsedMs(cornerElapsedMs)}
                </div>
              </div>
            </div>
          </section>

          {/* Corner Performer Selector */}
          <section className="grid grid-cols-2 gap-3">
            {(['blue', 'red'] as Corner[]).map((corner) => {
              const isBlue = corner === 'blue';
              const isSelected = selectedJurusCorner === corner;
              const isLive = activePerformer === corner;
              const name = isBlue ? activeMatch.blueName : activeMatch.redName;
              const cont = isBlue ? activeMatch.blueContingent : activeMatch.redContingent;
              const jSummary = computeCornerJurusSummary(jurusType, jurusState[corner]);
              const jVal = jSummary.judgeTotals[judgeId - 1];
              const locked = jurusState[corner][judgeKey].submitted;

              return (
                <button
                  key={corner}
                  type="button"
                  onClick={() => setSelectedJurusCorner(corner)}
                  className={`rounded-2xl p-3.5 border-2 text-left transition-all cursor-pointer ${
                    isSelected
                      ? isBlue
                        ? 'bg-gradient-to-b from-blue-600 to-blue-800 border-yellow-400 shadow-lg'
                        : 'bg-gradient-to-b from-red-600 to-red-800 border-yellow-400 shadow-lg'
                      : 'bg-[#0d051c]/80 border-purple-800/60 hover:border-purple-500/80 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-300">
                      {isBlue ? 'Sudut Biru' : 'Sudut Merah'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isLive && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-[10px] font-bold text-emerald-300">
                          SEDANG TAMPIL
                        </span>
                      )}
                      {locked && (
                        <span className="px-2 py-0.5 rounded bg-yellow-400/20 border border-yellow-300 text-[10px] font-bold text-yellow-300">
                          TERKUNCI
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
                    <div className="font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-yellow-300 shrink-0">
                      {formatJurusScore(jVal)}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Main Scoring Pad */}
          {isTruthCategory ? (
            <section className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kebenaran Gerak (Base 9.90 - Kesalahan) */}
              <div className="rounded-3xl bg-[#0d051c]/90 border-2 border-purple-600/70 p-4 sm:p-6 flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                      Kebenaran Gerak
                    </div>
                    <div className="text-xs text-blue-200">
                      Nilai dasar 9.90 dikurangi -0.01 setiap kesalahan gerak
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-blue-200">Skor Kebenaran</div>
                    <div className="font-mono text-3xl font-extrabold tabular-nums text-white">
                      {formatJurusScore(990 - myScore.wrongMoves)}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/60 border border-purple-700/60 py-4 px-4 text-center">
                  <div className="text-xs uppercase tracking-wider text-blue-200">Total Kesalahan Gerak</div>
                  <div
                    data-testid="jurus-wrong-moves-count"
                    className="font-mono text-5xl sm:text-6xl font-black tabular-nums text-red-300 mt-1"
                  >
                    {myScore.wrongMoves}
                  </div>
                  <div className="text-xs font-mono text-red-200 mt-1">
                    Pengurangan: -{formatJurusScore(myScore.wrongMoves)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={isLocked || myScore.wrongMoves <= 0}
                    onClick={() => void recordJurusWrongMove(judgeId, selectedJurusCorner, -1)}
                    className="min-h-[84px] rounded-2xl bg-blue-950/90 hover:bg-blue-900 border border-blue-400/60 disabled:opacity-40 text-white font-bold flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-5 h-5 text-yellow-300" />
                    <span className="text-xs sm:text-sm">Batal</span>
                    <span className="font-mono text-xs text-yellow-300">+0.01</span>
                  </button>

                  <button
                    type="button"
                    data-testid="jurus-wrong-move-btn"
                    disabled={isLocked}
                    onClick={() => void recordJurusWrongMove(judgeId, selectedJurusCorner, 1)}
                    className="col-span-2 min-h-[84px] rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] border-2 border-red-300/70 disabled:opacity-40 text-white font-display flex flex-col items-center justify-center gap-0.5 cursor-pointer shadow-lg shadow-red-950/60"
                  >
                    <span className="text-xl sm:text-2xl font-extrabold">Kesalahan Gerak</span>
                    <span className="font-mono text-2xl sm:text-3xl font-black text-yellow-300">-0.01</span>
                  </button>
                </div>
              </div>

              {/* Kemantapan / Stamina (0.00 - 0.10) */}
              <div className="rounded-3xl bg-[#0d051c]/90 border-2 border-purple-600/70 p-4 sm:p-6 flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                      Kemantapan / Penghayatan / Stamina
                    </div>
                    <div className="text-xs text-blue-200">
                      Pilih nilai tambahan antara 0.00 hingga 0.10
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-blue-200">Skor Kemantapan</div>
                    <div className="font-mono text-3xl font-extrabold tabular-nums text-yellow-300">
                      +{formatJurusScore(myScore.staminaScore)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1 content-center">
                  {STAMINA_OPTIONS.map((val) => {
                    const active = myScore.staminaScore === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={isLocked}
                        onClick={() => void setJurusStaminaScore(judgeId, selectedJurusCorner, val)}
                        className={`min-h-[54px] rounded-xl border font-mono text-base sm:text-lg font-extrabold tabular-nums transition-colors cursor-pointer disabled:opacity-40 ${
                          active
                            ? 'bg-yellow-400 border-yellow-200 text-black shadow-md'
                            : 'bg-black/65 border-purple-600/60 text-white hover:bg-purple-900/80 hover:border-yellow-400/70'
                        }`}
                      >
                        +{formatJurusScore(val)}
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs text-blue-200 text-center bg-black/50 rounded-xl px-3 py-2 border border-purple-800/50">
                  Rumus {jurusType}: <span className="font-mono text-white">9.90 - Kesalahan + Kemantapan</span>
                </div>
              </div>
            </section>
          ) : (
            /* Ganda / Tunggal Bebas (Base 9.10 + Attack + Harmony + Soul, masing-masing 0.00 - 0.30) */
            <section className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              {creativeFields.map((field) => {
                const value = myScore[field.key];
                return (
                  <div
                    key={field.key}
                    className="rounded-3xl bg-[#0d051c]/90 border-2 border-purple-600/70 p-4 sm:p-5 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                        {field.label}
                      </div>
                      <div className="text-[11px] text-blue-200 mt-0.5">{field.hint}</div>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-black/60 rounded-2xl p-3 border border-purple-700/60">
                      <button
                        type="button"
                        disabled={isLocked || value <= 0}
                        onClick={() => void setJurusCreativeScore(judgeId, selectedJurusCorner, field.key, value - 1)}
                        className="w-11 h-11 rounded-xl bg-purple-900 hover:bg-purple-800 border border-purple-400/50 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                        aria-label={`Kurangi ${field.label}`}
                      >
                        <Minus className="w-5 h-5" />
                      </button>

                      <div className="font-mono text-4xl font-black tabular-nums text-yellow-300">
                        +{formatJurusScore(value)}
                      </div>

                      <button
                        type="button"
                        disabled={isLocked || value >= 30}
                        onClick={() => void setJurusCreativeScore(judgeId, selectedJurusCorner, field.key, value + 1)}
                        className="w-11 h-11 rounded-xl bg-purple-900 hover:bg-purple-800 border border-purple-400/50 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                        aria-label={`Tambah ${field.label}`}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      disabled={isLocked}
                      value={value}
                      onChange={(e) =>
                        void setJurusCreativeScore(judgeId, selectedJurusCorner, field.key, Number(e.target.value))
                      }
                      className="w-full accent-yellow-400 cursor-pointer disabled:opacity-40"
                    />

                    <div className="grid grid-cols-5 gap-1.5">
                      {CREATIVE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={isLocked}
                          onClick={() => void setJurusCreativeScore(judgeId, selectedJurusCorner, field.key, preset)}
                          className={`min-h-[36px] rounded-lg border font-mono text-xs font-bold cursor-pointer disabled:opacity-40 ${
                            value === preset
                              ? 'bg-yellow-400 border-yellow-200 text-black'
                              : 'bg-black/65 border-purple-700/60 text-blue-100 hover:border-yellow-400/60'
                          }`}
                        >
                          {formatJurusScore(preset)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Bottom Jurus Total & Lock Bar */}
          <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
              <div>
                <span className="text-blue-200">Total Nilai Juri {judgeId}: </span>
                <span className="font-mono text-2xl font-black text-yellow-300 tabular-nums">
                  {formatJurusScore(myTotal)}
                </span>
              </div>
              <div className="text-blue-200 font-mono">
                Median: <span className="text-white font-bold">{formatJurusScore(cornerSummary.median)}</span> &middot; Akhir Sudut:{' '}
                <span className="text-emerald-300 font-bold">{formatJurusScore(cornerSummary.finalScore)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void toggleJurusJudgeSubmit(judgeId, selectedJurusCorner)}
              className={`w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40 ${
                myScore.submitted
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-yellow-400 hover:bg-yellow-300 text-slate-950'
              }`}
            >
              {myScore.submitted ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>
                {myScore.submitted
                  ? `Terkunci · Buka Kunci Nilai Juri ${judgeId}`
                  : `Kunci / Kirim Nilai Juri ${judgeId}`}
              </span>
            </button>
          </section>
        </main>
      </div>
    );
  }

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
      ? 'bg-black/70 border-blue-500/40 text-blue-200'
      : v.corner === 'blue'
      ? 'bg-blue-600 border-blue-300 text-white'
      : 'bg-red-600 border-red-300 text-white';

    return (
      <div
        key={jid}
        className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 ${colorClass}`}
      >
        <span>J{jid}</span>
        {isFresh && <span className="text-yellow-300">+{v.points}</span>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
      <ModuleHeader currentView="juri" onNavigate={onNavigate} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4 justify-between">
        <TournamentIdentityBanner arena={arena} compact />

        {/* Top Judge Identity & Match Clock Strip */}
        <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-black/70 p-1 rounded-xl border border-blue-500/40 w-full sm:w-auto">
            {([1, 2, 3] as JudgeId[]).map((jid) => (
              <button
                key={jid}
                type="button"
                onClick={() => setJudgeId(jid)}
                className={`flex-1 sm:flex-none min-h-[40px] px-4 rounded-lg text-sm font-bold cursor-pointer transition-colors ${
                  judgeId === jid
                    ? 'bg-yellow-400 text-black'
                    : 'text-blue-200 hover:bg-blue-950 hover:text-white'
                }`}
              >
                Juri {jid}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-yellow-300 uppercase">
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
                  ? 'bg-blue-950/90 border-yellow-400 text-yellow-300'
                  : 'bg-[#17092e]/90 border-blue-400/60 text-blue-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-yellow-300" />
              <span>{feedback.text}</span>
            </div>
          ) : (
            <div className="text-xs text-blue-200 text-center">
              {activeMatch.matchNumber} &middot; Tekan Pukulan (+1) atau Tendangan (+2) sesuai teknik sah (Konsensus min. 2 dari 3 Juri)
            </div>
          )}
        </div>

        {/* Ergonomic 2-Column Thumb Pads (Blue Left, Red Right) */}
        <section className="flex-1 grid grid-cols-2 gap-3 sm:gap-5">
          {/* Sudut Biru Pad */}
          <div className="rounded-3xl bg-gradient-to-b from-blue-600 via-blue-700 to-blue-800 border-2 border-blue-300/80 p-3 sm:p-5 flex flex-col justify-between gap-4">
            <div className="text-center space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-yellow-300">Sudut Biru</div>
              <div className="font-display text-xl sm:text-3xl font-bold text-white truncate">
                {activeMatch.blueName}
              </div>
              <div className="text-xs text-blue-100 truncate">{activeMatch.blueContingent}</div>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-end">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('blue', 1)}
                className="min-h-[96px] sm:min-h-[132px] rounded-2xl bg-blue-500 hover:bg-blue-400 active:scale-[0.98] disabled:opacity-40 border-2 border-blue-200/70 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-blue-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Pukulan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold text-yellow-300">+1</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('blue', 2)}
                className="min-h-[112px] sm:min-h-[156px] rounded-2xl bg-blue-700 hover:bg-blue-600 active:scale-[0.98] disabled:opacity-40 border-2 border-blue-300/60 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-blue-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Tendangan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold text-yellow-300">+2</span>
              </button>
            </div>
          </div>

          {/* Sudut Merah Pad */}
          <div className="rounded-3xl bg-gradient-to-b from-red-600 via-red-700 to-red-800 border-2 border-red-300/80 p-3 sm:p-5 flex flex-col justify-between gap-4">
            <div className="text-center space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-yellow-300">Sudut Merah</div>
              <div className="font-display text-xl sm:text-3xl font-bold text-white truncate">
                {activeMatch.redName}
              </div>
              <div className="text-xs text-red-100 truncate">{activeMatch.redContingent}</div>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-end">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('red', 1)}
                className="min-h-[96px] sm:min-h-[132px] rounded-2xl bg-red-500 hover:bg-red-400 active:scale-[0.98] disabled:opacity-40 border-2 border-red-200/70 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-red-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Pukulan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold text-yellow-300">+1</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void handleVote('red', 2)}
                className="min-h-[112px] sm:min-h-[156px] rounded-2xl bg-red-700 hover:bg-red-600 active:scale-[0.98] disabled:opacity-40 border-2 border-red-300/60 text-white font-display flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer shadow-lg shadow-red-950/60"
              >
                <span className="text-xl sm:text-3xl font-extrabold tracking-wide">Tendangan</span>
                <span className="font-mono text-2xl sm:text-4xl font-extrabold text-yellow-300">+2</span>
              </button>
            </div>
          </div>
        </section>

        {/* Bottom Clear Vote / Current Score Summary */}
        <section className="flex items-center justify-between gap-2 py-2 border-t border-purple-800/60 text-xs text-blue-200">
          <div className="font-mono tabular-nums whitespace-nowrap">
            Skor: <span className="text-blue-300 font-bold">Biru {activeMatch.blueScore}</span> &ndash;{' '}
            <span className="text-red-300 font-bold">{activeMatch.redScore} Merah</span>
          </div>
          <button
            type="button"
            disabled={isFinished || !myVote || myVote.corner === 'none'}
            onClick={() => void clearJudgeVote(judgeId)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-950/80 border border-blue-500/45 hover:bg-blue-900 hover:border-yellow-400 disabled:opacity-40 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-yellow-300" />
            <span>Hapus Vote J{judgeId}</span>
          </button>
        </section>
      </main>

      {/* Pop-up Verifikasi Dewan untuk Panel Juri 1, 2, 3 (Kategori Tanding) */}
      {activeVerification && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Verifikasi Juri ${judgeId}`}
          className="fixed inset-0 z-50 bg-[#050814]/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-3"
        >
          {/* Switcher Identitas Juri 1 / 2 / 3 agar mudah berpindah jika dalam 1 perangkat */}
          <div className="flex items-center gap-1.5 bg-[#091229] p-1 rounded-xl border border-amber-400/50">
            {([1, 2, 3] as JudgeId[]).map((jid) => (
              <button
                key={jid}
                type="button"
                onClick={() => setJudgeId(jid)}
                className={`min-h-[34px] px-3.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  judgeId === jid
                    ? 'bg-amber-400 text-black'
                    : 'text-amber-200 hover:bg-blue-950 hover:text-white'
                }`}
              >
                Juri {jid}
              </button>
            ))}
          </div>

          <div className="max-w-xl w-full rounded-2xl bg-gradient-to-b from-[#071538] via-[#050d24] to-[#04091a] border-2 border-amber-400/85 shadow-[0_0_40px_rgba(251,191,36,0.25)] p-6 sm:p-7 flex flex-col items-center text-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-[#091533] border border-amber-400/70 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
              <Shield className="w-7 h-7 text-amber-400" />
            </div>

            <div className="px-4 py-1 rounded-full bg-[#13182a] border border-amber-400/50 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-amber-300 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>VERIFIKASI DEWAN BERLANGSUNG &bull; IPSI 2026</span>
            </div>

            <h2 className="font-display text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-white">
              KONSENSUS JURI {judgeId}:{' '}
              {activeVerification.kind === 'jatuhan' ? 'JATUHAN' : 'PELANGGARAN'}
            </h2>

            <div className="px-5 py-1.5 rounded-full bg-purple-900/80 border border-purple-400/80 shadow-[0_0_20px_rgba(168,85,247,0.45)] text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-purple-100">
              PILIH HASIL VOTE (MERAH / BIRU / TIDAK SAH)
            </div>

            <div className="px-4 py-2 rounded-xl bg-[#071026] border border-blue-800/70 text-xs font-semibold">
              <span className="text-amber-300 font-bold">KASUS :</span>{' '}
              <span className="text-slate-100">
                &ldquo;Verifikasi {activeVerification.kind === 'jatuhan' ? 'Jatuhan' : 'Pelanggaran'}&rdquo;
              </span>
            </div>

            <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 pt-1">
              PILIH KEPUTUSAN ANDA SEBAGAI JURI {judgeId} (MINIMAL 2/3 KONSENSUS):
            </div>

            <div className="w-full grid grid-cols-3 gap-3 pt-1">
              <button
                type="button"
                onClick={() => void castVerificationVote(judgeId, 'red')}
                className={`min-h-[60px] rounded bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 border border-red-300/70 text-xs sm:text-sm font-extrabold uppercase text-white cursor-pointer transition-all ${
                  myVerificationVote === 'red'
                    ? 'ring-2 ring-yellow-300 shadow-[0_0_20px_rgba(239,68,68,0.65)] scale-[1.02]'
                    : ''
                }`}
              >
                SAH MERAH
              </button>

              <button
                type="button"
                onClick={() => void castVerificationVote(judgeId, 'invalid')}
                className={`min-h-[60px] rounded border border-amber-400/70 text-xs sm:text-sm font-extrabold uppercase text-amber-300 cursor-pointer transition-all ${
                  myVerificationVote === 'invalid'
                    ? 'bg-amber-950/75 ring-2 ring-yellow-300 shadow-[0_0_20px_rgba(251,191,36,0.45)] scale-[1.02]'
                    : 'bg-[#0a1326] hover:bg-[#101d38]'
                }`}
              >
                TIDAK SAH
              </button>

              <button
                type="button"
                onClick={() => void castVerificationVote(judgeId, 'blue')}
                className={`min-h-[60px] rounded bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border border-cyan-300/70 text-xs sm:text-sm font-extrabold uppercase text-white cursor-pointer transition-all ${
                  myVerificationVote === 'blue'
                    ? 'ring-2 ring-yellow-300 shadow-[0_0_20px_rgba(59,130,246,0.65)] scale-[1.02]'
                    : ''
                }`}
              >
                SAH BIRU
              </button>
            </div>

            {myVerificationVote !== 'none' && (
              <div className="text-xs font-semibold text-cyan-300 pt-1">
                Pilihan Juri {judgeId} terkirim:{' '}
                <span className="font-extrabold uppercase">
                  {myVerificationVote === 'blue'
                    ? 'SAH BIRU'
                    : myVerificationVote === 'red'
                    ? 'SAH MERAH'
                    : 'TIDAK SAH'}
                </span>{' '}
                &middot; {verificationSummary.votedCount}/3 Juri masuk
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
