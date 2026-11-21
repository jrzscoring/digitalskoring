import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileDown,
  GitBranch,
  History,
  ImagePlus,
  ListChecks,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';
import {
  JURUS_JUDGE_COUNT_OPTIONS,
  formatMatchScore,
  getJurusJudgeCount,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import { exportArenaSummaryPdf, exportMatchPdf } from '../utils/pdfExport';
import {
  BaganBracketPanel,
  InputAtletPanel,
  KontrolPartaiPanel,
} from './RegistrasiDataPanels';
import {
  JadwalPertandinganPanel,
  PerolehanMedaliPanel,
  RekapAtletPanel,
} from './LaporanPanels';

type SekretarisSection =
  | 'identitas'
  | 'input-atlet'
  | 'bagan-bracket'
  | 'kontrol-partai'
  | 'laporan-medali'
  | 'laporan-atlet'
  | 'laporan-jadwal';

interface SekretarisViewProps {
  onNavigate: (view: AppView) => void;
}

function extractGenderLabel(weightClass?: string): string {
  const v = (weightClass || '').toLowerCase();
  if (v.includes('putri')) return 'Putri';
  if (v.includes('putra')) return 'Putra';
  return '';
}

function readAndResizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const maxSide = 160;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function SekretarisView({ onNavigate }: SekretarisViewProps) {
  const {
    mode,
    syncError,
    arena,
    matches,
    activeMatch,
    getMatchEvents,
    updateArenaMeta,
    setActiveMatch,
    setMatchJurusJudgeCount,
    resetMatch,
  } = useArena();

  const [tournamentName, setTournamentName] = useState(arena.tournamentName);
  const [venue, setVenue] = useState(arena.venue || '');
  const [eventDate, setEventDate] = useState(arena.eventDate || '');
  const [logoLeft, setLogoLeft] = useState(arena.logoLeft || '');
  const [logoRight, setLogoRight] = useState(arena.logoRight || '');
  const [arenaSaved, setArenaSaved] = useState(false);

  const [historySearch, setHistorySearch] = useState('');
  const [showAllReadyModal, setShowAllReadyModal] = useState(false);
  const [readyModalSearch, setReadyModalSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResetMatchModal, setShowResetMatchModal] = useState(false);
  const [isResettingMatch, setIsResettingMatch] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<SekretarisSection>('identitas');
  const [registrasiMenuOpen, setRegistrasiMenuOpen] = useState(false);
  const [laporanMenuOpen, setLaporanMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const laporanContainerRef = useRef<HTMLDivElement>(null);

  const isRegistrasiSection =
    activeSection === 'input-atlet' ||
    activeSection === 'bagan-bracket' ||
    activeSection === 'kontrol-partai';
  const isLaporanSection =
    activeSection === 'laporan-medali' ||
    activeSection === 'laporan-atlet' ||
    activeSection === 'laporan-jadwal';

  const finishedMatches = useMemo(() => {
    return matches
      .filter((m) => m.status === 'finished' || Boolean(m.winner))
      .slice()
      .reverse()
      .sort((a, b) => (b.finishedAtMs || 0) - (a.finishedAtMs || 0));
  }, [matches]);

  const filteredFinishedMatches = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return finishedMatches;
    return finishedMatches.filter((m) =>
      [
        m.matchNumber,
        m.stage,
        m.weightClass,
        m.blueName,
        m.blueContingent,
        m.redName,
        m.redContingent,
        m.winMethod,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [finishedMatches, historySearch]);

  const readyMatches = useMemo(() => {
    return matches.filter((m) => m.status !== 'finished' && !m.winner);
  }, [matches]);

  const topFiveReadyMatches = useMemo(() => readyMatches.slice(0, 5), [readyMatches]);

  const filteredReadyMatchesModal = useMemo(() => {
    const q = readyModalSearch.trim().toLowerCase();
    if (!q) return readyMatches;
    return readyMatches.filter((m) =>
      [
        m.matchNumber,
        m.stage,
        m.weightClass,
        m.blueName,
        m.blueContingent,
        m.redName,
        m.redContingent,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [readyMatches, readyModalSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setRegistrasiMenuOpen(false);
      }
      if (
        laporanContainerRef.current &&
        !laporanContainerRef.current.contains(event.target as Node)
      ) {
        setLaporanMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRegistrasiMenuOpen(false);
        setLaporanMenuOpen(false);
        setShowAllReadyModal(false);
        if (!isResettingMatch) {
          setShowResetMatchModal(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen denial in sandbox/headless environments
    }
  };

  useEffect(() => {
    setTournamentName(arena.tournamentName);
    setVenue(arena.venue || '');
    setEventDate(arena.eventDate || '');
    setLogoLeft(arena.logoLeft || '');
    setLogoRight(arena.logoRight || '');
  }, [arena.tournamentName, arena.venue, arena.eventDate, arena.logoLeft, arena.logoRight]);

  const handleSaveArena = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateArenaMeta({
      tournamentName,
      venue,
      eventDate,
      logoLeft,
      logoRight,
    });
    setArenaSaved(true);
    setTimeout(() => setArenaSaved(false), 1800);
  };

  const handleLogoChange = async (
    side: 'left' | 'right',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await readAndResizeLogo(file);
      if (side === 'left') {
        setLogoLeft(resized);
      } else {
        setLogoRight(resized);
      }
    } catch {
      // ignore invalid file
    } finally {
      e.target.value = '';
    }
  };

  const activeMatchEvents = useMemo(
    () => getMatchEvents(activeMatch.id),
    [getMatchEvents, activeMatch.id]
  );

  const activeViolationsCount =
    activeMatch.blueBinaan +
    activeMatch.blueTeguran1 +
    activeMatch.blueTeguran2 +
    activeMatch.bluePeringatan +
    activeMatch.redBinaan +
    activeMatch.redTeguran1 +
    activeMatch.redTeguran2 +
    activeMatch.redPeringatan;

  const handleConfirmResetMatch = async () => {
    setIsResettingMatch(true);
    try {
      await resetMatch(activeMatch.id);
      setShowResetMatchModal(false);
      setResetSuccessMsg(
        `${activeMatch.matchNumber} (${activeMatch.blueName} vs ${activeMatch.redName}) telah direset ke awal (Skor 0 - 0, Babak 1, Pelanggaran & Log kosong).`
      );
      window.setTimeout(() => setResetSuccessMsg(null), 5000);
    } finally {
      setIsResettingMatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col">
      <main
        className={`flex-1 w-full mx-auto ${
          isFullscreen
            ? 'max-w-none px-2 sm:px-3 py-1.5 sm:py-2 space-y-2.5'
            : 'max-w-[1600px] px-3 sm:px-5 py-3 sm:py-4 space-y-4'
        }`}
      >
        {syncError && (
          <div role="alert" className="px-4 py-3 rounded-xl bg-red-950/80 border border-red-500/70 text-red-100 text-sm">
            {syncError}
          </div>
        )}

        {/* Top Unified Navbar: Kembali (Kiri) | Laporan & Registrasi Data (Tengah) | Full Screen (Kanan) */}
        <section
          className={`flex flex-wrap items-center justify-between gap-2.5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center border-b border-purple-800/60 ${
            isFullscreen ? 'pb-2.5' : 'pb-3.5'
          }`}
        >
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              aria-label="Kembali ke Menu Utama"
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-yellow-300" />
              <span>Kembali</span>
            </button>
          </div>

          <nav
            aria-label="Menu Aksi Sekretaris"
            className="w-full sm:w-auto order-3 sm:order-2 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5"
          >
            {activeSection !== 'identitas' && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('identitas');
                  setRegistrasiMenuOpen(false);
                  setLaporanMenuOpen(false);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 hover:border-yellow-400 text-white font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
              >
                <ClipboardList className="w-4 h-4 text-yellow-300" />
                <span>Identitas &amp; Partai</span>
              </button>
            )}
            <div ref={laporanContainerRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={laporanMenuOpen}
                onClick={() => {
                  setLaporanMenuOpen((prev) => !prev);
                  setRegistrasiMenuOpen(false);
                }}
                className={`min-h-[42px] px-4 py-2 rounded-xl border font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                  isLaporanSection || laporanMenuOpen
                    ? 'bg-yellow-400/15 border-yellow-400 text-yellow-300'
                    : 'bg-blue-950/80 hover:bg-blue-900 border-blue-500/45 hover:border-yellow-400 text-white'
                }`}
              >
                <Award className="w-4 h-4 text-yellow-300" />
                <span>Laporan</span>
                <ChevronDown
                  className={`w-4 h-4 text-yellow-300 transition-transform ${
                    laporanMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {laporanMenuOpen && (
                <div
                  role="menu"
                  aria-label="Submenu Laporan"
                  className="absolute left-0 mt-2 w-60 rounded-xl bg-[#120626] border border-blue-500/50 shadow-2xl py-1.5 z-40"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('laporan-medali');
                      setLaporanMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'laporan-medali'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <Award className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Perolehan Medali</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('laporan-atlet');
                      setLaporanMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'laporan-atlet'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <Users className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Rekap Data Atlet</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('laporan-jadwal');
                      setLaporanMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'laporan-jadwal'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <CalendarDays className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Jadwal Pertandingan</span>
                  </button>
                </div>
              )}
            </div>

            <div ref={menuContainerRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={registrasiMenuOpen}
                onClick={() => {
                  setRegistrasiMenuOpen((prev) => !prev);
                  setLaporanMenuOpen(false);
                }}
                className={`min-h-[42px] px-4 py-2 rounded-xl border font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                  isRegistrasiSection || registrasiMenuOpen
                    ? 'bg-yellow-400/15 border-yellow-400 text-yellow-300'
                    : 'bg-blue-950/80 hover:bg-blue-900 border-blue-500/45 hover:border-yellow-400 text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4 text-yellow-300" />
                <span>Registrasi Data</span>
                <ChevronDown
                  className={`w-4 h-4 text-yellow-300 transition-transform ${
                    registrasiMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {registrasiMenuOpen && (
                <div
                  role="menu"
                  aria-label="Submenu Registrasi Data"
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-[#120626] border border-blue-500/50 shadow-2xl py-1.5 z-40"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('input-atlet');
                      setRegistrasiMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'input-atlet'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <UserPlus className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Input Atlet</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('bagan-bracket');
                      setRegistrasiMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'bagan-bracket'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <GitBranch className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Bagan Bracket</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSection('kontrol-partai');
                      setRegistrasiMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'kontrol-partai'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <ListChecks className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Kontrol Partai</span>
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className="order-2 sm:order-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-yellow-300" />
              ) : (
                <Maximize2 className="w-4 h-4 text-yellow-300" />
              )}
              <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
            </button>
          </div>
        </section>

        {activeSection === 'input-atlet' ? (
          <InputAtletPanel />
        ) : activeSection === 'bagan-bracket' ? (
          <BaganBracketPanel />
        ) : activeSection === 'kontrol-partai' ? (
          <KontrolPartaiPanel />
        ) : activeSection === 'laporan-medali' ? (
          <PerolehanMedaliPanel />
        ) : activeSection === 'laporan-atlet' ? (
          <RekapAtletPanel />
        ) : activeSection === 'laporan-jadwal' ? (
          <JadwalPertandinganPanel />
        ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-2 items-start ${isFullscreen ? 'gap-3.5' : 'gap-5'}`}>
          {/* Kolom Kiri: Identitas Kejuaraan + Inisialisasi & Reset Pertandingan */}
          <div className="space-y-5">
          <form onSubmit={handleSaveArena} className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-4">
            <h2 className="font-display text-xl font-bold text-yellow-300">Identitas Kejuaraan</h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="tournament-name" className="block text-xs font-medium text-blue-200 mb-1">
                  Nama Kejuaraan
                </label>
                <input
                  id="tournament-name"
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  maxLength={120}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/60 text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="venue-input" className="block text-xs font-medium text-blue-200 mb-1">
                    Tempat Pelaksanaan
                  </label>
                  <input
                    id="venue-input"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="Contoh: GOR Padepokan IPSI"
                    maxLength={120}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/60 text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label htmlFor="event-date-input" className="block text-xs font-medium text-blue-200 mb-1">
                    Waktu Pelaksanaan
                  </label>
                  <input
                    id="event-date-input"
                    type="text"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder="Contoh: 13-15 Nov 2026 · 08.00 WIB"
                    maxLength={80}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/60 text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-black/65 border border-blue-500/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-blue-200">Logo Sisi Kiri</span>
                    {logoLeft && (
                      <button
                        type="button"
                        onClick={() => setLogoLeft('')}
                        aria-label="Hapus Logo Sisi Kiri"
                        className="text-xs text-yellow-300 hover:text-yellow-200 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {logoLeft ? (
                      <img
                        src={logoLeft}
                        alt="Pratinjau Logo Kiri"
                        className="w-12 h-12 object-contain rounded-lg bg-[#0d051c] border border-blue-500/45 p-1 shrink-0"
                      />
                    ) : null}
                    <label
                      htmlFor="logo-left-input"
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-yellow-300" />
                      <span>{logoLeft ? 'Ganti Logo' : 'Pilih Logo Kiri'}</span>
                    </label>
                    <input
                      id="logo-left-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleLogoChange('left', e)}
                      className="sr-only"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/65 border border-blue-500/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-blue-200">Logo Sisi Kanan</span>
                    {logoRight && (
                      <button
                        type="button"
                        onClick={() => setLogoRight('')}
                        aria-label="Hapus Logo Sisi Kanan"
                        className="text-xs text-yellow-300 hover:text-yellow-200 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {logoRight ? (
                      <img
                        src={logoRight}
                        alt="Pratinjau Logo Kanan"
                        className="w-12 h-12 object-contain rounded-lg bg-[#0d051c] border border-blue-500/45 p-1 shrink-0"
                      />
                    ) : null}
                    <label
                      htmlFor="logo-right-input"
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-yellow-300" />
                      <span>{logoRight ? 'Ganti Logo' : 'Pilih Logo Kanan'}</span>
                    </label>
                    <input
                      id="logo-right-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleLogoChange('right', e)}
                      className="sr-only"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold whitespace-nowrap cursor-pointer transition-colors"
              >
                {arenaSaved ? 'Tersimpan & Tersinkron' : 'Simpan Identitas'}
              </button>
            </div>
          </form>

          {/* Inisialisasi & Reset Pertandingan */}
          <section
            aria-label="Inisialisasi dan Reset Pertandingan"
            data-testid="sekretaris-reset-section"
            className="rounded-2xl bg-[#0d051c]/90 border border-rose-500/50 p-5 space-y-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-400 shrink-0" />
                  <h2 className="font-display text-lg font-bold text-white leading-tight">
                    Inisialisasi Pertandingan Baru
                  </h2>
                </div>
                <p className="text-xs text-blue-200 leading-relaxed">
                  Mengosongkan seluruh data skor, babak, timer, vote juri, dan pelanggaran partai aktif pada{' '}
                  {mode === 'firebase' ? 'Firebase Firestore' : mode === 'rtdb' ? 'Firebase Realtime Database' : 'penyimpanan sinkronisasi'} untuk memulai pertandingan baru.
                </p>
              </div>

              <button
                type="button"
                data-testid="sekretaris-reset-pertandingan-btn"
                onClick={() => setShowResetMatchModal(true)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-300/70 text-white text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-rose-950/50 transition-colors"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Reset Pertandingan</span>
              </button>
            </div>

            <div className="rounded-xl bg-black/60 border border-purple-700/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 font-mono font-bold shrink-0">
                    {activeMatch.matchNumber}
                  </span>
                  <span className="font-semibold text-white truncate">
                    {activeMatch.blueName} vs {activeMatch.redName}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-blue-200 shrink-0">
                  {activeMatch.stage}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-purple-800/50 text-center">
                <div className="rounded-lg bg-[#110624]/80 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-blue-200">Skor Aktif</div>
                  <div
                    data-testid="sekretaris-active-score-summary"
                    className="font-mono text-sm font-extrabold text-white tabular-nums"
                  >
                    {formatMatchScore(activeMatch, 'blue')} - {formatMatchScore(activeMatch, 'red')}
                  </div>
                </div>
                <div className="rounded-lg bg-[#110624]/80 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-blue-200">Babak</div>
                  <div
                    data-testid="sekretaris-active-round-summary"
                    className="font-mono text-sm font-extrabold text-yellow-300 tabular-nums"
                  >
                    Babak {activeMatch.currentRound}
                  </div>
                </div>
                <div className="rounded-lg bg-[#110624]/80 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-blue-200">Pelanggaran / Log</div>
                  <div
                    data-testid="sekretaris-active-violations-summary"
                    className="font-mono text-sm font-extrabold text-rose-300 tabular-nums"
                  >
                    {activeViolationsCount} / {activeMatchEvents.length}
                  </div>
                </div>
              </div>

              {isJurusMatch(activeMatch) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-800/50">
                  <div className="text-xs font-semibold text-yellow-300">
                    Jumlah Juri Bertugas (Jurus {getJurusType(activeMatch)})
                  </div>
                  <select
                    aria-label="Jumlah Juri Jurus Partai Aktif"
                    data-testid="sekretaris-overview-jurus-judge-count"
                    value={activeMatch.jurusJudgeCount ?? 3}
                    disabled={activeMatch.status === 'finished'}
                    onChange={(e) =>
                      void setMatchJurusJudgeCount(activeMatch.id, Number(e.target.value))
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-black/75 border border-yellow-400/60 text-xs font-bold text-yellow-300 focus:outline-none focus:border-yellow-300 disabled:opacity-50 cursor-pointer"
                  >
                    {!activeMatch.jurusJudgeCount && (
                      <option value={3}>3 Juri (Awal — Pilih 4–10)</option>
                    )}
                    {JURUS_JUDGE_COUNT_OPTIONS.map((cnt) => (
                      <option key={cnt} value={cnt}>
                        {cnt} Juri
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {resetSuccessMsg && (
              <div
                role="status"
                data-testid="sekretaris-reset-success-banner"
                className="rounded-xl bg-emerald-950/85 border border-emerald-400/65 px-3 py-2 text-xs text-emerald-100 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{resetSuccessMsg}</span>
              </div>
            )}
          </section>
          </div>

          {/* Kolom Kanan: Histori Hasil Tanding + Daftar Partai Siap Bertanding */}
          <div className="space-y-6">
          {/* Histori Hasil Tanding */}
          <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-purple-800/60">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-yellow-300 shrink-0" />
                <div>
                  <h2 className="font-display text-lg font-bold text-yellow-300 leading-tight">Histori Hasil Tanding</h2>
                  <p className="text-[11px] text-blue-200">
                    {finishedMatches.length} partai telah selesai bertanding
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={finishedMatches.length === 0}
                onClick={() =>
                  exportArenaSummaryPdf(arena, finishedMatches, {
                    title: 'HISTORI HASIL PERTANDINGAN SELESAI',
                    fileNamePrefix: 'Histori_Hasil_Tanding',
                  })
                }
                aria-label="Unduh Semua Hasil Partai Selesai (PDF)"
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  finishedMatches.length === 0
                    ? 'bg-black/50 text-blue-300/50 border border-blue-900/50 cursor-not-allowed'
                    : 'bg-yellow-400 hover:bg-yellow-300 text-black cursor-pointer'
                }`}
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Unduh Semua (PDF)</span>
              </button>
            </div>

            {finishedMatches.length > 0 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-blue-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  aria-label="Cari histori hasil tanding"
                  placeholder="Cari partai, pesilat, kontingen, atau kelas..."
                  className="w-full min-h-[36px] pl-8 pr-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
                />
              </div>
            )}

            {finishedMatches.length === 0 ? (
              <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-6 text-center text-xs text-blue-200">
                Belum ada partai yang selesai bertanding. Partai yang telah disahkan pemenangnya oleh Dewan akan tampil di sini dan dapat diunduh per partai maupun sekaligus.
              </div>
            ) : filteredFinishedMatches.length === 0 ? (
              <div className="rounded-xl bg-black/55 border border-purple-700/60 p-5 text-center text-xs text-blue-200">
                Tidak ada partai selesai yang cocok dengan pencarian &ldquo;{historySearch}&rdquo;.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {filteredFinishedMatches.map((m) => (
                  <article
                    key={m.id}
                    className="rounded-lg bg-black/65 border border-purple-700/50 px-2.5 py-1.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] leading-tight">
                      <div className="flex items-center gap-1.5 text-blue-200 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 font-mono font-bold shrink-0">
                          {m.matchNumber}
                        </span>
                        <span className="shrink-0">{m.stage}</span>
                        <span aria-hidden="true" className="shrink-0">&middot;</span>
                        <span className="truncate">{m.weightClass}</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-400/60 text-blue-200 font-mono text-[10px] uppercase shrink-0">
                          Selesai
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => exportMatchPdf(arena, m, getMatchEvents(m.id))}
                        aria-label={`Unduh Hasil ${m.matchNumber}`}
                        className="min-h-[26px] px-2 py-0.5 rounded-md bg-blue-950/85 hover:bg-yellow-400 hover:text-black border border-blue-500/45 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                      >
                        <FileDown className="w-3 h-3 shrink-0" />
                        <span>Unduh Partai</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 items-center">
                      <div
                        className={`px-2 py-1 rounded border flex items-center justify-between gap-1.5 min-w-0 ${
                          m.winner === 'blue'
                            ? 'bg-blue-950/85 border-blue-400'
                            : 'bg-blue-950/45 border-blue-700/60'
                        }`}
                      >
                        <div className="min-w-0 leading-tight">
                          <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                            {m.winner === 'blue' && <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />}
                            <span className="truncate">{m.blueName}</span>
                          </div>
                          <div className="text-[10px] text-blue-200/85 truncate">{m.blueContingent}</div>
                        </div>
                        <span className="font-mono font-bold text-sm text-blue-200 tabular-nums shrink-0">
                          {formatMatchScore(m, 'blue')}
                        </span>
                      </div>

                      <div className="text-center text-[10px] font-mono text-yellow-300/80 px-0.5">
                        vs
                      </div>

                      <div
                        className={`px-2 py-1 rounded border flex items-center justify-between gap-1.5 min-w-0 ${
                          m.winner === 'red'
                            ? 'bg-red-950/85 border-red-400'
                            : 'bg-red-950/45 border-red-700/60'
                        }`}
                      >
                        <div className="min-w-0 leading-tight">
                          <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                            {m.winner === 'red' && <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />}
                            <span className="truncate">{m.redName}</span>
                          </div>
                          <div className="text-[10px] text-red-200/85 truncate">{m.redContingent}</div>
                        </div>
                        <span className="font-mono font-bold text-sm text-red-200 tabular-nums shrink-0">
                          {formatMatchScore(m, 'red')}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Daftar 5 Partai Teratas Siap Bertanding (Di kolom kanan tepat di bawah Histori Hasil Tanding) */}
          <section
            aria-label="Daftar Partai Siap Bertanding"
            data-testid="ready-matches-section"
            className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-purple-800/60">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-yellow-300 shrink-0" />
                <div>
                  <h2 className="font-display text-lg font-bold text-yellow-300 leading-tight">
                    Daftar Partai Siap Bertanding
                  </h2>
                  <p className="text-[11px] text-blue-200">
                    5 partai teratas yang belum selesai ({readyMatches.length} total)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReadyModalSearch('');
                  setShowAllReadyModal(true);
                }}
                data-testid="open-all-ready-matches-btn"
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Lihat Semua Partai ({readyMatches.length})</span>
              </button>
            </div>

            {topFiveReadyMatches.length === 0 ? (
              <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-6 text-center text-xs text-blue-200">
                Tidak ada partai yang menunggu atau sedang bertanding. Buat partai baru melalui menu{' '}
                <button
                  type="button"
                  onClick={() => setActiveSection('kontrol-partai')}
                  className="text-yellow-300 underline font-semibold cursor-pointer"
                >
                  Registrasi Data &rarr; Kontrol Partai
                </button>
                .
              </div>
            ) : (
              <div className="space-y-1.5">
                {topFiveReadyMatches.map((m) => {
                  const isActive = m.id === activeMatch.id;
                  const isJurus = isJurusMatch(m);
                  const genderLabel = extractGenderLabel(m.weightClass);
                  const statusBadge =
                    m.status === 'active'
                      ? 'Berjalan'
                      : m.status === 'paused'
                      ? 'Dijeda'
                      : m.status === 'break'
                      ? 'Istirahat'
                      : 'Siap';

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void setActiveMatch(m.id)}
                      data-testid={`ready-match-card-${m.id}`}
                      className={`w-full rounded-lg px-2.5 py-2 border text-left space-y-1.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-950/90 via-[#120626] to-red-950/50 border-2 border-yellow-400 shadow-md shadow-yellow-400/10'
                          : 'bg-black/65 border-purple-700/60 hover:border-yellow-400/80 hover:bg-blue-950/35'
                      }`}
                    >
                      {/* Baris 1: Partai, Kategori, Babak, Jenis Kelamin dalam satu baris horizontal */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-x-auto text-[11px] leading-tight min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 font-mono font-bold shrink-0">
                            {m.matchNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                              isJurus
                                ? 'bg-purple-800/85 text-yellow-300'
                                : 'bg-blue-900/85 text-blue-100'
                            }`}
                          >
                            {isJurus ? `Jurus · ${getJurusType(m)} (${getJurusJudgeCount(m)} Juri)` : 'Tanding'}
                          </span>
                          <span className="text-white font-semibold shrink-0">{m.stage}</span>
                          {genderLabel && (
                            <>
                              <span aria-hidden="true" className="text-blue-400 shrink-0">&middot;</span>
                              <span className="text-blue-200 font-semibold shrink-0">{genderLabel}</span>
                            </>
                          )}
                        </div>

                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${
                            isActive
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-purple-950/80 border-purple-500/50 text-blue-200'
                          }`}
                        >
                          {isActive ? 'Aktif' : statusBadge}
                        </span>
                      </div>

                      {/* Baris 2: Kedua Sudut Horizontal (Kiri Sudut Biru, Kanan Sudut Merah) */}
                      <div className="grid grid-cols-2 gap-1.5 w-full">
                        <div className="rounded-md bg-blue-950/60 border border-blue-500/40 px-2 py-1 min-w-0">
                          <div className="text-[11px] font-bold text-white leading-tight truncate">{m.blueName}</div>
                          <div className="text-[9px] text-blue-200/80 leading-tight truncate">{m.blueContingent}</div>
                        </div>
                        <div className="rounded-md bg-red-950/60 border border-red-500/40 px-2 py-1 min-w-0 text-right">
                          <div className="text-[11px] font-bold text-white leading-tight truncate">{m.redName}</div>
                          <div className="text-[9px] text-red-200/80 leading-tight truncate">{m.redContingent}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          </div>
        </div>
        )}
      </main>

      {/* Banner Pop-Up Semua Partai yang Akan Bertanding */}
      {showAllReadyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Semua Partai yang Akan Bertanding"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
        >
          <div className="max-w-4xl w-full max-h-[88vh] rounded-2xl bg-[#110624] border-2 border-purple-500/75 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-purple-800/70 flex items-center justify-between gap-3 bg-gradient-to-r from-purple-950 via-[#16082f] to-black">
              <div className="flex items-center gap-2.5 min-w-0">
                <ListChecks className="w-5 h-5 text-yellow-300 shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-yellow-300 truncate">
                    Semua Partai yang Akan Bertanding ({readyMatches.length})
                  </h2>
                  <p className="text-xs text-blue-200 truncate">
                    Daftar seluruh partai yang belum selesai bertanding
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup Pop-up Semua Partai"
                onClick={() => setShowAllReadyModal(false)}
                className="p-2 rounded-lg bg-black/60 hover:bg-purple-900/70 text-blue-200 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {readyMatches.length > 0 && (
              <div className="px-4 sm:px-6 py-3 border-b border-purple-800/50 bg-black/40">
                <div className="relative">
                  <Search className="w-4 h-4 text-blue-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={readyModalSearch}
                    onChange={(e) => setReadyModalSearch(e.target.value)}
                    aria-label="Cari partai siap bertanding"
                    placeholder="Cari nomor partai, pesilat, kontingen, atau kategori..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5">
              {readyMatches.length === 0 ? (
                <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-6 text-center text-xs text-blue-200">
                  Belum ada partai yang belum selesai bertanding.
                </div>
              ) : filteredReadyMatchesModal.length === 0 ? (
                <div className="rounded-xl bg-black/55 border border-purple-700/60 p-5 text-center text-xs text-blue-200">
                  Tidak ada partai yang cocok dengan pencarian &ldquo;{readyModalSearch}&rdquo;.
                </div>
              ) : (
                filteredReadyMatchesModal.map((m, idx) => {
                  const isActive = m.id === activeMatch.id;
                  const isJurus = isJurusMatch(m);
                  const genderLabel = extractGenderLabel(m.weightClass);
                  const statusLabel =
                    m.status === 'active'
                      ? 'Berjalan'
                      : m.status === 'paused'
                      ? 'Dijeda'
                      : m.status === 'break'
                      ? 'Istirahat'
                      : 'Siap';

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        void setActiveMatch(m.id);
                        setShowAllReadyModal(false);
                      }}
                      className={`w-full rounded-lg px-2.5 py-2 border text-left space-y-1.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-950/85 border-2 border-yellow-400'
                          : 'bg-black/65 border-purple-700/60 hover:border-yellow-400/80 hover:bg-blue-950/35'
                      }`}
                    >
                      {/* Baris 1: Partai, Kategori, Babak, Jenis Kelamin dalam satu baris horizontal */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-x-auto text-[11px] leading-tight min-w-0">
                          <span className="font-mono text-blue-300 font-bold shrink-0">#{idx + 1}</span>
                          <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 font-mono font-bold shrink-0">
                            {m.matchNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                              isJurus
                                ? 'bg-purple-800/85 text-yellow-300'
                                : 'bg-blue-900/85 text-blue-100'
                            }`}
                          >
                            {isJurus ? `Jurus · ${getJurusType(m)}` : 'Tanding'}
                          </span>
                          <span className="text-white font-semibold shrink-0">{m.stage}</span>
                          {genderLabel && (
                            <>
                              <span aria-hidden="true" className="text-blue-400 shrink-0">&middot;</span>
                              <span className="text-blue-200 font-semibold shrink-0">{genderLabel}</span>
                            </>
                          )}
                        </div>

                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${
                            isActive
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-purple-950/80 border-purple-500/50 text-blue-200'
                          }`}
                        >
                          {isActive ? 'Aktif' : statusLabel}
                        </span>
                      </div>

                      {/* Baris 2: Kiri Sudut Biru, Kanan Sudut Merah secara horizontal */}
                      <div className="grid grid-cols-2 gap-1.5 w-full">
                        <div className="px-2 py-1 rounded-md bg-blue-950/55 border border-blue-500/35 min-w-0">
                          <div className="text-[11px] text-white font-semibold leading-tight truncate">{m.blueName}</div>
                          <div className="text-[9px] text-blue-200/80 leading-tight truncate">{m.blueContingent}</div>
                        </div>
                        <div className="px-2 py-1 rounded-md bg-red-950/55 border border-red-500/35 min-w-0 text-right">
                          <div className="text-[11px] text-white font-semibold leading-tight truncate">{m.redName}</div>
                          <div className="text-[9px] text-red-200/80 leading-tight truncate">{m.redContingent}</div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-purple-800/70 bg-black/55 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowAllReadyModal(false)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-purple-900 hover:bg-purple-800 border border-purple-500/60 text-xs font-bold text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Pertandingan */}
      {showResetMatchModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Konfirmasi Reset Pertandingan"
          data-testid="sekretaris-reset-confirm-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl bg-[#110624] border-2 border-rose-500/80 p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-400/60 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-300" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-white leading-tight">
                    Reset Pertandingan?
                  </h2>
                  <p className="text-xs text-blue-200">
                    {activeMatch.matchNumber} &middot; {activeMatch.blueName} vs {activeMatch.redName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isResettingMatch}
                aria-label="Tutup Konfirmasi Reset Pertandingan"
                onClick={() => setShowResetMatchModal(false)}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-purple-900/60 text-blue-200 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-black/60 border border-purple-800/60 p-3 text-xs text-slate-200 space-y-1.5 leading-relaxed">
              <p>
                Tindakan ini akan mengosongkan seluruh data partai aktif di Firebase sebagai inisialisasi awal pertandingan baru:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-blue-100">
                <li>Skor Sudut Biru &amp; Sudut Merah direset menjadi <strong>0 - 0</strong></li>
                <li>Babak dikembalikan ke <strong>Babak 1</strong> dengan timer penuh ({activeMatch.roundDurationSec} dtk)</li>
                <li>Seluruh pelanggaran (Binaan, Teguran, Peringatan), jatuhan, vote juri, verifikasi, dan log event dihapus</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isResettingMatch}
                onClick={() => setShowResetMatchModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-white cursor-pointer disabled:opacity-40 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResettingMatch}
                data-testid="sekretaris-confirm-reset-btn"
                onClick={() => void handleConfirmResetMatch()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-300/80 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResettingMatch ? 'animate-spin' : ''}`} />
                <span>{isResettingMatch ? 'Mereset...' : 'Ya, Reset Pertandingan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
