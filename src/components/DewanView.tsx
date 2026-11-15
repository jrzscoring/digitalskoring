import { Award, CheckCircle2, FileText, Lock, Minus, Plus, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useArena } from '../context/ArenaContext';
import type { AppView, Corner, JudgeId, JurusPenaltyType, WinMethod } from '../types/silat';
import {
  CONSENSUS_WINDOW_MS,
  JURUS_PENALTY_LABELS,
  computeCornerJurusSummary,
  determineOfficialWinner,
  ensureJurusState,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchTime,
  getJurusType,
  isJurusMatch,
  isTunggalOrRegu,
} from '../utils/ipsiRules';
import { TournamentIdentityBanner } from './TournamentIdentityBanner';

interface DewanViewProps {
  onNavigate: (view: AppView) => void;
}

const POPUP_WIN_OPTIONS: { shortLabel: string; method: Exclude<WinMethod, ''> }[] = [
  { shortLabel: 'TKO', method: 'Menang Teknik (TKO)' },
  { shortLabel: 'Mutlak', method: 'Menang Mutlak' },
  { shortLabel: 'Undur Diri', method: 'Menang Undur Diri' },
  { shortLabel: 'WMP', method: 'Menang WMP' },
];

const JURUS_PENALTY_KEYS: JurusPenaltyType[] = [
  'timeViolation',
  'outOfBounds',
  'weaponDrop',
  'attireViolation',
  'stopOrDelay',
];

