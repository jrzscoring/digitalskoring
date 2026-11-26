import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Maximize2, Minimize2, Minus, Plus, RotateCcw, Shield, Unlock, X } from 'lucide-react';
import juriLogo from '../assets/juri1-logo.png';
import pukulanIcon from '../assets/pukulan-white.png';
import tendanganIcon from '../assets/tendangan-white.png';
import { useArena } from '../context/ArenaContext';
import { useFullscreenState } from '../hooks/useAutoFullscreen';
import type { AppView, Corner, JudgeId, JurusJudgeId } from '../types/silat';
import {
  CONSENSUS_WINDOW_MS,
  computeCornerJurusSummary,
  computeJudgeCornerScore,
  ensureJurusState,
  evaluateVerificationConsensus,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchTime,
  getJurusJudgeCount,
  getJurusJudgeIds,
  getJurusJudgeScore,
  getJurusType,
  isJurusMatch,
  isTunggalOrRegu,
} from '../utils/ipsiRules';
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
    isFullJuriUnlocked,
    loginWithPortalPasscode,
    sendJudgeVote,
    clearJudgeVote,
    castVerificationVote,
    recordJurusWrongMove,
    setJurusStaminaScore,
    setJurusCreativeScore,
    setJurusJudgeReady,
    toggleJurusJudgeSubmit,
  } = useArena();

  const [selectedJudgeId, setSelectedJudgeId] = useState<JurusJudgeId | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPasscode, setUnlockPasscode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ text: string; tone: 'pending' | 'awarded' } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const { isFullscreen, toggleFullscreen } = useFullscreenState();

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const isJurus = isJurusMatch(activeMatch);
  const activeVerification = !isJurus && activeMatch.verification?.active ? activeMatch.verification : null;
  const verificationSummary = useMemo(
    () => evaluateVerificationConsensus(activeVerification),
    [activeVerification]
  );
  const currentTandingJudge: JudgeId =
    selectedJudgeId && selectedJudgeId <= 3 ? (selectedJudgeId as JudgeId) : 1;
  const myVerificationVote = activeVerification
    ? currentTandingJudge === 1
      ? activeVerification.j1Vote
      : currentTandingJudge === 2
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
  const jurusJudgeCount = getJurusJudgeCount(activeMatch);
  const jurusJudgeIds = useMemo(() => getJurusJudgeIds(jurusJudgeCount), [jurusJudgeCount]);
  const jurusState = useMemo(() => ensureJurusState(activeMatch), [activeMatch]);
  const isFinished = activeMatch.status === 'finished';

  useEffect(() => {
    if (selectedJudgeId === null) return;
    if (!isFullJuriUnlocked && selectedJudgeId > 1) {
      setSelectedJudgeId(null);
      return;
    }
    if (isJurus && selectedJudgeId > jurusJudgeCount) {
      setSelectedJudgeId(null);
    } else if (!isJurus && selectedJudgeId > 3) {
      setSelectedJudgeId(null);
    }
  }, [isFullJuriUnlocked, isJurus, selectedJudgeId, jurusJudgeCount]);

  const openUnlockModal = () => {
    setUnlockPasscode('');
    setUnlockError(null);
    setShowUnlockModal(true);
  };

  const handleUnlockSubmit = (e: FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    const res = loginWithPortalPasscode(unlockPasscode);
    if (!res.valid) {
      setUnlockError(res.error || 'Password login tidak sesuai.');
      return;
    }
    setUnlockPasscode('');
    setShowUnlockModal(false);
  };

  const unlockModalNode = showUnlockModal ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="juri-unlock-modal-title"
      data-testid="juri-unlock-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowUnlockModal(false);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <form
        onSubmit={handleUnlockSubmit}
        className="w-full max-w-md rounded-2xl bg-[#120726] border border-purple-500/60 p-5 sm:p-6 shadow-2xl space-y-4 text-white"
      >
        <div className="flex items-center justify-between gap-3 border-b border-purple-800/60 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-yellow-300 shrink-0" />
            <h2 id="juri-unlock-modal-title" className="font-display text-base font-bold">
              Buka Semua Fitur Juri
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowUnlockModal(false)}
            aria-label="Tutup modal password"
            className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Hubungi whatsapp 081379876424 untuk akses penuh aplikasi
        </p>

        <div>
          <label htmlFor="juri-unlock-password-input" className="block text-xs font-semibold text-blue-200 mb-1.5">
            Password Login
          </label>
          <input
            id="juri-unlock-password-input"
            data-testid="juri-unlock-password-input"
            type="password"
            inputMode="numeric"
            autoFocus
            value={unlockPasscode}
            onChange={(e) => {
              setUnlockPasscode(e.target.value);
              if (unlockError) setUnlockError(null);
            }}
            placeholder="Masukkan password kejuaraan"
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-black/65 border border-blue-500/45 text-white font-mono text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-xs placeholder:text-slate-400/60 focus:outline-none focus:border-yellow-400"
          />
        </div>

        {unlockError && (
          <div
            role="alert"
            data-testid="juri-unlock-error"
            className="rounded-xl bg-rose-950/85 border border-rose-400/70 px-3 py-2 text-xs text-rose-100"
          >
            {unlockError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowUnlockModal(false)}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-black/55 border border-white/15 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            data-testid="juri-unlock-submit-btn"
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer"
          >
            Buka Akses Juri
          </button>
        </div>
      </form>
    </div>
  ) : null;

  if (selectedJudgeId === null) {
    const selectionIds: JurusJudgeId[] = isJurus ? jurusJudgeIds : ([1, 2, 3] as JurusJudgeId[]);
    const gridClass =
      selectionIds.length <= 3
        ? 'max-w-3xl grid-cols-1 sm:grid-cols-3'
        : selectionIds.length === 4
        ? 'max-w-4xl grid-cols-2 sm:grid-cols-4'
        : selectionIds.length <= 6
        ? 'max-w-4xl grid-cols-2 sm:grid-cols-3'
        : selectionIds.length <= 8
        ? 'max-w-5xl grid-cols-2 sm:grid-cols-4'
        : 'max-w-5xl grid-cols-2 sm:grid-cols-5';
    const cardHeightClass =
      selectionIds.length > 4
        ? 'min-h-[145px] sm:min-h-[175px] p-4 sm:p-5'
        : 'min-h-[190px] sm:min-h-[220px] p-6';

    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-6">
          <div className="shrink-0 flex items-center justify-between gap-2">
            <button
              type="button"
              data-fullscreen-ignore="true"
              onClick={() => onNavigate('landing')}
              aria-label="Kembali ke Menu Utama"
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-yellow-300 shrink-0" />
              <span>Kembali</span>
            </button>
            <button
              type="button"
              data-fullscreen-ignore="true"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-yellow-300 shrink-0" />
              ) : (
                <Maximize2 className="w-4 h-4 text-yellow-300 shrink-0" />
              )}
              <span className="hidden sm:inline">{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
            </button>
          </div>

          <section
            data-testid="juri-selection-screen"
            className="flex-1 flex flex-col items-center justify-center gap-6 sm:gap-7 py-4"
          >
            <div className="text-center space-y-2">
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold uppercase tracking-wide text-white">
                Pilih Juri yang Bertugas
              </h1>
              {isFullJuriUnlocked ? (
                <p
                  data-testid="juri-full-access-banner"
                  className="text-xs sm:text-sm text-emerald-300 font-medium flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5 shrink-0" />
                  <span>Akses Penuh Aktif &middot; Seluruh Juri Terbuka</span>
                </p>
              ) : (
                <div
                  data-testid="juri-restricted-banner"
                  className="max-w-2xl mx-auto rounded-2xl bg-[#0d051c]/90 border border-amber-400/55 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-100">
                    <Lock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Mode Terbatas:</strong> Hanya{' '}
                      <strong className="text-yellow-300">Juri 1</strong> yang aktif. Masukkan password login melalui Panel Juri untuk membuka fitur penuh seluruh Juri.
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="juri-open-unlock-modal-btn"
                    onClick={openUnlockModal}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5 shrink-0" />
                    <span>Buka Semua Juri</span>
                  </button>
                </div>
              )}
            </div>

            <div className={`w-full grid gap-4 sm:gap-5 ${gridClass}`}>
              {selectionIds.map((jid) => {
                const isRestrictedJudge = !isFullJuriUnlocked && jid > 1;
                return (
                  <button
                    key={jid}
                    type="button"
                    data-testid={`select-judge-${jid}`}
                    aria-label={
                      isRestrictedJudge
                        ? `Juri ${jid} terkunci, klik untuk login password`
                        : `Pilih Juri ${jid}`
                    }
                    onClick={() => {
                      if (isRestrictedJudge) {
                        openUnlockModal();
                      } else {
                        setSelectedJudgeId(jid);
                      }
                    }}
                    className={`group rounded-3xl border-2 transition-all duration-150 flex flex-col items-center justify-center gap-3 sm:gap-4 shadow-xl shadow-black/60 cursor-pointer ${cardHeightClass} ${
                      isRestrictedJudge
                        ? 'bg-black/60 border-amber-500/35 hover:border-yellow-400/75 opacity-75 hover:opacity-100'
                        : 'bg-gradient-to-b from-blue-950/85 via-[#130829]/95 to-black/95 border-blue-500/45 hover:border-yellow-400 hover:from-blue-900/90 hover:to-[#230847]/95 active:scale-[0.98]'
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={juriLogo}
                        alt={`Logo Juri ${jid}`}
                        className={`${
                          selectionIds.length > 4 ? 'w-14 h-14 sm:w-16 sm:h-16' : 'w-20 h-20'
                        } object-contain select-none transition-transform duration-150 ${
                          isRestrictedJudge ? 'grayscale group-hover:grayscale-0' : 'group-hover:scale-110'
                        }`}
                      />
                    </div>
                    <div className="text-center space-y-1">
                      <div
                        className={`font-display text-xl sm:text-2xl font-extrabold tracking-wide transition-colors ${
                          isRestrictedJudge ? 'text-slate-200 group-hover:text-yellow-300' : 'text-white group-hover:text-yellow-300'
                        }`}
                      >
                        Juri {jid}
                      </div>
                      {isRestrictedJudge && (
                        <div className="text-[11px] font-semibold text-amber-300/90 flex items-center justify-center gap-1">
                          <Lock className="w-3 h-3 shrink-0" />
                          <span>Terkunci · Login Password</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </main>
        {unlockModalNode}
      </div>
    );
  }

  if (isJurus) {
    const judgeId: JurusJudgeId = selectedJudgeId <= jurusJudgeCount ? selectedJudgeId : 1;
    const activePerformer = activeMatch.activePerformerCorner || 'blue';
    const isTruthCategory = isTunggalOrRegu(jurusType);
    const effectiveCorner: Corner = activePerformer;
    const cornerData = jurusState[effectiveCorner];
    const myScore = getJurusJudgeScore(cornerData, judgeId);
    const myTotal = computeJudgeCornerScore(jurusType, myScore);
    const cornerSummary = computeCornerJurusSummary(jurusType, cornerData, jurusJudgeCount);
    const isLocked = myScore.submitted || isFinished;
    const isReady = Boolean(myScore.ready);
    const canScoreTruth = isReady && !isLocked;

    const handlePressReady = () => {
      if (isReady || isLocked) return;
      void setJurusJudgeReady(judgeId, effectiveCorner);
    };

    const runningMs =
      activeMatch.status === 'active' && activeMatch.timerStartedAtMs > 0
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
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3.5 justify-between">
          <TournamentIdentityBanner
            arena={arena}
            match={activeMatch}
            compact
            onBack={() => onNavigate('landing')}
            showFullscreen
            leftBadge={
              <div className="flex items-center gap-2">
                <div
                  data-testid="active-judge-badge"
                  className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-yellow-400 text-black font-display text-xs sm:text-sm font-extrabold uppercase tracking-wider whitespace-nowrap shadow-md"
                >
                  Juri {judgeId}
                </div>
                {!isFullJuriUnlocked && (
                  <button
                    type="button"
                    data-testid="juri-active-unlock-btn"
                    onClick={openUnlockModal}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-black/60 hover:bg-blue-950 border border-amber-400/60 text-[11px] font-bold text-amber-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Unlock className="w-3 h-3 shrink-0" />
                    <span>Buka Semua Juri</span>
                  </button>
                )}
              </div>
            }
            rightBadge={
              <div
                data-testid="jurus-performer-clock"
                className="text-center px-3 sm:px-3.5 py-1 rounded-xl bg-black/65 border border-yellow-400/45 shrink-0"
              >
                <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-yellow-200 leading-none">
                  Waktu Penampil
                </div>
                <div className="font-mono text-base sm:text-xl font-extrabold tabular-nums text-yellow-300 leading-tight">
                  {formatJurusElapsedMs(cornerElapsedMs)}
                </div>
              </div>
            }
          />

          {/* Main Scoring Pad */}
          {isTruthCategory ? (
            <div className="flex-1 flex flex-col gap-3.5 justify-between">
              {/* Status + Undo Strip & 2 Large International Scoring Pads (Left: Kesalahan Gerak, Right: READY) */}
              <section className="flex-1 rounded-3xl bg-[#0d051c]/90 border-2 border-purple-600/70 p-4 sm:p-5 flex flex-col gap-4 shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    data-testid="jurus-ready-status"
                    className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${
                      isLocked
                        ? 'text-slate-300'
                        : isReady
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                    }`}
                  >
                    {isLocked ? 'Nilai Terkunci' : isReady ? 'Panel Aktif' : 'Belum Ready'}
                  </span>

                  <button
                    type="button"
                    data-testid="jurus-undo-wrong-move-btn"
                    disabled={!canScoreTruth || myScore.wrongMoves <= 0}
                    onClick={() => void recordJurusWrongMove(judgeId, effectiveCorner, -1)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-400/60 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-yellow-300" />
                    <span>Batal</span>
                    <span className="font-mono text-yellow-300">+0.01</span>
                  </button>
                </div>

                {/* 2 Big Buttons: Left = Kesalahan Gerak (-0.01), Right = READY */}
                <div className="flex-1 grid grid-cols-2 gap-3.5 sm:gap-5">
                  <button
                    type="button"
                    data-testid="jurus-wrong-move-btn"
                    disabled={!canScoreTruth}
                    onClick={() => void recordJurusWrongMove(judgeId, effectiveCorner, 1)}
                    className={`min-h-[215px] sm:min-h-[270px] lg:min-h-[310px] rounded-2xl border-2 p-4 sm:p-6 flex flex-col items-center justify-center gap-2 text-center transition-all select-none touch-manipulation ${
                      canScoreTruth
                        ? 'bg-gradient-to-b from-red-600 via-red-700 to-red-900 hover:from-red-500 hover:to-red-800 active:scale-[0.98] border-red-300/85 text-white cursor-pointer shadow-xl shadow-red-950/60'
                        : 'bg-red-950/35 border-red-800/45 text-white/45 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <span className="font-display text-2xl sm:text-4xl font-black uppercase tracking-tight">
                      Kesalahan Gerak
                    </span>
                    <span className="font-mono text-4xl sm:text-5xl font-black tabular-nums text-yellow-300">
                      -0.01
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="jurus-ready-btn"
                    aria-pressed={isReady}
                    disabled={isReady || isLocked}
                    onClick={handlePressReady}
                    className={`min-h-[215px] sm:min-h-[270px] lg:min-h-[310px] rounded-2xl border-2 p-4 sm:p-6 flex flex-col items-center justify-center gap-2.5 text-center transition-all select-none touch-manipulation ${
                      isReady || isLocked
                        ? 'bg-slate-700/80 border-slate-500/70 text-slate-300 opacity-75 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 active:scale-[0.98] border-yellow-200 text-slate-950 cursor-pointer shadow-xl shadow-amber-950/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2
                        className={`w-7 h-7 sm:w-9 sm:h-9 ${
                          isReady || isLocked ? 'text-slate-300' : 'text-slate-950'
                        }`}
                      />
                      <span className="font-display text-3xl sm:text-5xl font-black uppercase tracking-wider">
                        READY
                      </span>
                    </div>
                    <span
                      className={`text-sm sm:text-base font-extrabold uppercase tracking-wider ${
                        isReady || isLocked ? 'text-slate-300' : 'text-slate-900'
                      }`}
                    >
                      {isLocked
                        ? 'Penilaian Selesai'
                        : isReady
                        ? 'Sudah Ready'
                        : 'Aktifkan Panel Penilaian'}
                    </span>
                  </button>
                </div>
              </section>

              {/* Below Both Big Buttons: Kemantapan Gerak / Penghayatan / Stamina (0.00 - 0.10) */}
              <section
                data-testid="jurus-stamina-section"
                className="rounded-3xl bg-[#0d051c]/90 border-2 border-purple-600/70 p-4 sm:p-5 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-yellow-300">
                    Kemantapan Gerak / Penghayatan / Stamina
                  </div>
                  <div className="text-right flex items-baseline gap-2">
                    <span className="text-xs text-blue-200">Skor Kemantapan:</span>
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-yellow-300">
                      +{formatJurusScore(myScore.staminaScore)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2">
                  {STAMINA_OPTIONS.map((val) => {
                    const active = myScore.staminaScore === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        data-testid={`jurus-stamina-btn-${val}`}
                        disabled={!canScoreTruth}
                        onClick={() => void setJurusStaminaScore(judgeId, effectiveCorner, val)}
                        className={`min-h-[52px] rounded-xl border font-mono text-sm sm:text-base font-extrabold tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
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
              </section>
            </div>
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
                        onClick={() => void setJurusCreativeScore(judgeId, effectiveCorner, field.key, value - 1)}
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
                        onClick={() => void setJurusCreativeScore(judgeId, effectiveCorner, field.key, value + 1)}
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
                        void setJurusCreativeScore(judgeId, effectiveCorner, field.key, Number(e.target.value))
                      }
                      className="w-full accent-yellow-400 cursor-pointer disabled:opacity-40"
                    />

                    <div className="grid grid-cols-5 gap-1.5">
                      {CREATIVE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={isLocked}
                          onClick={() => void setJurusCreativeScore(judgeId, effectiveCorner, field.key, preset)}
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
              disabled={isFinished || (isTruthCategory && !isReady && !myScore.submitted)}
              onClick={() => void toggleJurusJudgeSubmit(judgeId, effectiveCorner)}
              className={`w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
        {unlockModalNode}
      </div>
    );
  }

  const judgeId: JudgeId =
    selectedJudgeId <= 3 ? (selectedJudgeId as JudgeId) : 1;
  const isJuriLocked = !isJurus && Boolean(activeMatch.juriLocked) && !isFinished;

  const handleVote = async (corner: Corner, points: 1 | 2) => {
    if (activeMatch.status === 'finished' || isJuriLocked) return;
    const label = points === 1 ? 'Pukulan (+1)' : 'Tendangan (+2)';
    const cornerText = corner === 'blue' ? 'Biru' : 'Merah';
    const result = await sendJudgeVote(judgeId, corner, points);

    if (result.awarded) {
      setFeedback({ text: `KONSENSUS SAH: ${label} untuk Sudut ${cornerText}`, tone: 'awarded' });
    } else {
      setFeedback({ text: `Terkirim (${label} ${cornerText}) — menunggu konsensus juri lain`, tone: 'pending' });
    }
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
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
    <div className="min-h-[100dvh] w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col select-none">
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4">
        <div className="shrink-0">
          <TournamentIdentityBanner
            arena={arena}
            compact
            onBack={() => onNavigate('landing')}
            showFullscreen
          />
        </div>

        {/* Top Judge Identity & Match Clock Strip */}
        <section className="shrink-0 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 px-3.5 py-2.5 sm:px-5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div
              data-testid="active-judge-badge"
              className="px-4 py-1.5 sm:py-2 rounded-xl bg-yellow-400 text-black font-display text-sm sm:text-lg font-extrabold uppercase tracking-wider flex items-center gap-2 shrink-0"
            >
              <span>Juri {judgeId}</span>
            </div>
            {!isFullJuriUnlocked && (
              <button
                type="button"
                data-testid="juri-active-unlock-btn"
                onClick={openUnlockModal}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-black/60 hover:bg-blue-950 border border-amber-400/60 text-xs font-bold text-amber-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5 shrink-0" />
                <span>Buka Semua Juri</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <span className="text-xs sm:text-sm font-bold text-yellow-300 uppercase">
              Babak {activeMatch.currentRound}
            </span>
            <span className="font-mono text-xl sm:text-2xl font-extrabold tabular-nums text-white">
              {formatMatchTime(liveTimerMs)}
            </span>
            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as JudgeId[]).map(renderVoteBadge)}
            </div>
          </div>
        </section>

        {/* Ergonomic 2-Column Thumb Pads (Blue Left, Red Right) */}
        <section className="relative flex-1 min-h-[300px] grid grid-cols-2 gap-3 sm:gap-5">
          {/* Non-shifting Live Consensus Feedback Overlay */}
          {feedback && (
            <div className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xl">
              <div
                role="status"
                className={`w-full px-4 py-2 rounded-xl border text-center text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xl backdrop-blur-md ${
                  feedback.tone === 'awarded'
                    ? 'bg-blue-950/95 border-yellow-400 text-yellow-300'
                    : 'bg-[#17092e]/95 border-blue-400/70 text-blue-100'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-yellow-300" />
                <span className="truncate">{feedback.text}</span>
              </div>
            </div>
          )}

          {isJuriLocked && (
            <div
              data-testid="juri-locked-overlay"
              className="absolute inset-0 z-20 rounded-3xl bg-[#090315]/90 backdrop-blur-sm border-2 border-pink-500/75 flex flex-col items-center justify-center text-center p-6 gap-3 shadow-[0_0_40px_rgba(236,72,153,0.25)]"
            >
              <div className="w-14 h-14 rounded-2xl bg-pink-600/20 border border-pink-400/70 flex items-center justify-center">
                <Lock className="w-7 h-7 text-pink-400" />
              </div>
              <div className="font-display text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-white">
                Panel Juri Terkunci
              </div>
              <p className="max-w-md text-xs sm:text-sm text-purple-200 leading-relaxed">
                Jeda antar babak sedang berlangsung. Tombol input nilai juri dikunci sementara hingga dibuka kembali oleh petugas Timer.
              </p>
            </div>
          )}

          {/* Sudut Biru Pad (Hanya Tombol Pukulan & Tendangan) */}
          <div
            data-testid="juri-blue-pad"
            className="rounded-3xl bg-gradient-to-b from-blue-600 via-blue-700 to-blue-900 border-2 border-blue-300/80 p-3 sm:p-4 lg:p-5 grid grid-rows-2 gap-3 sm:gap-4 h-full"
          >
            <button
              type="button"
              aria-label="Sudut Biru - Pukulan (+1)"
              data-testid="juri-blue-pukulan-btn"
              disabled={isFinished || isJuriLocked}
              onClick={() => void handleVote('blue', 1)}
              className="h-full w-full min-h-[120px] p-3 sm:p-5 rounded-2xl bg-blue-500 hover:bg-blue-400 active:scale-[0.97] active:brightness-110 disabled:opacity-40 border-2 border-blue-200/75 flex items-center justify-center transition-all duration-75 cursor-pointer touch-manipulation select-none shadow-lg shadow-blue-950/60"
            >
              <img
                src={pukulanIcon}
                alt="Pukulan"
                className="max-h-[72%] max-w-[78%] h-[clamp(4.25rem,min(17vw,18dvh),9.5rem)] w-auto object-contain pointer-events-none select-none"
              />
            </button>

            <button
              type="button"
              aria-label="Sudut Biru - Tendangan (+2)"
              data-testid="juri-blue-tendangan-btn"
              disabled={isFinished || isJuriLocked}
              onClick={() => void handleVote('blue', 2)}
              className="h-full w-full min-h-[120px] p-3 sm:p-5 rounded-2xl bg-blue-800/95 hover:bg-blue-700 active:scale-[0.97] active:brightness-110 disabled:opacity-40 border-2 border-blue-300/65 flex items-center justify-center transition-all duration-75 cursor-pointer touch-manipulation select-none shadow-lg shadow-blue-950/60"
            >
              <img
                src={tendanganIcon}
                alt="Tendangan"
                className="max-h-[78%] max-w-[78%] h-[clamp(4.75rem,min(19vw,21dvh),10.5rem)] w-auto object-contain pointer-events-none select-none"
              />
            </button>
          </div>

          {/* Sudut Merah Pad (Hanya Tombol Pukulan & Tendangan) */}
          <div
            data-testid="juri-red-pad"
            className="rounded-3xl bg-gradient-to-b from-red-600 via-red-700 to-red-900 border-2 border-red-300/80 p-3 sm:p-4 lg:p-5 grid grid-rows-2 gap-3 sm:gap-4 h-full"
          >
            <button
              type="button"
              aria-label="Sudut Merah - Pukulan (+1)"
              data-testid="juri-red-pukulan-btn"
              disabled={isFinished || isJuriLocked}
              onClick={() => void handleVote('red', 1)}
              className="h-full w-full min-h-[120px] p-3 sm:p-5 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-[0.97] active:brightness-110 disabled:opacity-40 border-2 border-red-200/75 flex items-center justify-center transition-all duration-75 cursor-pointer touch-manipulation select-none shadow-lg shadow-red-950/60"
            >
              <img
                src={pukulanIcon}
                alt="Pukulan"
                className="max-h-[72%] max-w-[78%] h-[clamp(4.25rem,min(17vw,18dvh),9.5rem)] w-auto object-contain pointer-events-none select-none"
              />
            </button>

            <button
              type="button"
              aria-label="Sudut Merah - Tendangan (+2)"
              data-testid="juri-red-tendangan-btn"
              disabled={isFinished || isJuriLocked}
              onClick={() => void handleVote('red', 2)}
              className="h-full w-full min-h-[120px] p-3 sm:p-5 rounded-2xl bg-red-800/95 hover:bg-red-700 active:scale-[0.97] active:brightness-110 disabled:opacity-40 border-2 border-red-300/65 flex items-center justify-center transition-all duration-75 cursor-pointer touch-manipulation select-none shadow-lg shadow-red-950/60"
            >
              <img
                src={tendanganIcon}
                alt="Tendangan"
                className="max-h-[78%] max-w-[78%] h-[clamp(4.75rem,min(19vw,21dvh),10.5rem)] w-auto object-contain pointer-events-none select-none"
              />
            </button>
          </div>
        </section>

        {/* Bottom Clear Vote / Current Score Summary */}
        <section className="shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-purple-800/60 text-xs sm:text-sm text-blue-200">
          <div className="font-mono tabular-nums whitespace-nowrap">
            Skor: <span className="text-blue-300 font-bold">Biru {activeMatch.blueScore}</span> &ndash;{' '}
            <span className="text-red-300 font-bold">{activeMatch.redScore} Merah</span>
          </div>
          <button
            type="button"
            disabled={isFinished || isJuriLocked || !myVote || myVote.corner === 'none'}
            onClick={() => void clearJudgeVote(judgeId)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-blue-950/80 border border-blue-500/45 hover:bg-blue-900 hover:border-yellow-400 active:scale-[0.97] disabled:opacity-40 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer touch-manipulation transition-all duration-75"
          >
            <RotateCcw className="w-3.5 h-3.5 text-yellow-300" />
            <span>Hapus Vote J{judgeId}</span>
          </button>
        </section>
      </main>

      {/* Pop-up Verifikasi Dewan untuk Panel Juri (Kategori Tanding) */}
      {activeVerification && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Verifikasi Juri ${judgeId}`}
          className="fixed inset-0 z-50 bg-[#050814]/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-3"
        >
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
      {unlockModalNode}
    </div>
  );
}
