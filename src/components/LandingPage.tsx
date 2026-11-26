import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileDown,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import jrzScoreLogo from '@/jrzscoreutama.png';
import dewanLogo from '../assets/dewan1-logo.png';
import juriLogo from '../assets/juri1-logo.png';
import monitorLogo from '../assets/monitor1-logo.png';
import sekretarisLogo from '../assets/sekretaris1-logo.png';
import timerLogo from '../assets/timer1-logo.png';
import { useArena } from '../context/ArenaContext';
import { useFullscreenState } from '../hooks/useAutoFullscreen';
import type { AppView, ArenaCourt } from '../types/silat';
import {
  buildArenaArchiveFile,
  downloadArenaArchiveFile,
  parseArenaArchiveFile,
  type ArenaArchiveFile,
} from '../utils/archiveBackup';
import {
  buildEventShareUrl,
  readAcknowledgedLimitedNoticeUid,
  resolveCourtForArenaId,
  shouldShowLimitedModeNotice,
  writeAcknowledgedLimitedNoticeUid,
} from '../utils/authSession';
import { formatMatchScore } from '../utils/ipsiRules';
import { exportArenaSummaryPdf, exportMatchPdf } from '../utils/pdfExport';
import { isSoundMuted, playArenaGong, setSoundMuted } from '../utils/soundEffects';
import { AccountSessionModal } from './AccountSessionModal';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingPageProps {
  onSelectView: (view: AppView) => void;
}

const MENU_ITEMS: {
  id: Exclude<AppView, 'landing'>;
  label: string;
  logoSrc: string;
}[] = [
  { id: 'sekretaris', label: 'Sekretaris', logoSrc: sekretarisLogo },
  { id: 'dewan', label: 'Dewan', logoSrc: dewanLogo },
  { id: 'timer', label: 'Timer', logoSrc: timerLogo },
  { id: 'juri', label: 'Juri', logoSrc: juriLogo },
  { id: 'scoreboard', label: 'Scoreboard', logoSrc: monitorLogo },
];

const GELANGGANG_PRESETS: { id: string; court: ArenaCourt; label: string }[] = [
  { id: 'gelanggang-a', court: 'A', label: 'Gelanggang A' },
  { id: 'gelanggang-b', court: 'B', label: 'Gelanggang B' },
  { id: 'gelanggang-c', court: 'C', label: 'Gelanggang C' },
  { id: 'gelanggang-d', court: 'D', label: 'Gelanggang D' },
];

const DURATION_PRESETS = [
  { seconds: 60, label: '01:00' },
  { seconds: 90, label: '01:30' },
  { seconds: 120, label: '02:00' },
  { seconds: 150, label: '02:30' },
  { seconds: 180, label: '03:00' },
];

type SettingsTab = 'umum' | 'backup' | 'reset';