export function DewanView({ onNavigate }: DewanViewProps) {
  const {
    arena,
    activeMatch,
    events,
    liveTimerMs,
    triggerDewanAction,
    startVerification,
    cancelVerification,
    resolveVerification,
    declareWinner,
    autoAdjudicateWinner,
    setActivePerformerCorner,
    triggerJurusDewanPenalty,
  } = useArena();

  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerCorner, setWinnerCorner] = useState<Corner>('blue');
  const [winnerMethod, setWinnerMethod] = useState<Exclude<WinMethod, ''>>('Menang Teknik (TKO)');
  const [confirmDisqCorner, setConfirmDisqCorner] = useState<Corner | null>(null);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const isJurus = isJurusMatch(activeMatch);
  const jurusType = getJurusType(activeMatch);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);

  useEffect(() => {
    if (!isJurus || activeMatch.status !== 'active') return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isJurus, activeMatch.status, activeMatch.timerStartedAtMs]);

  const isFinished = activeMatch.status === 'finished';
  const suggested = determineOfficialWinner(activeMatch);

  // Aggregate per-judge (1, 2, 3) press counts for P (Pukulan) & T (Tendangan) per corner
  const judgePressSummary = useMemo(() => {
    const counts: Record<JudgeId, { blueP: number; blueT: number; redP: number; redT: number }> = {
      1: { blueP: 0, blueT: 0, redP: 0, redT: 0 },
      2: { blueP: 0, blueT: 0, redP: 0, redT: 0 },
      3: { blueP: 0, blueT: 0, redP: 0, redT: 0 },
    };

    for (const ev of events) {
      if (ev.type !== 'judge_press' || ev.undone) continue;
      const matchJudge = ev.actorRole.match(/(\d)/);
      const jid = matchJudge ? (Number(matchJudge[1]) as JudgeId) : null;
      if (!jid || !(jid in counts)) continue;
      if (ev.corner !== 'blue' && ev.corner !== 'red') continue;
      const isP = ev.description === 'P' || ev.pointsDelta === 1;
      if (ev.corner === 'blue') {
        if (isP) counts[jid].blueP += 1;
        else counts[jid].blueT += 1;
      } else {
        if (isP) counts[jid].redP += 1;
        else counts[jid].redT += 1;
      }
    }

    return counts;
  }, [events]);

  const roundLogData = useMemo(() => {
    type ChipTone = 'blue' | 'red' | 'positive' | 'zero' | 'negative' | 'disq' | 'verify';
    interface LogChip {
      id: string;
      label: string;
      title: string;
      tone: ChipTone;
    }
    interface RoundBucket {
      judges: Record<JudgeId, LogChip[]>;
      dewan: LogChip[];
    }

    const baseRounds = isJurus ? 1 : activeMatch.totalRounds === 2 ? 2 : 3;
    let maxRound = baseRounds;
    for (const ev of events) {
      if (!ev.undone && ev.round > maxRound) {
        maxRound = ev.round;
      }
    }
    const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

    const makeEmptyBucket = (): RoundBucket => ({
      judges: { 1: [], 2: [], 3: [] },
      dewan: [],
    });

    const corners: Record<Corner, Record<number, RoundBucket>> = {
      blue: {},
      red: {},
    };
    for (const r of rounds) {
      corners.blue[r] = makeEmptyBucket();
      corners.red[r] = makeEmptyBucket();
    }

    const chronological = [...events].reverse();
    for (const ev of chronological) {
      if (ev.undone) continue;
      const r = Math.max(1, ev.round || 1);

      if (ev.corner !== 'blue' && ev.corner !== 'red') {
        continue;
      }

      const bucket = corners[ev.corner][r] || (corners[ev.corner][r] = makeEmptyBucket());

      if (ev.type === 'judge_press') {
        const matchJudge = ev.actorRole.match(/(\d)/);
        const jid = matchJudge ? (Number(matchJudge[1]) as JudgeId) : null;
        if (!jid || !(jid in bucket.judges)) continue;
        const isPunch = ev.description === 'P' || ev.pointsDelta === 1;
        bucket.judges[jid].push({
          id: ev.id,
          label: isPunch ? '+1' : '+2',
          title: `${ev.actorRole}: ${isPunch ? 'Pukulan (+1)' : 'Tendangan (+2)'} (${ev.matchTimeFormatted})`,
          tone: ev.corner,
        });
        continue;
      }

      if (ev.type.startsWith('jurus_') && ev.actorRole.startsWith('Juri ')) {
        const matchJudge = ev.actorRole.match(/(\d)/);
        const jid = matchJudge ? (Number(matchJudge[1]) as JudgeId) : null;
        if (jid && jid in bucket.judges) {
          bucket.judges[jid].push({
            id: ev.id,
            label: ev.pointsDelta === 0 ? 'OK' : `${ev.pointsDelta > 0 ? '+' : '-'}${formatJurusScore(Math.abs(ev.pointsDelta))}`,
            title: `${ev.description} (${ev.matchTimeFormatted})`,
            tone: ev.corner,
          });
        }
        continue;
      }

      if (ev.type === 'punch' || ev.type === 'kick' || ev.type === 'winner' || ev.type === 'jurus_time_saved') {
        continue;
      }

      let label = String(ev.pointsDelta);
      let tone: ChipTone = ev.pointsDelta > 0 ? 'positive' : ev.pointsDelta < 0 ? 'negative' : 'zero';

      if (ev.type === 'fall') {
        label = '+3';
        tone = 'positive';
      } else if (ev.type === 'cancel_fall') {
        label = '-3';
        tone = 'negative';
      } else if (ev.type === 'binaan' || ev.type === 'binaan1' || ev.type === 'binaan2') {
        label = '0';
        tone = 'zero';
      } else if (ev.type === 'teguran1') {
        label = '-1';
        tone = 'negative';
      } else if (ev.type === 'teguran2') {
        label = '-2';
        tone = 'negative';
      } else if (ev.type === 'peringatan1') {
        label = '-5';
        tone = 'negative';
      } else if (ev.type === 'peringatan2') {
        label = '-10';
        tone = 'negative';
      } else if (ev.type === 'peringatan3' || ev.type === 'disq') {
        label = 'DQ';
        tone = 'disq';
      } else if (ev.type === 'verifikasi_jatuhan') {
        label = 'VER-J';
        tone = 'verify';
      } else if (ev.type === 'verifikasi_pelanggaran') {
        label = 'VER-P';
        tone = 'verify';
      } else if (ev.type === 'jurus_penalty') {
        label = `${ev.pointsDelta > 0 ? '+' : '-'}${formatJurusScore(Math.abs(ev.pointsDelta))}`;
        tone = ev.pointsDelta < 0 ? 'negative' : 'positive';
      }

      bucket.dewan.push({
        id: ev.id,
        label,
        title: `${ev.description} (${ev.matchTimeFormatted})`,
        tone,
      });
    }

    return { rounds, corners };
  }, [events, isJurus, activeMatch.totalRounds]);

  const nowMs = Date.now();
  const statusLabel =
    activeMatch.status === 'waiting'
      ? 'SIAP'
      : activeMatch.status === 'active'
      ? 'BERJALAN'
      : activeMatch.status === 'paused'
      ? 'DIJEDA'
      : activeMatch.status === 'break'
      ? 'ISTIRAHAT'
      : 'SELESAI';

  const openWinnerPopup = () => {
    setWinnerCorner(suggested.winner === 'red' ? 'red' : 'blue');
    setWinnerMethod(isJurus ? 'Menang Mutlak' : 'Menang Teknik (TKO)');
    setShowWinnerModal(true);
  };

  const handleConfirmWinner = async () => {
    await declareWinner(winnerCorner, winnerMethod);
    setShowWinnerModal(false);
  };

  const handleAutoWinner = async () => {
    await autoAdjudicateWinner();
    setShowWinnerModal(false);
  };

  const activeVerification = !isJurus && activeMatch.verification?.active ? activeMatch.verification : null;
  const verificationSummary = useMemo(
    () => evaluateVerificationConsensus(activeVerification),
    [activeVerification]
  );

  const activePerformer: Corner = activeMatch.activePerformerCorner || 'blue';
  const runningSegMs =
    isJurus && activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0
      ? Math.max(0, nowTick - activeMatch.timerStartedAtMs)
      : 0;
  const blueElapsedMs =
    jurusState.blue.recordedElapsedMs + (activePerformer === 'blue' ? runningSegMs : 0);
  const redElapsedMs =
    jurusState.red.recordedElapsedMs + (activePerformer === 'red' ? runningSegMs : 0);
  const activeElapsedMs = activePerformer === 'blue' ? blueElapsedMs : redElapsedMs;

  const blueJurusSummary = computeCornerJurusSummary(jurusType, jurusState.blue);
  const redJurusSummary = computeCornerJurusSummary(jurusType, jurusState.red);

  const displayedBlueScore = isJurus ? blueJurusSummary.finalScore : activeMatch.blueScore;
  const displayedRedScore = isJurus ? redJurusSummary.finalScore : activeMatch.redScore;
  const blueTrailing = displayedBlueScore < displayedRedScore;
  const redTrailing = displayedRedScore < displayedBlueScore;

  const renderJurusCornerControls = (corner: Corner) => {
    const isBlue = corner === 'blue';
    const isTrailing = isBlue ? blueTrailing : redTrailing;
    const isPerforming = activePerformer === corner;
    const name = isBlue ? activeMatch.blueName : activeMatch.redName;
    const contingent = isBlue ? activeMatch.blueContingent : activeMatch.redContingent;
    const cornerData = jurusState[corner];
    const summary = isBlue ? blueJurusSummary : redJurusSummary;
    const cornerElapsedMs = isBlue ? blueElapsedMs : redElapsedMs;
    const isTruthCat = isTunggalOrRegu(jurusType);

    const columnBg = isTrailing
      ? 'bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800 border-slate-400/75'
      : isBlue
      ? 'bg-gradient-to-b from-blue-600 via-blue-700 to-blue-800 border-blue-300/80'
      : 'bg-gradient-to-b from-red-600 via-red-700 to-red-800 border-red-300/80';
    const cornerLabelClass = isTrailing
      ? isBlue
        ? 'text-blue-300'
        : 'text-red-300'
      : 'text-yellow-300';
    const contingentClass = isTrailing
      ? 'text-slate-200'
      : isBlue
      ? 'text-blue-100'
      : 'text-red-100';

    return (
      <section
        className={`rounded-2xl ${columnBg} border-2 shadow-2xl overflow-hidden flex flex-col transition-colors duration-300 ${
          isPerforming ? 'ring-2 ring-yellow-300/70' : ''
        }`}
      >
        {/* Header Sudut */}
        <div className="border-b border-white/15 px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={`text-xs font-bold uppercase tracking-wider ${cornerLabelClass}`}>
              {isBlue ? 'Sudut Biru' : 'Sudut Merah'}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">{name}</h2>
            <div className={`text-xs truncate ${contingentClass}`}>{contingent}</div>
          </div>
          <button
            type="button"
            disabled={isFinished}
            onClick={() => void setActivePerformerCorner(corner)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 cursor-pointer transition-colors disabled:opacity-50 ${
              isPerforming
                ? 'bg-yellow-400 border-yellow-200 text-black'
                : 'bg-black/60 border-white/40 text-white hover:border-yellow-300'
            }`}
          >
            {isPerforming ? 'SEDANG TAMPIL' : 'Aktifkan Tampil'}
          </button>
        </div>

        <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3">
          {/* Skor Akhir & Statistik */}
          <div className="rounded-xl bg-black/45 border border-white/20 p-3 text-center space-y-2">
            <div
              data-testid={`dewan-jurus-score-${corner}`}
              className="font-mono text-5xl sm:text-6xl font-black tabular-nums leading-none text-white"
            >
              {formatJurusScore(summary.finalScore)}
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono border-t border-white/15 pt-2">
              <div>
                <div className="text-blue-200 font-sans text-[10px]">Median</div>
                <div className="font-bold text-yellow-300">{formatJurusScore(summary.median)}</div>
              </div>
              <div>
                <div className="text-blue-200 font-sans text-[10px]">Potongan</div>
                <div className="font-bold text-red-300">-{formatJurusScore(summary.penaltyTotal)}</div>
              </div>
              <div>
                <div className="text-blue-200 font-sans text-[10px]">Waktu</div>
                <div className="font-bold text-white">{formatJurusElapsedMs(cornerElapsedMs)}</div>
              </div>
              <div>
                <div className="text-blue-200 font-sans text-[10px]">Std Dev</div>
                <div className="font-bold text-blue-100">{(summary.stdDev / 100).toFixed(3)}</div>
              </div>
            </div>
          </div>

          {/* Per-Judge Live Cards (J1, J2, J3) */}
          <div className="grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as JudgeId[]).map((jid, idx) => {
              const jKey = jid === 1 ? 'judge1' : jid === 2 ? 'judge2' : 'judge3';
              const jScore = cornerData[jKey];
              const jTotal = summary.judgeTotals[idx];
              return (
                <div
                  key={jid}
                  className={`rounded-xl border p-2 text-center ${
                    jScore.submitted
                      ? 'bg-emerald-950/75 border-emerald-400/70'
                      : 'bg-black/55 border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase text-blue-200">
                    <span>Juri {jid}</span>
                    {jScore.submitted && <Lock className="w-2.5 h-2.5 text-emerald-300" />}
                  </div>
                  <div className="font-mono text-lg font-extrabold text-yellow-300 tabular-nums">
                    {formatJurusScore(jTotal)}
                  </div>
                  <div className="text-[10px] font-mono text-white/80">
                    {isTruthCat
                      ? `S:${jScore.wrongMoves} K:+${formatJurusScore(jScore.staminaScore)}`
                      : `${jScore.attackScore}/${jScore.harmonyScore}/${jScore.soulScore}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 5 IPSI Dewan Penalty Controls (-0.50) */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-300">
              Potongan Dewan Juri (-0.50 per Pelanggaran)
            </div>
            <div className="space-y-1">
              {JURUS_PENALTY_KEYS.map((pKey) => {
                const count = cornerData.penalties[pKey] || 0;
                return (
                  <div
                    key={pKey}
                    className="flex items-center justify-between gap-2 rounded-xl bg-black/55 border border-white/20 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {JURUS_PENALTY_LABELS[pKey]}
                      </div>
                      <div className="text-[10px] font-mono text-yellow-200">
                        {count}x (-{formatJurusScore(count * 50)})
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isFinished || count <= 0}
                        onClick={() => void triggerJurusDewanPenalty(corner, pKey, -1)}
                        className="w-8 h-8 rounded-lg bg-blue-950 hover:bg-blue-900 border border-blue-400/50 disabled:opacity-35 flex items-center justify-center text-white cursor-pointer"
                        aria-label={`Kurangi ${JURUS_PENALTY_LABELS[pKey]} ${corner}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isFinished}
                        onClick={() => void triggerJurusDewanPenalty(corner, pKey, 1)}
                        className="min-h-[32px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 border border-red-300/60 disabled:opacity-35 text-[11px] font-extrabold text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>-0.50</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderCornerControls = (corner: Corner) => {
    const isBlue = corner === 'blue';
    const isTrailing = isBlue ? blueTrailing : redTrailing;
    const name = isBlue ? activeMatch.blueName : activeMatch.redName;
    const contingent = isBlue ? activeMatch.blueContingent : activeMatch.redContingent;
    const score = isBlue ? activeMatch.blueScore : activeMatch.redScore;
    const teguran1 = isBlue ? activeMatch.blueTeguran1 : activeMatch.redTeguran1;
    const teguran2 = isBlue ? activeMatch.blueTeguran2 : activeMatch.redTeguran2;
    const peringatan = isBlue ? activeMatch.bluePeringatan : activeMatch.redPeringatan;

    const columnBg = isTrailing
      ? 'bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800 border-slate-400/75'
      : isBlue
      ? 'bg-gradient-to-b from-blue-600 via-blue-700 to-blue-800 border-blue-300/80'
      : 'bg-gradient-to-b from-red-600 via-red-700 to-red-800 border-red-300/80';
    const cornerLabelClass = isTrailing
      ? isBlue
        ? 'text-blue-300'
        : 'text-red-300'
      : 'text-yellow-300';
    const contingentClass = isTrailing
      ? 'text-slate-200'
      : isBlue
      ? 'text-blue-100'
      : 'text-red-100';

    return (
      <section className={`rounded-2xl ${columnBg} border-2 shadow-2xl overflow-hidden flex flex-col transition-colors duration-300`}>
        {/* Bagian Atas: Identitas Sudut & Atlet */}
        <div className="border-b border-white/15 px-4 py-2 text-center shrink-0">
          <div className={`text-[11px] font-bold uppercase tracking-wider ${cornerLabelClass}`}>
            {isBlue ? 'Sudut Biru' : 'Sudut Merah'}
          </div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate leading-tight">{name}</h2>
          <div className={`text-[11px] truncate ${contingentClass}`}>{contingent}</div>
        </div>

        <div className="p-2.5 sm:p-3 flex-1 min-h-0 flex flex-col justify-between gap-2">
          {/* Bagian Tengah: Skor Sudut langsung tanpa kotak/grid & tanpa label */}
          <div
            data-testid={`corner-main-score-${corner}`}
            className="flex-1 min-h-0 flex items-center justify-center py-1 text-center"
          >
            <span className="font-mono text-6xl sm:text-7xl xl:text-8xl font-black tabular-nums leading-none text-white drop-shadow-[0_2px_10px_rgba(15,23,42,0.4)]">
              {score}
            </span>
          </div>

          {/* Bagian Bawah: Menu Pelanggaran & Aksi Wasit (3 baris vertikal x 3 kolom horizontal, jarak rapat) */}
          <div data-testid={`corner-actions-grid-${corner}`} className="space-y-1.5 shrink-0">
            {/* Baris 1 (Atas): Binaan 1, Binaan 2, Jatuhan Sah */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('binaan1', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-orange-500 hover:bg-orange-400 border border-orange-200/85 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Binaan 1</span>
                <span className="font-mono text-[10px] font-bold text-orange-50">(0)</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('binaan2', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-orange-500 hover:bg-orange-400 border border-orange-200/85 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Binaan 2</span>
                <span className="font-mono text-[10px] font-bold text-orange-50">(0)</span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('fall', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-green-500 hover:bg-green-400 border border-green-200 shadow-sm disabled:opacity-40 text-xs font-extrabold text-slate-950 flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Jatuhan Sah</span>
                <span className="font-mono text-[10px] font-extrabold text-slate-950">(+3)</span>
              </button>
            </div>

            {/* Baris 2 (Tengah): Teguran 1, Teguran 2, Jatuhan Batal */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('teguran1', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-300 border border-yellow-100 shadow-sm disabled:opacity-40 text-xs font-extrabold text-slate-950 flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Teguran 1</span>
                <span className="font-mono text-[10px] font-bold text-slate-900">
                  (-1) &middot; Total: {teguran1}
                </span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('teguran2', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-300 border border-yellow-100 shadow-sm disabled:opacity-40 text-xs font-extrabold text-slate-950 flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Teguran 2</span>
                <span className="font-mono text-[10px] font-bold text-slate-900">
                  (-2) &middot; Total: {teguran2}
                </span>
              </button>

              <button
                type="button"
                disabled={isFinished}
                onClick={() => void triggerDewanAction('cancel_fall', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-2 py-1 rounded-xl bg-[#7B1E1E] hover:bg-[#932626] border border-red-300/70 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <span>Jatuhan Batal</span>
                <span className="font-mono text-[10px] font-bold text-yellow-200">(-3)</span>
              </button>
            </div>

            {/* Baris 3 (Bawah): Peringatan 1, Peringatan 2, Disq */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isFinished || peringatan >= 1}
                onClick={() => void triggerDewanAction('peringatan1', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-1.5 py-1 rounded-xl bg-red-600 hover:bg-red-500 border border-red-200/85 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex flex-col items-center justify-center whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>Peringatan 1</span>
                <span className="font-mono text-[10px] font-bold text-yellow-200">(-5)</span>
              </button>

              <button
                type="button"
                disabled={isFinished || peringatan >= 2}
                onClick={() => void triggerDewanAction('peringatan2', corner)}
                className="min-h-[42px] xl:min-h-[48px] px-1.5 py-1 rounded-xl bg-red-600 hover:bg-red-500 border border-red-200/85 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex flex-col items-center justify-center whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>Peringatan 2</span>
                <span className="font-mono text-[10px] font-bold text-yellow-200">(-10)</span>
              </button>

              <button
                type="button"
                disabled={isFinished || peringatan >= 3}
                onClick={() => setConfirmDisqCorner(corner)}
                className="min-h-[42px] xl:min-h-[48px] px-1.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 border border-yellow-300/80 shadow-sm disabled:opacity-40 text-xs font-bold text-white flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-yellow-300" />
                <span>Disq</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div
      className={`${
        !isJurus ? 'min-h-screen lg:h-dvh lg:overflow-hidden' : 'min-h-screen'
      } bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col`}
    >
      <main
        className={`flex-1 min-h-0 max-w-[1400px] w-full mx-auto ${
          !isJurus ? 'px-3 sm:px-5 py-2 sm:py-2.5 flex flex-col gap-2 sm:gap-2.5' : 'px-4 sm:px-6 py-4 space-y-4'
        }`}
      >
        <TournamentIdentityBanner
          arena={arena}
          match={activeMatch}
          compact
          onBack={() => onNavigate('landing')}
          showFullscreen
        />

        {isJurus ? (
          /* 3-Column Dewan Jurus TGRS Layout (4 : 2 : 4) */
          <div
            data-testid="dewan-jurus-3col-grid"
            className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-stretch"
          >
            <div className="lg:col-span-4 flex flex-col [&>section]:flex-1">
              {renderJurusCornerControls('blue')}
            </div>

            <section
              aria-label="Kontrol Tengah Dewan Jurus"
              className="lg:col-span-2 rounded-2xl bg-gradient-to-b from-purple-900/95 via-indigo-900/95 to-purple-950/95 border border-purple-400/70 p-3 flex flex-col gap-2.5 justify-between"
            >
              <div className="rounded-xl bg-indigo-800/80 border border-blue-300/50 p-2.5 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
                  Jurus TGRS
                </div>
                <div className="font-display text-lg font-extrabold text-yellow-300 leading-tight">
                  {jurusType}
                </div>
                <div className="text-[11px] font-semibold text-white">
                  Tampil: {activePerformer === 'blue' ? 'Sudut Biru' : 'Sudut Merah'}
                </div>
              </div>

              <div className="rounded-xl bg-purple-800/85 border border-purple-300/60 p-2.5 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
                  Waktu Tampil Arena
                </div>
                <div className="font-mono text-2xl font-extrabold tabular-nums text-white leading-tight">
                  {formatMatchTime(liveTimerMs)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-300">
                  {statusLabel}
                </div>
              </div>

              <div className="rounded-xl bg-black/55 border border-yellow-400/50 p-2.5 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-200">
                  Waktu Nyata Penampil
                </div>
                <div className="font-mono text-2xl font-extrabold tabular-nums text-yellow-300 leading-tight">
                  {formatJurusElapsedMs(activeElapsedMs)}
                </div>
              </div>

              <div className="rounded-xl bg-indigo-900/80 border border-purple-300/55 p-2.5 space-y-1.5 text-xs font-mono">
                <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-yellow-300 text-center">
                  Selisih Nilai Akhir
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-300 font-bold">Biru</span>
                  <span className="text-white font-bold">{formatJurusScore(blueJurusSummary.finalScore)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-300 font-bold">Merah</span>
                  <span className="text-white font-bold">{formatJurusScore(redJurusSummary.finalScore)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={openWinnerPopup}
                className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Award className="w-4 h-4 shrink-0" />
                <span>Keputusan Pemenang</span>
              </button>
            </section>

            <div className="lg:col-span-4 flex flex-col [&>section]:flex-1">
              {renderJurusCornerControls('red')}
            </div>
          </div>
        ) : (
          /* 3-Column Dewan Arena Layout (4 : 2 : 4) */
          <div
            data-testid="dewan-3col-grid"
            className="grid grid-cols-1 lg:grid-cols-10 gap-2.5 sm:gap-3 items-stretch lg:flex-1 lg:min-h-0"
          >
            {/* Kolom Kiri (4): Sudut Biru */}
            <div className="lg:col-span-4 flex flex-col min-h-0 [&>section]:flex-1">
              {renderCornerControls('blue')}
            </div>

            {/* Kolom Tengah (2): Babak -> Timer -> Juri 1-3 -> Keputusan Pemenang -> Verifikasi Jatuhan -> Verifikasi Pelanggaran */}
            <section
              aria-label="Kontrol Tengah Dewan"
              data-testid="dewan-center-column"
              className="lg:col-span-2 rounded-2xl bg-gradient-to-b from-purple-900/95 via-indigo-900/95 to-purple-950/95 border border-purple-400/70 px-2.5 sm:px-3 py-2 flex flex-col gap-1.5 justify-evenly min-h-0"
            >
              {/* 1. Babak */}
              <div
                data-testid="dewan-active-round"
                className="font-display text-base xl:text-lg font-extrabold uppercase tracking-wider text-yellow-300 text-center leading-tight"
              >
                {activeMatch.status === 'break'
                  ? `Istirahat (Babak ${activeMatch.currentRound})`
                  : `Babak ${activeMatch.currentRound}`}
              </div>

              {/* 2. Timer */}
              <div
                data-testid="dewan-center-timer"
                className={`font-mono text-3xl xl:text-4xl font-black tabular-nums leading-none text-center ${
                  liveTimerMs <= 10000 && activeMatch.status === 'active'
                    ? 'text-yellow-300'
                    : 'text-white'
                }`}
              >
                {formatMatchTime(liveTimerMs)}
              </div>

              {/* 3. Ringkasan P/T tiap Juri 1, 2, 3 */}
              <div data-testid="dewan-judge-log" className="space-y-1.5">
                {([1, 2, 3] as JudgeId[]).map((jid) => {
                  const counts = judgePressSummary[jid];
                  const vote =
                    jid === 1
                      ? activeMatch.judge1Vote
                      : jid === 2
                      ? activeMatch.judge2Vote
                      : activeMatch.judge3Vote;
                  const isFresh =
                    Boolean(vote && vote.corner !== 'none' && nowMs - vote.timestampMs <= CONSENSUS_WINDOW_MS);

                  return (
                    <div
                      key={jid}
                      data-testid={`judge-log-j${jid}`}
                      className="rounded-lg bg-purple-950/60 border border-purple-400/35 p-1.5 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold leading-none">
                        <span className="text-white">Juri {jid}</span>
                        {isFresh && vote && (
                          <span
                            aria-label={`Juri ${jid} aktif sudut ${vote.corner === 'blue' ? 'Biru' : 'Merah'}`}
                            className={`w-2 h-2 rounded-full ${
                              vote.corner === 'blue' ? 'bg-blue-300' : 'bg-red-300'
                            }`}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1 font-mono text-[10px] font-bold tabular-nums">
                        <div className="rounded bg-blue-700/90 border border-blue-300/60 px-1 py-0.5 text-center text-white leading-tight">
                          <span className="block text-[8px] font-sans font-semibold text-blue-100">
                            Biru
                          </span>
                          <span>
                            P={counts.blueP} T={counts.blueT}
                          </span>
                        </div>
                        <div className="rounded bg-red-700/90 border border-red-300/60 px-1 py-0.5 text-center text-white leading-tight">
                          <span className="block text-[8px] font-sans font-semibold text-red-100">
                            Merah
                          </span>
                          <span>
                            P={counts.redP} T={counts.redT}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 4. Keputusan Pemenang */}
              <button
                type="button"
                onClick={openWinnerPopup}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Award className="w-4 h-4 shrink-0" />
                <span>Keputusan Pemenang</span>
              </button>

              {/* 5. Verifikasi Jatuhan */}
              <button
                type="button"
                disabled={isFinished || Boolean(activeVerification)}
                onClick={() => void startVerification('jatuhan')}
                className="w-full min-h-[36px] px-2 py-1.5 rounded-xl bg-blue-700/95 hover:bg-blue-600 border border-blue-300/60 hover:border-yellow-300 disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition-colors"
              >
                Verifikasi Jatuhan
              </button>

              {/* 6. Verifikasi Pelanggaran */}
              <button
                type="button"
                disabled={isFinished || Boolean(activeVerification)}
                onClick={() => void startVerification('pelanggaran')}
                className="w-full min-h-[36px] px-2 py-1.5 rounded-xl bg-red-700/95 hover:bg-red-600 border border-red-300/60 hover:border-yellow-300 disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition-colors"
              >
                Verifikasi Pelanggaran
              </button>
            </section>

            {/* Kolom Kanan (4): Sudut Merah */}
            <div className="lg:col-span-4 flex flex-col min-h-0 [&>section]:flex-1">
              {renderCornerControls('red')}
            </div>
          </div>
        )}

        {/* Bottom Log Penilaian & Pelanggaran Real-Time sejajar di bawah Sudut Biru & Sudut Merah */}
        <section
          aria-label="Log Penilaian dan Pelanggaran Real-Time"
          className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-3 items-stretch shrink-0"
        >
          {(['blue', 'red'] as Corner[]).map((corner) => {
            const isBlue = corner === 'blue';
            const cardTheme = isBlue
              ? 'bg-gradient-to-b from-blue-950/90 via-[#12092c]/95 to-purple-950/90 border-blue-400/60'
              : 'bg-gradient-to-b from-red-950/90 via-[#1f0928]/95 to-purple-950/90 border-red-400/60';
            const headerTheme = isBlue
              ? 'bg-blue-900/55 border-b border-blue-400/40 text-blue-200'
              : 'bg-red-900/55 border-b border-red-400/40 text-red-200';

            const chipClassForTone = (tone: string) => {
              switch (tone) {
                case 'blue':
                  return 'bg-blue-700/85 border-blue-400/70 text-blue-100';
                case 'red':
                  return 'bg-red-700/85 border-red-400/70 text-red-100';
                case 'positive':
                case 'zero':
                  return 'bg-emerald-700/85 border-emerald-400/75 text-emerald-100';
                case 'negative':
                  return 'bg-red-800/85 border-red-400/75 text-red-100';
                case 'disq':
                  return 'bg-rose-700 border-yellow-300/80 text-yellow-200';
                case 'verify':
                  return 'bg-purple-700/90 border-amber-400/75 text-yellow-200';
                default:
                  return 'bg-slate-800 border-slate-500/60 text-white';
              }
            };

            return (
              <div
                key={corner}
                data-testid={`dewan-corner-log-${corner}`}
                className={`rounded-2xl ${cardTheme} border overflow-hidden flex flex-col`}
              >
                <div className={`${headerTheme} px-3 py-1.5 flex items-center justify-between gap-2`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <h2 className="font-display text-xs font-extrabold uppercase tracking-wider truncate">
                      LOG NILAI MASUK ({isBlue ? 'BIRU' : 'MERAH'})
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-white/80 truncate">
                    {isBlue ? activeMatch.blueName : activeMatch.redName}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[126px]">
                  <table className="w-full table-fixed border-collapse text-xs">
                    <thead>
                      <tr className="bg-black/35 border-b border-purple-700/50 text-[10px] font-extrabold uppercase tracking-wider">
                        <th
                          className={`w-12 py-1 px-1 text-center border-r border-purple-800/45 ${
                            isBlue ? 'text-blue-200' : 'text-red-200'
                          }`}
                        >
                          RD
                        </th>
                        {([1, 2, 3] as JudgeId[]).map((jid) => (
                          <th
                            key={jid}
                            className={`w-[58px] sm:w-[68px] py-1 px-1 text-center border-r border-purple-800/45 ${
                              isBlue ? 'text-blue-200' : 'text-red-200'
                            }`}
                          >
                            J{jid}
                          </th>
                        ))}
                        <th className="py-1 px-2 text-center text-emerald-300">DWN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundLogData.rounds.map((r) => {
                        const bucket = roundLogData.corners[corner][r];
                        return (
                          <tr
                            key={r}
                            className="border-b last:border-b-0 border-purple-800/45 hover:bg-white/[0.02]"
                          >
                            <td className="py-1.5 px-1 text-center font-mono text-[11px] font-bold text-white/95 border-r border-purple-800/45 whitespace-nowrap">
                              {isJurus ? jurusType.slice(0, 4) : `Rd ${r}`}
                            </td>
                            {([1, 2, 3] as JudgeId[]).map((jid) => {
                              const items = bucket?.judges[jid] || [];
                              return (
                                <td
                                  key={jid}
                                  className="py-1 px-1 text-center align-middle border-r border-purple-800/45"
                                >
                                  {items.length === 0 ? (
                                    <span className="text-slate-400 font-mono text-[11px]">-</span>
                                  ) : (
                                    <div className="flex flex-wrap items-center justify-center gap-0.5">
                                      {items.map((item) => (
                                        <span
                                          key={item.id}
                                          title={item.title}
                                          className={`px-1 py-0.5 rounded border font-mono text-[10px] font-bold leading-none tabular-nums ${chipClassForTone(
                                            item.tone
                                          )}`}
                                        >
                                          {item.label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-1 px-2 text-center align-middle">
                              {!bucket || bucket.dewan.length === 0 ? (
                                <span className="text-slate-400 font-mono text-[11px]">-</span>
                              ) : (
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  {bucket.dewan.map((item) => (
                                    <span
                                      key={item.id}
                                      title={item.title}
                                      className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-extrabold leading-none tabular-nums ${chipClassForTone(
                                        item.tone
                                      )}`}
                                    >
                                      {item.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {/* Pop-up Keputusan Pemenang (TKO / Mutlak / Undur Diri / WMP) */}
      {showWinnerModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pop-up Keputusan Pemenang"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full rounded-2xl bg-[#110624] border border-purple-500/70 p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-300" />
                <h2 className="font-display text-xl font-bold text-white">Keputusan Pemenang</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup Pop-up Keputusan Pemenang"
                onClick={() => setShowWinnerModal(false)}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-purple-900/60 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-black/65 border border-purple-800/60 text-xs space-y-1">
              <div className="text-blue-200">Rekomendasi Sistem IPSI 2026:</div>
              <div className="text-sm font-bold text-yellow-300">
                {suggested.winner === 'blue'
                  ? `Sudut Biru (${activeMatch.blueName})`
                  : suggested.winner === 'red'
                  ? `Sudut Merah (${activeMatch.redName})`
                  : 'Seri'}{' '}
                &middot; {suggested.winMethod}
              </div>
              <div className="text-blue-200">{suggested.reason}</div>
            </div>

            <button
              type="button"
              disabled={isFinished}
              onClick={() => void handleAutoWinner()}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-blue-950 hover:bg-blue-900 border border-blue-500/60 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-yellow-300" />
              <span>Sahkan Pemenang Otomatis (Menang Angka)</span>
            </button>

            <div className="pt-2 border-t border-purple-800/60 space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-blue-200">Pilih Sudut Pemenang</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWinnerCorner('blue')}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold truncate cursor-pointer transition-colors ${
                      winnerCorner === 'blue'
                        ? 'bg-blue-600 border-yellow-400 text-white'
                        : 'bg-blue-950/60 border-blue-500/40 text-blue-200 hover:bg-blue-900/70'
                    }`}
                  >
                    Sudut Biru · {activeMatch.blueName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWinnerCorner('red')}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold truncate cursor-pointer transition-colors ${
                      winnerCorner === 'red'
                        ? 'bg-red-600 border-yellow-400 text-white'
                        : 'bg-red-950/60 border-red-500/40 text-red-200 hover:bg-red-900/70'
                    }`}
                  >
                    Sudut Merah · {activeMatch.redName}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-blue-200">
                  Pilih Pengesahan Kemenangan (TKO / Mutlak / Undur Diri / WMP)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {POPUP_WIN_OPTIONS.map((opt) => (
                    <button
                      key={opt.method}
                      type="button"
                      onClick={() => setWinnerMethod(opt.method)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                        winnerMethod === opt.method
                          ? 'bg-yellow-400 border-yellow-300 text-black'
                          : 'bg-black/65 border-purple-700/60 text-white hover:border-yellow-400/70'
                      }`}
                    >
                      <div className="text-xs font-extrabold">{opt.shortLabel}</div>
                      <div
                        className={`text-[11px] ${
                          winnerMethod === opt.method ? 'text-black/80 font-semibold' : 'text-blue-200'
                        }`}
                      >
                        {opt.method}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWinnerModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-black/70 border border-purple-700/60 text-xs font-semibold text-blue-200 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isFinished && activeMatch.winner !== 'draw'}
                  onClick={() => void handleConfirmWinner()}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-xs font-bold text-black cursor-pointer"
                >
                  Sahkan Kemenangan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Verifikasi Real-Time Juri 1, 2, 3 (Kategori Tanding) */}
      {activeVerification && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pop-up Verifikasi Dewan"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full rounded-2xl bg-[#071024] border-2 border-purple-500 p-6 shadow-2xl shadow-purple-950/60 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-200">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    verificationSummary.hasConsensus
                      ? 'bg-emerald-400'
                      : verificationSummary.allVoted
                      ? 'bg-amber-400'
                      : 'bg-purple-400 animate-pulse'
                  }`}
                />
                <span>
                  {verificationSummary.hasConsensus
                    ? 'Konsensus Juri Tercapai'
                    : verificationSummary.allVoted
                    ? 'Semua Juri Telah Memilih'
                    : 'Menunggu Vote Juri....'}
                </span>
              </div>
              <h2 className="font-display text-2xl sm:text-[26px] font-extrabold tracking-wide text-white uppercase">
                VERIFIKASI {activeVerification.kind === 'jatuhan' ? 'JATUHAN' : 'PELANGGARAN'}
              </h2>
              <p className="text-xs text-slate-300">
                Memonitor respon voting langsung dari seluruh juri secara real time
              </p>
            </div>

            <div className="rounded-lg border border-purple-500/80 bg-[#050a18]/70 p-3 grid grid-cols-3 gap-2.5">
              {([1, 2, 3] as JudgeId[]).map((jid) => {
                const vote =
                  jid === 1
                    ? activeVerification.j1Vote
                    : jid === 2
                    ? activeVerification.j2Vote
                    : activeVerification.j3Vote;

                const cardStyle =
                  vote === 'blue'
                    ? 'bg-blue-950/85 border-blue-400'
                    : vote === 'red'
                    ? 'bg-red-950/85 border-red-400'
                    : vote === 'invalid'
                    ? 'bg-amber-950/75 border-amber-400'
                    : 'bg-[#0a1326] border-purple-500/50';

                return (
                  <div
                    key={jid}
                    className={`rounded border px-2 py-4 flex flex-col items-center justify-center gap-1.5 text-center transition-colors ${cardStyle}`}
                  >
                    <span className="text-xs font-bold text-white">Juri {jid}</span>
                    {vote === 'none' ? (
                      <span className="text-xs italic text-slate-300">Menunggu</span>
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

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-bold">
                <div className="text-slate-100">
                  Total masuk :{' '}
                  <span className="text-cyan-400 tabular-nums">
                    {verificationSummary.votedCount}/3 Juri
                  </span>
                </div>
                <div className="text-slate-100 text-right">
                  Keputusan :{' '}
                  <span
                    className={
                      verificationSummary.consensus === 'blue'
                        ? 'text-blue-300 font-extrabold'
                        : verificationSummary.consensus === 'red'
                        ? 'text-red-300 font-extrabold'
                        : verificationSummary.consensus === 'invalid' ||
                          verificationSummary.consensus === 'split'
                        ? 'text-amber-300 font-extrabold'
                        : 'italic text-slate-300 font-semibold'
                    }
                  >
                    {verificationSummary.label}
                  </span>
                </div>
              </div>
              <div className="text-[11px] italic text-slate-400 text-right">
                (hasil dari konsensus suara juri (minimal 2 juri sepakat))
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => void cancelVerification()}
                className="min-h-[42px] px-4 py-2 rounded-md bg-slate-700/80 hover:bg-slate-600 border border-slate-500/60 text-xs font-extrabold uppercase tracking-wider text-white cursor-pointer transition-colors"
              >
                BATALKAN
              </button>
              <button
                type="button"
                disabled={!verificationSummary.canProcess}
                onClick={() => void resolveVerification()}
                className="min-h-[42px] px-4 py-2 rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-45 disabled:cursor-not-allowed border border-green-400/70 text-xs font-extrabold uppercase tracking-wider text-white cursor-pointer transition-colors"
              >
                PROSES KEPUTUSAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Konfirmasi Diskualifikasi (Kategori Tanding) */}
      {!isJurus && confirmDisqCorner && !isFinished && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Diskualifikasi"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-sm w-full rounded-2xl bg-[#110624] border border-rose-500/80 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-yellow-300 shrink-0" />
                <h2 className="font-display text-base font-bold text-white">
                  Konfirmasi Diskualifikasi
                </h2>
              </div>
              <button
                type="button"
                aria-label="Tutup Konfirmasi Diskualifikasi"
                onClick={() => setConfirmDisqCorner(null)}
                className="p-1 rounded-lg bg-black/60 hover:bg-purple-900/60 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-200">
              Apakah Anda yakin ingin mendiskualifikasi{' '}
              <span
                className={`font-bold ${
                  confirmDisqCorner === 'blue' ? 'text-blue-300' : 'text-red-300'
                }`}
              >
                {confirmDisqCorner === 'blue'
                  ? `Sudut Biru (${activeMatch.blueName})`
                  : `Sudut Merah (${activeMatch.redName})`}
              </span>
              ? Tindakan ini akan mengakhiri pertandingan dan menetapkan lawan sebagai pemenang.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDisqCorner(null)}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-white cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmDisqCorner;
                  setConfirmDisqCorner(null);
                  void triggerDewanAction('disq', target);
                }}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-yellow-300/80 text-xs font-extrabold text-white cursor-pointer transition-colors"
              >
                Ya, Diskualifikasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