export function LandingPage({ onSelectView }: LandingPageProps) {
  const {
    mode,
    user,
    userProfile,
    authLoading,
    authError,
    clearAuthError,
    signInGoogle,
    signOutGoogle,
    isSuperAdmin,
    isFullJuriUnlocked,
    logoutPortal,
    arena,
    matches,
    athletes,
    brackets,
    activeMatch,
    joinArenaById,
    updateArenaMeta,
    setMatchTotalRounds,
    setMatchRoundDuration,
    resetSystem,
    exportArenaBackup,
    importArenaBackup,
  } = useArena();

  const { isFullscreen, toggleFullscreen } = useFullscreenState();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('umum');
  const [showLimitedNotice, setShowLimitedNotice] = useState(() =>
    shouldShowLimitedModeNotice({
      userUid: user?.uid,
      isFullJuriUnlocked,
      acknowledgedUid: readAcknowledgedLimitedNoticeUid(),
    })
  );

  const [arenaName, setArenaName] = useState(arena.name);
  const [tournamentName, setTournamentName] = useState(arena.tournamentName);
  const [venue, setVenue] = useState(arena.venue || '');
  const [eventDate, setEventDate] = useState(arena.eventDate || '');
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted());
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [switchingArenaId, setSwitchingArenaId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'arena' | 'link' | null>(null);

  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [importedArchive, setImportedArchive] = useState<ArenaArchiveFile | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [confirmRestoreArchive, setConfirmRestoreArchive] = useState(false);
  const [isRestoringArchive, setIsRestoringArchive] = useState(false);

  const [confirmResetSystem, setConfirmResetSystem] = useState(false);
  const [isResettingSystem, setIsResettingSystem] = useState(false);



  useEffect(() => {
    setArenaName(arena.name);
    setTournamentName(arena.tournamentName);
    setVenue(arena.venue || '');
    setEventDate(arena.eventDate || '');
  }, [arena.name, arena.tournamentName, arena.venue, arena.eventDate]);

  useEffect(() => {
    if (!showSettingsModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettingsModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSettingsModal]);



  useEffect(() => {
    setShowLimitedNotice(
      shouldShowLimitedModeNotice({
        userUid: user?.uid,
        isFullJuriUnlocked,
        acknowledgedUid: readAcknowledgedLimitedNoticeUid(),
      })
    );
  }, [user?.uid, isFullJuriUnlocked]);

  const handleAcknowledgeLimitedNotice = () => {
    writeAcknowledgedLimitedNoticeUid(user?.uid || null);
    setShowLimitedNotice(false);
  };

  useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const handleToggleSound = () => {
    const nextMuted = !soundMuted;
    setSoundMuted(nextMuted);
    setSoundMutedState(nextMuted);
  };

  const handleSelectGelanggang = async (targetArenaId: string) => {
    setSwitchingArenaId(targetArenaId);
    try {
      const ok = await joinArenaById(targetArenaId);
      if (ok) {
        setSavedNotice(`Beralih ke ${targetArenaId.replace('gelanggang-', 'Gelanggang ').toUpperCase()}.`);
        window.setTimeout(() => setSavedNotice(null), 2500);
      }
    } finally {
      setSwitchingArenaId(null);
    }
  };

  const handleCopyArenaInfo = async (kind: 'arena' | 'link') => {
    const text = kind === 'link' ? buildEventShareUrl(arena.id) : arena.id;
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const showTimedNotice = (message: string) => {
    setErrorNotice(null);
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(null), 3500);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    await updateArenaMeta({
      name: arenaName,
      tournamentName,
      venue,
      eventDate,
      logoLeft: arena.logoLeft || '',
      logoRight: arena.logoRight || '',
    });
    showTimedNotice('Pengaturan berhasil disimpan.');
  };

  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    setErrorNotice(null);
    try {
      const payload = await exportArenaBackup();
      const archive = buildArenaArchiveFile(payload);
      downloadArenaArchiveFile(archive);
      showTimedNotice(
        `Backup event berhasil diunduh (${archive.summary.totalMatches} partai, ${archive.summary.totalAthletes} atlet).`
      );
    } catch {
      setErrorNotice('Gagal mengekspor data backup event.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleArchiveFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorNotice(null);
    try {
      const text = await file.text();
      const parsed = parseArenaArchiveFile(text);
      if (!parsed) {
        setErrorNotice('Format file arsip tidak valid. Pilih file backup JSON JRZ Score.');
        return;
      }
      setImportedArchive(parsed);
      setArchiveSearch('');
      setConfirmRestoreArchive(false);
      showTimedNotice(
        `Arsip "${parsed.summary.tournamentName}" dimuat (${parsed.summary.finishedMatches} partai selesai).`
      );
    } catch {
      setErrorNotice('Gagal membaca file arsip event.');
    }
  };

  const handleRestoreImportedArchive = async () => {
    if (!importedArchive) return;
    setIsRestoringArchive(true);
    setErrorNotice(null);
    try {
      await importArenaBackup(importedArchive.payload);
      setConfirmRestoreArchive(false);
      showTimedNotice(
        `Arsip "${importedArchive.summary.tournamentName}" berhasil dipulihkan ke sistem. Buka panel Sekretaris atau Scoreboard untuk melihat seluruh data.`
      );
    } catch {
      setErrorNotice('Gagal memulihkan arsip event ke sistem.');
    } finally {
      setIsRestoringArchive(false);
    }
  };

  const handleConfirmResetSystem = async () => {
    setIsResettingSystem(true);
    setErrorNotice(null);
    try {
      await resetSystem();
      setConfirmResetSystem(false);
      setImportedArchive(null);
      showTimedNotice('Seluruh data sistem berhasil direset. Sistem siap dimulai dari awal.');
    } catch {
      setErrorNotice('Gagal mereset seluruh data sistem.');
    } finally {
      setIsResettingSystem(false);
    }
  };

  const activeTotalRounds = activeMatch.totalRounds === 2 ? 2 : 3;
  const activeMatchFinished = activeMatch.status === 'finished';
  const currentFinishedCount = useMemo(
    () => matches.filter((m) => m.status === 'finished').length,
    [matches]
  );

  const importedFinishedMatches = useMemo(() => {
    if (!importedArchive) return [];
    const finished = importedArchive.payload.matches.filter((m) => m.status === 'finished');
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return finished;
    return finished.filter((m) =>
      [m.matchNumber, m.stage, m.weightClass, m.blueName, m.blueContingent, m.redName, m.redContingent, m.winMethod]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [importedArchive, archiveSearch]);

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col items-center justify-center px-6 py-8 sm:py-10 relative overflow-hidden select-none caret-transparent">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.22),transparent_58%),radial-gradient(ellipse_at_bottom_left,rgba(37,99,235,0.20),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(250,204,21,0.12),transparent_52%)]"
      />

      {/* Indikator Event Aktif & Akun Google (Header Kiri Atas) */}
      <div
        data-testid="landing-access-strip"
        className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100vw-9.5rem)]"
      >
        {user ? (
          <button
            type="button"
            data-testid="landing-account-button"
            onClick={() => setShowAccountModal(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0e0620]/85 hover:bg-[#190b36] backdrop-blur-md border border-emerald-400/45 hover:border-yellow-400/75 flex items-center gap-2.5 text-left cursor-pointer shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={userProfile?.displayName || user.displayName || 'Foto Petugas'}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover border border-emerald-300/40 shrink-0"
              />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
            )}
            <div className="min-w-0 leading-tight space-y-0.5">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span>Event Aktif</span>
                <span className="text-slate-400">&middot;</span>
                <span className="text-yellow-300 truncate max-w-[160px] sm:max-w-[240px]">
                  {arena.name}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-white truncate max-w-[220px] sm:max-w-[340px]">
                {user.email || userProfile?.displayName || user.displayName}
              </div>
              <div className="text-[10px] text-blue-200/80 font-mono truncate max-w-[220px] sm:max-w-[340px]">
                {mode === 'firebase' ? 'Firestore' : 'Lokal'} &middot; {arena.id}
                {isSuperAdmin ? ' · Admin' : ''}
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            data-testid="landing-google-login-button"
            disabled={authLoading}
            onClick={() => void signInGoogle()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/12 disabled:opacity-60 border border-white/15 hover:border-yellow-400/70 flex items-center gap-2 text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            <LogIn className="w-4 h-4 text-yellow-300 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-bold text-white truncate">
                {authLoading ? 'Menghubungkan Google...' : 'Masuk Akun Google'}
              </div>
              <div className="text-[11px] text-blue-200/85 truncate">
                Mode Firestore Event Terpisah
              </div>
            </div>
          </button>
        )}
      </div>

      {authError && !showSettingsModal && (
        <div
          role="alert"
          data-testid="landing-auth-error"
          className="fixed top-16 left-4 z-30 max-w-sm rounded-xl bg-rose-950/95 border border-rose-400/70 px-3.5 py-2.5 text-xs text-rose-100 shadow-2xl flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            aria-label="Tutup pesan error login"
            className="p-0.5 text-rose-200 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <PWAInstallButton />
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
          title={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
          data-testid="landing-fullscreen-button"
          className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/15 hover:border-yellow-400/70 text-blue-100 hover:text-yellow-300 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          aria-label="Pengaturan"
          title="Pengaturan"
          data-testid="landing-settings-button"
          className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/15 hover:border-yellow-400/70 text-blue-100 hover:text-yellow-300 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="relative z-10 w-full max-w-6xl flex flex-col items-center gap-6 sm:gap-8">
        <h1 className="sr-only">JRZ Score - Realtime Digital Scoring for True Fighters</h1>

        <div className="relative flex items-center justify-center -my-6 sm:-my-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-6 rounded-full bg-[radial-gradient(circle_at_35%_48%,rgba(59,130,246,0.28),transparent_55%),radial-gradient(circle_at_65%_48%,rgba(239,68,68,0.24),transparent_55%)] blur-2xl"
          />
          <img
            src={jrzScoreLogo}
            alt="JRZ Score — Realtime Digital Scoring for True Fighters"
            className="relative z-10 w-[260px] sm:w-[340px] md:w-[400px] h-auto object-contain select-none drop-shadow-[0_14px_34px_rgba(0,0,0,0.78)] transition-transform duration-300 ease-out hover:scale-[1.02]"
          />
        </div>

        <nav
          aria-label="Menu Utama"
          className="w-full flex flex-wrap lg:flex-nowrap items-center justify-center gap-6 sm:gap-8"
        >
          {MENU_ITEMS.map(({ id, label, logoSrc }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => onSelectView(id)}
              className="group bg-transparent border-0 p-1 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 cursor-pointer"
            >
              <img
                src={logoSrc}
                alt={`Logo ${label}`}
                className="w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 xl:w-48 xl:h-48 object-contain select-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.72)]"
              />
            </button>
          ))}
        </nav>
      </div>

      {showSettingsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-settings-title"
          data-testid="landing-settings-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettingsModal(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#120726] border border-purple-500/60 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-purple-800/60 pb-3">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-yellow-300 shrink-0" />
                <h2
                  id="landing-settings-title"
                  className="font-display text-lg font-bold text-white"
                >
                  Pengaturan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Tutup pengaturan"
                className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigasi Pengaturan */}
            <div role="tablist" aria-label="Kategori Pengaturan" className="grid grid-cols-3 gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'umum'}
                data-testid="settings-tab-umum"
                onClick={() => setSettingsTab('umum')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  settingsTab === 'umum'
                    ? 'bg-yellow-400 text-black border-yellow-300'
                    : 'bg-black/55 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Umum</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'backup'}
                data-testid="settings-tab-backup"
                onClick={() => setSettingsTab('backup')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  settingsTab === 'backup'
                    ? 'bg-yellow-400 text-black border-yellow-300'
                    : 'bg-black/55 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                }`}
              >
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span>Backup &amp; Import</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'reset'}
                data-testid="settings-tab-reset"
                onClick={() => {
                  setSettingsTab('reset');
                  setConfirmResetSystem(false);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  settingsTab === 'reset'
                    ? 'bg-rose-600 text-white border-rose-400'
                    : 'bg-black/55 hover:bg-rose-950/70 text-rose-200 border-rose-700/50'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Reset Sistem</span>
              </button>
            </div>

            {settingsTab === 'umum' && (
              <div className="space-y-4">
                {/* Akun Google & Mode Cloud Firestore per Event */}
                <section
                  data-testid="settings-google-event-section"
                  className="rounded-xl bg-black/55 border border-purple-600/50 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-yellow-300">
                      Akun Google per Event (Mode Firestore)
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        user
                          ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-200'
                          : 'bg-amber-950/80 border-amber-400/60 text-amber-200'
                      }`}
                    >
                      {user ? 'Terisolasi per Akun' : 'Mode Bersama'}
                    </span>
                  </div>

                  {user ? (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">
                            {userProfile?.displayName || user.displayName || 'Panitia Event'}
                          </div>
                          <div className="text-[11px] text-blue-200 truncate">{user.email}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSettingsModal(false);
                              setShowAccountModal(true);
                            }}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-950/90 hover:bg-blue-900 border border-blue-400/50 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Profil &amp; Gabung Arena
                          </button>
                          <button
                            type="button"
                            data-testid="settings-google-logout-button"
                            onClick={() => void signOutGoogle()}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-800 border border-rose-500/50 text-[11px] font-semibold text-rose-100 cursor-pointer"
                          >
                            Keluar Google
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0d051c] border border-white/10 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">
                            ID Arena Event (Firestore)
                          </div>
                          <div className="font-mono font-bold text-emerald-300 truncate">{arena.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleCopyArenaInfo('arena')}
                            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-yellow-300 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'arena' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === 'arena' ? 'Disalin' : 'Salin ID'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyArenaInfo('link')}
                            className="px-2.5 py-1 rounded-md bg-blue-900/80 hover:bg-blue-800 border border-blue-400/40 text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'link' ? <Check className="w-3 h-3 text-emerald-300" /> : <Link2 className="w-3 h-3 text-yellow-300" />}
                            <span>{copiedKey === 'link' ? 'Link Disalin' : 'Salin Link'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs text-blue-200 leading-relaxed">
                        Login dengan Akun Google khusus panitia event agar otomatis mendapatkan ID Arena Firestore sendiri (<span className="font-mono text-yellow-300">arena-&lt;uid&gt;</span>) sehingga data pertandingan antar event tidak saling bertabrakan.
                      </p>
                      <button
                        type="button"
                        data-testid="settings-google-login-button"
                        disabled={authLoading}
                        onClick={() => void signInGoogle()}
                        className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-55 text-black text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <LogIn className="w-4 h-4 shrink-0" />
                        <span>
                          {authLoading
                            ? 'Menghubungkan Akun Google...'
                            : 'Masuk dengan Akun Google (Mode Firestore)'}
                        </span>
                      </button>
                      {authError && (
                        <div className="rounded-lg bg-rose-950/85 border border-rose-400/60 px-3 py-2 text-[11px] text-rose-100">
                          {authError}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Pilihan Gelanggang */}
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                      Pilih Gelanggang
                    </div>
                    <div className="text-[11px] text-blue-300/80">
                      {user
                        ? 'Terisolasi khusus untuk akun Google ini'
                        : 'Jalur bersama publik'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {GELANGGANG_PRESETS.map((g) => {
                      const activeCourt = resolveCourtForArenaId(arena.id, user?.uid);
                      const active = activeCourt === g.court;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={switchingArenaId === g.id}
                          onClick={() => void handleSelectGelanggang(g.id)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-yellow-400 text-black border-yellow-300'
                              : 'bg-black/60 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Identitas Gelanggang & Kejuaraan */}
                <form onSubmit={handleSaveSettings} className="space-y-3 border-t border-purple-800/60 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                    Identitas Kejuaraan
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="landing-arena-name" className="block text-[11px] text-blue-200 mb-1">
                        Nama Gelanggang
                      </label>
                      <input
                        id="landing-arena-name"
                        type="text"
                        value={arenaName}
                        onChange={(e) => setArenaName(e.target.value)}
                        maxLength={80}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="landing-tournament-name" className="block text-[11px] text-blue-200 mb-1">
                        Nama Kejuaraan
                      </label>
                      <input
                        id="landing-tournament-name"
                        type="text"
                        value={tournamentName}
                        onChange={(e) => setTournamentName(e.target.value)}
                        maxLength={120}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="landing-venue" className="block text-[11px] text-blue-200 mb-1">
                        Tempat Pelaksanaan
                      </label>
                      <input
                        id="landing-venue"
                        type="text"
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                        placeholder="Contoh: GOR Padepokan IPSI"
                        maxLength={120}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/50 text-xs focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="landing-event-date" className="block text-[11px] text-blue-200 mb-1">
                        Waktu Pelaksanaan
                      </label>
                      <input
                        id="landing-event-date"
                        type="text"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        placeholder="Contoh: 13-15 Nov 2026"
                        maxLength={80}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/50 text-xs focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="min-h-[36px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer transition-colors"
                    >
                      Simpan Identitas
                    </button>
                  </div>
                </form>

                {/* Pengaturan Babak & Durasi Partai Aktif */}
                <section className="space-y-2.5 border-t border-purple-800/60 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                      Pengaturan Waktu ({activeMatch.matchNumber})
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[2, 3].map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={activeMatchFinished}
                          onClick={() => void setMatchTotalRounds(activeMatch.id, r as 2 | 3)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-45 ${
                            activeTotalRounds === r
                              ? 'bg-yellow-400 text-black border-yellow-300'
                              : 'bg-black/60 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                          }`}
                        >
                          {r} Babak
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {DURATION_PRESETS.map((opt) => (
                      <button
                        key={opt.seconds}
                        type="button"
                        disabled={activeMatchFinished}
                        onClick={() => void setMatchRoundDuration(activeMatch.id, opt.seconds)}
                        className={`min-h-[34px] rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer disabled:opacity-45 ${
                          activeMatch.roundDurationSec === opt.seconds
                            ? 'bg-yellow-400 text-black border-yellow-300'
                            : 'bg-black/60 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Audio & Layar Penuh */}
                <section className="space-y-2.5 border-t border-purple-800/60 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                    Audio &amp; Tampilan
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSound}
                      className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        soundMuted
                          ? 'bg-black/60 border-purple-700/60 text-blue-200 hover:text-white'
                          : 'bg-blue-950/80 border-blue-500/50 text-white hover:bg-blue-900'
                      }`}
                    >
                      {soundMuted ? (
                        <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-yellow-300 shrink-0" />
                      )}
                      <span>{soundMuted ? 'Suara Gong: Mati' : 'Suara Gong: Aktif'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={soundMuted}
                      onClick={() => playArenaGong()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-black/60 hover:bg-blue-950 border border-purple-700/60 text-xs font-semibold text-blue-100 disabled:opacity-45 cursor-pointer transition-colors"
                    >
                      Tes Gong
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleFullscreen()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-black/60 hover:bg-blue-950 border border-purple-700/60 text-xs font-semibold text-blue-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                      )}
                      <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
                    </button>
                  </div>
                </section>

                {/* Keluar Sesi Aplikasi */}
                <section className="border-t border-purple-800/60 pt-4 flex items-center justify-end">
                  <button
                    type="button"
                    data-testid="landing-logout-button"
                    onClick={() => {
                      setShowSettingsModal(false);
                      void logoutPortal();
                    }}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Keluar</span>
                  </button>
                </section>
              </div>
            )}

            {settingsTab === 'backup' && (
              <div className="space-y-4">
                {/* Backup Event Saat Ini */}
                <section className="rounded-xl bg-black/55 border border-blue-500/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-display text-sm font-bold text-yellow-300">
                        Backup Arsip Event
                      </h3>
                      <p className="text-xs text-blue-200 leading-relaxed">
                        Simpan seluruh data atlet, bagan bracket, jadwal, skor, dan log pertandingan event saat ini sebagai file arsip JSON sebelum melakukan reset atau pergantian kejuaraan.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isExportingBackup}
                      data-testid="landing-backup-download-btn"
                      onClick={() => void handleDownloadBackup()}
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>{isExportingBackup ? 'Menyiapkan...' : 'Download Backup (.json)'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                    <div className="rounded-lg bg-[#110624]/90 border border-purple-800/50 px-2 py-1.5">
                      <div className="text-[10px] uppercase text-blue-200">Total Partai</div>
                      <div className="font-mono text-sm font-bold text-white">{matches.length}</div>
                    </div>
                    <div className="rounded-lg bg-[#110624]/90 border border-purple-800/50 px-2 py-1.5">
                      <div className="text-[10px] uppercase text-blue-200">Partai Selesai</div>
                      <div className="font-mono text-sm font-bold text-emerald-300">{currentFinishedCount}</div>
                    </div>
                    <div className="rounded-lg bg-[#110624]/90 border border-purple-800/50 px-2 py-1.5">
                      <div className="text-[10px] uppercase text-blue-200">Data Atlet</div>
                      <div className="font-mono text-sm font-bold text-white">{athletes.length}</div>
                    </div>
                    <div className="rounded-lg bg-[#110624]/90 border border-purple-800/50 px-2 py-1.5">
                      <div className="text-[10px] uppercase text-blue-200">Slot Bagan</div>
                      <div className="font-mono text-sm font-bold text-white">{brackets.length}</div>
                    </div>
                  </div>
                </section>

                {/* Import & Lihat Arsip Event Sebelumnya */}
                <section className="rounded-xl bg-black/55 border border-purple-600/50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-display text-sm font-bold text-white">
                        Import &amp; Arsip Event Sebelumnya
                      </h3>
                      <p className="text-xs text-blue-200">
                        Buka file backup (.json) untuk melihat daftar pertandingan selesai, unduh berita acara PDF, atau pulihkan penuh ke sistem.
                      </p>
                    </div>
                    <label
                      htmlFor="landing-archive-import-input"
                      data-testid="landing-archive-import-label"
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-400/60 text-white text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4 text-yellow-300 shrink-0" />
                      <span>Pilih File Arsip (.json)</span>
                    </label>
                    <input
                      id="landing-archive-import-input"
                      data-testid="landing-archive-import-input"
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => void handleArchiveFileChange(e)}
                      className="sr-only"
                    />
                  </div>

                  {importedArchive && (
                    <div
                      data-testid="landing-imported-archive-preview"
                      className="rounded-xl bg-[#0b0419] border border-purple-500/50 p-3.5 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-purple-800/60 pb-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-yellow-300 truncate">
                            {importedArchive.summary.tournamentName}
                          </div>
                          <div className="text-[11px] text-blue-200">
                            {importedArchive.summary.arenaName}
                            {importedArchive.summary.venue ? ` · ${importedArchive.summary.venue}` : ''}
                            {importedArchive.summary.eventDate ? ` · ${importedArchive.summary.eventDate}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={importedArchive.summary.finishedMatches === 0}
                            onClick={() =>
                              exportArenaSummaryPdf(
                                importedArchive.payload.arena,
                                importedArchive.payload.matches.filter((m) => m.status === 'finished'),
                                {
                                  title: 'ARSIP HASIL PERTANDINGAN SELESAI',
                                  fileNamePrefix: 'Arsip_Hasil_Tanding',
                                }
                              )
                            }
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-950/85 hover:bg-yellow-400 hover:text-black disabled:opacity-45 border border-blue-500/45 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <FileDown className="w-3.5 h-3.5 shrink-0" />
                            <span>Semua PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreArchive(true)}
                            data-testid="landing-archive-restore-trigger"
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer transition-colors"
                          >
                            Pulihkan ke Sistem
                          </button>
                        </div>
                      </div>

                      {confirmRestoreArchive && (
                        <div className="rounded-lg bg-amber-950/75 border border-amber-400/60 p-3 space-y-2">
                          <p className="text-xs text-amber-100">
                            Memulihkan arsip akan mengganti seluruh data aktif saat ini dengan data event{' '}
                            <strong className="text-yellow-300">{importedArchive.summary.tournamentName}</strong>. Lanjutkan?
                          </p>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreArchive(false)}
                              className="px-3 py-1 rounded-lg bg-black/60 text-blue-100 text-xs font-semibold cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              disabled={isRestoringArchive}
                              data-testid="landing-archive-restore-confirm"
                              onClick={() => void handleRestoreImportedArchive()}
                              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                              {isRestoringArchive ? 'Memulihkan...' : 'Ya, Pulihkan Event'}
                            </button>
                          </div>
                        </div>
                      )}

                      {importedArchive.summary.finishedMatches > 0 ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-blue-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={archiveSearch}
                              onChange={(e) => setArchiveSearch(e.target.value)}
                              aria-label="Cari partai selesai di arsip"
                              placeholder={`Cari dari ${importedArchive.summary.finishedMatches} partai selesai...`}
                              className="w-full min-h-[34px] pl-8 pr-3 py-1 rounded-lg bg-black/65 border border-blue-500/40 text-xs text-white placeholder:text-blue-300/50 focus:outline-none focus:border-yellow-400"
                            />
                          </div>

                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {importedFinishedMatches.map((m) => (
                              <div
                                key={m.id}
                                className="rounded-lg bg-black/60 border border-purple-800/50 px-2.5 py-2 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                  <div className="flex items-center gap-1.5 min-w-0 text-blue-200">
                                    <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/45 text-yellow-300 font-mono font-bold shrink-0">
                                      {m.matchNumber}
                                    </span>
                                    <span className="truncate">{m.stage} · {m.weightClass}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      exportMatchPdf(
                                        importedArchive.payload.arena,
                                        m,
                                        importedArchive.payload.eventsByMatch[m.id] || []
                                      )
                                    }
                                    className="px-2 py-0.5 rounded bg-blue-950 hover:bg-yellow-400 hover:text-black border border-blue-500/40 text-[10px] font-bold text-white flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                                  >
                                    <FileDown className="w-3 h-3" />
                                    <span>PDF</span>
                                  </button>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-blue-200 font-semibold truncate flex items-center gap-1">
                                    {m.winner === 'blue' && <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />}
                                    <span className="truncate">{m.blueName}</span>
                                  </span>
                                  <span className="font-mono font-bold text-white shrink-0">
                                    {formatMatchScore(m, 'blue')} - {formatMatchScore(m, 'red')}
                                  </span>
                                  <span className="text-red-200 font-semibold truncate flex items-center justify-end gap-1">
                                    <span className="truncate">{m.redName}</span>
                                    {m.winner === 'red' && <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />}
                                  </span>
                                </div>
                                {m.winMethod && (
                                  <div className="text-[10px] text-yellow-300/85 text-center">
                                    {m.winMethod}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-blue-200 text-center py-3">
                          File arsip ini berisi {importedArchive.summary.totalMatches} partai, namun belum ada partai berstatus selesai. Anda tetap dapat memulihkannya ke sistem.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {settingsTab === 'reset' && (
              <section className="rounded-xl bg-rose-950/35 border border-rose-500/55 p-4 space-y-3.5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="font-display text-base font-bold text-white">
                      Reset Total Sistem
                    </h3>
                    <p className="text-xs text-rose-100/90 leading-relaxed">
                      Tindakan ini akan menghapus dan mengosongkan seluruh data yang tersimpan agar sistem benar-benar dimulai dari awal kembali, mencakup:
                    </p>
                    <ul className="text-xs text-blue-100 list-disc list-inside space-y-0.5 pt-1">
                      <li>Seluruh data atlet terdaftar ({athletes.length} atlet)</li>
                      <li>Seluruh jadwal partai, hasil skor, log kejadian, dan pelanggaran ({matches.length} partai)</li>
                      <li>Seluruh bagan bracket pertandingan ({brackets.length} slot)</li>
                      <li>Identitas kejuaraan &amp; penyimpanan sinkronisasi lokal/database</li>
                    </ul>
                  </div>
                </div>

                {!confirmResetSystem ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSettingsTab('backup')}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-black/60 hover:bg-blue-950 border border-blue-500/45 text-xs font-semibold text-blue-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                      <span>Backup Data Dulu</span>
                    </button>
                    <button
                      type="button"
                      data-testid="landing-reset-system-trigger"
                      onClick={() => setConfirmResetSystem(true)}
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      <span>Reset Sistem</span>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/70 border border-rose-400/70 p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-rose-200">
                      Konfirmasi akhir: Semua data atlet, jadwal, bagan, dan skor akan dihapus permanen. Pastikan Anda sudah membuat backup jika masih diperlukan.
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isResettingSystem}
                        onClick={() => setConfirmResetSystem(false)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/40 text-xs font-semibold text-white cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={isResettingSystem}
                        data-testid="landing-reset-system-confirm"
                        onClick={() => void handleConfirmResetSystem()}
                        className="min-h-[36px] px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                      >
                        {isResettingSystem ? 'Mereset Sistem...' : 'Ya, Hapus Semua & Mulai Dari Awal'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {errorNotice && (
              <div
                role="alert"
                className="rounded-xl bg-rose-950/85 border border-rose-400/65 px-3 py-2 text-xs text-rose-100 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{errorNotice}</span>
              </div>
            )}

            {savedNotice && (
              <div
                role="status"
                className="rounded-xl bg-emerald-950/85 border border-emerald-400/65 px-3 py-2 text-xs text-emerald-100 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{savedNotice}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {showLimitedNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="limited-mode-notice-title"
          data-testid="limited-mode-password-notice-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#120726] border border-amber-400/60 p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-yellow-300" />
            </div>
            <div className="space-y-2">
              <h2
                id="limited-mode-notice-title"
                className="font-display text-lg font-extrabold text-white"
              >
                Aktifkan Akses Penuh Juri
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                Aplikasi saat ini berjalan dalam <strong className="text-yellow-300">mode terbatas</strong> (hanya Juri 1 aktif). Silakan lakukan input password melalui <strong className="text-white">Panel Juri</strong> untuk membuka seluruh kursi Juri (1–3 Tanding &amp; 1–10 Jurus).
              </p>
              <p className="text-[11px] text-slate-300">
                Hubungi WhatsApp 081379876424 untuk akses penuh aplikasi.
              </p>
            </div>
            <button
              type="button"
              data-testid="limited-mode-notice-ok-btn"
              onClick={handleAcknowledgeLimitedNotice}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:scale-[0.99] text-black text-sm font-extrabold cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
            >
              Oke
            </button>
          </div>
        </div>
      )}
      <AccountSessionModal open={showAccountModal} onClose={() => setShowAccountModal(false)} />
    </main>
  );
}
