import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  FileDown,
  GitBranch,
  History,
  ImagePlus,
  LayoutGrid,
  Link2,
  ListChecks,
  Loader2,
  LogIn,
  Maximize2,
  Minimize2,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import { useFullscreenState } from '../hooks/useAutoFullscreen';
import type { AppView, OfficialStationRole } from '../types/silat';
import { buildEventShareUrl } from '../utils/authSession';
import {
  JURUS_JUDGE_COUNT_OPTIONS,
  formatMatchScore,
  getJurusJudgeCount,
  getJurusType,
  isJurusMatch,
  validateJurusJudgeCountInput,
} from '../utils/ipsiRules';
import { exportArenaSummaryPdf, exportMatchPdf } from '../utils/pdfExport';
import {
  BaganBracketPanel,
  InputAtletPanel,
  KontrolPartaiPanel,
  PembagianGelanggangPanel,
} from './RegistrasiDataPanels';
import {
  JadwalPertandinganPanel,
  PerolehanMedaliPanel,
  RekapAtletPanel,
} from './LaporanPanels';
import { OfficialProtestPanel } from './OfficialProtestPanel';
import { RoundScoreRecapChart } from './RoundScoreRecapChart';
import { StationSharePanel } from './StationSharePanel';

type SekretarisSection =
  | 'identitas'
  | 'pengaturan'
  | 'input-atlet'
  | 'bagan-bracket'
  | 'kontrol-partai'
  | 'bagi-gelanggang'
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
    user,
    authLoading,
    authError,
    signInGoogle,
    syncError,
    arena,
    matches,
    activeMatch,
    operators,
    getMatchEvents,
    updateArenaMeta,
    setActiveMatch,
    setMatchJurusJudgeCount,
    addOperatorUid,
    removeOperatorUid,
  } = useArena();

  const [operatorUidInput, setOperatorUidInput] = useState('');
  const [operatorRoleInput, setOperatorRoleInput] = useState<OfficialStationRole>('Juri');
  const [operatorNameInput, setOperatorNameInput] = useState('');
  const [operatorFeedback, setOperatorFeedback] = useState<string | null>(null);
  const [copiedArenaId, setCopiedArenaId] = useState(false);
  const [copiedEventLink, setCopiedEventLink] = useState(false);

  const [tournamentName, setTournamentName] = useState(arena.tournamentName);
  const [venue, setVenue] = useState(arena.venue || '');
  const [eventDate, setEventDate] = useState(arena.eventDate || '');
  const [logoLeft, setLogoLeft] = useState(arena.logoLeft || '');
  const [logoRight, setLogoRight] = useState(arena.logoRight || '');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'synced' | 'saving' | 'invalid'>('synced');

  const [historySearch, setHistorySearch] = useState('');
  const [showAllReadyModal, setShowAllReadyModal] = useState(false);
  const [showStationShareModal, setShowStationShareModal] = useState(false);
  const [readyModalSearch, setReadyModalSearch] = useState('');
  const { isFullscreen, toggleFullscreen } = useFullscreenState();

  const [activeSection, setActiveSection] = useState<SekretarisSection>('identitas');
  const [registrasiMenuOpen, setRegistrasiMenuOpen] = useState(false);
  const [laporanMenuOpen, setLaporanMenuOpen] = useState(false);
  const [selectedPengaturanMatchId, setSelectedPengaturanMatchId] = useState<string>(activeMatch.id);
  const [judgeCountInput, setJudgeCountInput] = useState<string>('');
  const [judgeCountError, setJudgeCountError] = useState<string | null>(null);
  const [judgeCountSavedMsg, setJudgeCountSavedMsg] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const laporanContainerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const hasUserEditedMetaRef = useRef(false);
  const judgeInputRef = useRef<HTMLInputElement>(null);

  const isRegistrasiSection =
    activeSection === 'input-atlet' ||
    activeSection === 'bagan-bracket' ||
    activeSection === 'kontrol-partai' ||
    activeSection === 'bagi-gelanggang';
  const isLaporanSection =
    activeSection === 'laporan-medali' ||
    activeSection === 'laporan-atlet' ||
    activeSection === 'laporan-jadwal';

  const jurusMatches = useMemo(
    () => matches.filter((m) => isJurusMatch(m)),
    [matches]
  );

  useEffect(() => {
    if (isJurusMatch(activeMatch)) {
      setSelectedPengaturanMatchId(activeMatch.id);
    } else if (jurusMatches.length > 0 && !jurusMatches.some((m) => m.id === selectedPengaturanMatchId)) {
      const nextReadyJurus = jurusMatches.find((m) => m.status !== 'finished') || jurusMatches[0];
      if (nextReadyJurus) setSelectedPengaturanMatchId(nextReadyJurus.id);
    }
  }, [activeMatch, jurusMatches, selectedPengaturanMatchId]);

  const targetJurusMatch = useMemo(
    () => jurusMatches.find((m) => m.id === selectedPengaturanMatchId) || jurusMatches[0] || null,
    [jurusMatches, selectedPengaturanMatchId]
  );

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
        setShowStationShareModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);



  const targetJurusMatchId = targetJurusMatch?.id;
  const targetJurusJudgeCount = targetJurusMatch?.jurusJudgeCount;

  useEffect(() => {
    setJudgeCountInput(targetJurusJudgeCount ? String(targetJurusJudgeCount) : '');
    setJudgeCountError(null);
  }, [targetJurusMatchId, targetJurusJudgeCount]);

  useEffect(() => {
    if (!hasUserEditedMetaRef.current) {
      setTournamentName(arena.tournamentName);
      setVenue(arena.venue || '');
      setEventDate(arena.eventDate || '');
      setLogoLeft(arena.logoLeft || '');
      setLogoRight(arena.logoRight || '');
    }
  }, [arena.tournamentName, arena.venue, arena.eventDate, arena.logoLeft, arena.logoRight]);

  const persistArenaMeta = useCallback(
    async (nextMeta: {
      tournamentName: string;
      venue: string;
      eventDate: string;
      logoLeft: string;
      logoRight: string;
    }) => {
      if (!nextMeta.tournamentName.trim()) {
        setAutoSaveStatus('invalid');
        return;
      }
      setAutoSaveStatus('saving');
      try {
        await updateArenaMeta(nextMeta);
        hasUserEditedMetaRef.current = false;
        setAutoSaveStatus('synced');
      } catch {
        setAutoSaveStatus('synced');
      }
    },
    [updateArenaMeta]
  );

  useEffect(() => {
    if (!hasUserEditedMetaRef.current) return;
    if (!tournamentName.trim()) {
      setAutoSaveStatus('invalid');
      return;
    }

    const changed =
      tournamentName.trim() !== arena.tournamentName.trim() ||
      venue.trim() !== (arena.venue || '').trim() ||
      eventDate.trim() !== (arena.eventDate || '').trim() ||
      logoLeft !== (arena.logoLeft || '') ||
      logoRight !== (arena.logoRight || '');

    if (!changed) {
      hasUserEditedMetaRef.current = false;
      setAutoSaveStatus('synced');
      return;
    }

    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persistArenaMeta({
        tournamentName,
        venue,
        eventDate,
        logoLeft,
        logoRight,
      });
    }, 450);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    tournamentName,
    venue,
    eventDate,
    logoLeft,
    logoRight,
    arena.tournamentName,
    arena.venue,
    arena.eventDate,
    arena.logoLeft,
    arena.logoRight,
    persistArenaMeta,
  ]);

  const flushAutoSaveMeta = () => {
    if (!hasUserEditedMetaRef.current) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    void persistArenaMeta({
      tournamentName,
      venue,
      eventDate,
      logoLeft,
      logoRight,
    });
  };

  const handleLogoChange = async (
    side: 'left' | 'right',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await readAndResizeLogo(file);
      const nextLeft = side === 'left' ? resized : logoLeft;
      const nextRight = side === 'right' ? resized : logoRight;
      if (side === 'left') {
        setLogoLeft(resized);
      } else {
        setLogoRight(resized);
      }
      hasUserEditedMetaRef.current = true;
      await persistArenaMeta({
        tournamentName,
        venue,
        eventDate,
        logoLeft: nextLeft,
        logoRight: nextRight,
      });
    } catch {
      // ignore invalid file
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async (side: 'left' | 'right') => {
    const nextLeft = side === 'left' ? '' : logoLeft;
    const nextRight = side === 'right' ? '' : logoRight;
    if (side === 'left') {
      setLogoLeft('');
    } else {
      setLogoRight('');
    }
    hasUserEditedMetaRef.current = true;
    await persistArenaMeta({
      tournamentName,
      venue,
      eventDate,
      logoLeft: nextLeft,
      logoRight: nextRight,
    });
  };

  const handleSelectJurusJudgeCount = async (matchId: string, count: number) => {
    setJudgeCountError(null);
    setJudgeCountInput(String(count));
    await setMatchJurusJudgeCount(matchId, count);
    setJudgeCountSavedMsg(`${count} Juri Bertugas disinkronkan ke Panel Juri, Dewan, dan Monitor.`);
    window.setTimeout(() => setJudgeCountSavedMsg(null), 3000);
  };

  const handleJudgeCountInputChange = (raw: string) => {
    setJudgeCountInput(raw);
    const validation = validateJurusJudgeCountInput(raw);
    if (!validation.valid) {
      setJudgeCountError(
        validation.error || 'Jumlah juri harus berupa angka bulat antara 4 sampai 10.'
      );
      setJudgeCountSavedMsg(null);
      return;
    }
    setJudgeCountError(null);
    if (targetJurusMatch && targetJurusMatch.status !== 'finished' && validation.value !== undefined) {
      void handleSelectJurusJudgeCount(targetJurusMatch.id, validation.value);
    }
  };

  const handleJudgeCountManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateJurusJudgeCountInput(judgeCountInput);
    if (!validation.valid || validation.value === undefined) {
      setJudgeCountError(
        validation.error || 'Jumlah juri harus berupa angka bulat antara 4 sampai 10.'
      );
      setJudgeCountSavedMsg(null);
      judgeInputRef.current?.focus();
      return;
    }
    setJudgeCountError(null);
    if (targetJurusMatch && targetJurusMatch.status !== 'finished') {
      void handleSelectJurusJudgeCount(targetJurusMatch.id, validation.value);
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
                <span>Daftar Partai</span>
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
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="sekretaris-menu-bagi-gelanggang"
                    onClick={() => {
                      setActiveSection('bagi-gelanggang');
                      setRegistrasiMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 cursor-pointer ${
                      activeSection === 'bagi-gelanggang'
                        ? 'bg-yellow-400/15 text-yellow-300 font-bold'
                        : 'text-white hover:bg-blue-950 font-medium'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4 text-yellow-300 shrink-0" />
                    <span>Pembagian Gelanggang</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              data-testid="sekretaris-qr-share-btn"
              onClick={() => {
                setShowStationShareModal(true);
                setRegistrasiMenuOpen(false);
                setLaporanMenuOpen(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-950/85 hover:bg-emerald-900 border border-emerald-400/60 hover:border-yellow-400 text-emerald-100 font-bold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <QrCode className="w-4 h-4 text-yellow-300 shrink-0" />
              <span>QR &amp; Link Perangkat</span>
            </button>

            <button
              type="button"
              data-testid="sekretaris-nav-pengaturan-btn"
              aria-pressed={activeSection === 'pengaturan'}
              onClick={() => {
                setActiveSection('pengaturan');
                setRegistrasiMenuOpen(false);
                setLaporanMenuOpen(false);
              }}
              className={`min-h-[42px] px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                activeSection === 'pengaturan'
                  ? 'bg-yellow-300 border-2 border-white text-black shadow-lg shadow-yellow-400/35'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 border border-yellow-200 text-black shadow-md shadow-yellow-500/20'
              }`}
            >
              <Settings className="w-4 h-4 text-black shrink-0" />
              <span>Pengaturan</span>
            </button>
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
        ) : activeSection === 'bagi-gelanggang' ? (
          <PembagianGelanggangPanel />
        ) : activeSection === 'laporan-medali' ? (
          <PerolehanMedaliPanel />
        ) : activeSection === 'laporan-atlet' ? (
          <RekapAtletPanel />
        ) : activeSection === 'laporan-jadwal' ? (
          <JadwalPertandinganPanel />
        ) : activeSection === 'pengaturan' ? (
        <div className={`grid grid-cols-1 lg:grid-cols-2 items-start ${isFullscreen ? 'gap-3.5' : 'gap-5'}`}>
          {/* Kolom Kiri Pengaturan: Pilihan Juri Bertugas (Jurus TGRS) */}
          <section
            aria-label="Pilihan Juri Bertugas Kategori Jurus"
            data-testid="sekretaris-pengaturan-jurus-panel"
            className="rounded-2xl bg-[#0d051c]/90 border border-yellow-400/50 p-5 space-y-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-yellow-300 shrink-0" />
                <h2 className="font-display text-xl font-bold text-yellow-300">
                  Pilihan Juri Bertugas (Jurus TGRS)
                </h2>
              </div>
              <p className="text-xs text-blue-200 leading-relaxed">
                Tentukan jumlah juri bertugas (4 s/d 10 juri) untuk partai kategori Jurus TGRS. Pengaturan otomatis tersinkron ke Panel Juri, Dewan, dan Monitor.
              </p>
            </div>

            {jurusMatches.length === 0 ? (
              <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-6 text-center space-y-3">
                <p className="text-xs text-blue-200">
                  Belum ada partai kategori Jurus TGRS yang terdaftar. Buat partai Jurus terlebih dahulu melalui menu Kontrol Partai.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('kontrol-partai')}
                  className="min-h-[38px] px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer transition-colors"
                >
                  Buka Kontrol Partai
                </button>
              </div>
            ) : targetJurusMatch && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="pengaturan-jurus-match-select" className="block text-xs font-medium text-blue-200 mb-1.5">
                    Pilih Partai Jurus TGRS
                  </label>
                  <select
                    id="pengaturan-jurus-match-select"
                    data-testid="pengaturan-jurus-match-select"
                    value={targetJurusMatch.id}
                    onChange={(e) => setSelectedPengaturanMatchId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-white text-sm font-medium focus:outline-none focus:border-yellow-400 cursor-pointer"
                  >
                    {jurusMatches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.matchNumber} · {getJurusType(m)} · {m.blueName} vs {m.redName}
                        {m.id === activeMatch.id ? ' (Partai Aktif)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-200 border-t border-b border-purple-800/50 py-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-white">
                      {targetJurusMatch.matchNumber} &middot; {getJurusType(targetJurusMatch)} &middot; {targetJurusMatch.stage}
                    </div>
                    <div className="text-blue-200/85 truncate">
                      {targetJurusMatch.blueName} ({targetJurusMatch.blueContingent}) vs {targetJurusMatch.redName} ({targetJurusMatch.redContingent})
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-yellow-300 tabular-nums whitespace-nowrap">
                    {targetJurusMatch.jurusJudgeCount
                      ? `${targetJurusMatch.jurusJudgeCount} Juri Bertugas`
                      : '3 Juri (Awal)'}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-blue-100">
                      Pilih Jumlah Juri Bertugas (4 s/d 10)
                    </span>
                    {!targetJurusMatch.jurusJudgeCount && (
                      <span className="text-[11px] text-yellow-300/90">
                        Panel Juri saat ini: 3 Juri (Awal)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {JURUS_JUDGE_COUNT_OPTIONS.map((cnt) => {
                      const isSelected = targetJurusMatch.jurusJudgeCount === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          disabled={targetJurusMatch.status === 'finished'}
                          aria-pressed={isSelected}
                          data-testid={`pengaturan-jurus-judge-btn-${cnt}`}
                          onClick={() => void handleSelectJurusJudgeCount(targetJurusMatch.id, cnt)}
                          className={`min-h-[44px] px-2 py-2 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer transition-all disabled:opacity-45 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-yellow-400 border-yellow-200 text-black shadow-md shadow-yellow-400/25'
                              : 'bg-black/65 border-blue-500/45 text-white hover:border-yellow-400 hover:bg-blue-950/60'
                          }`}
                        >
                          {cnt} Juri
                        </button>
                      );
                    })}
                  </div>

                  {/* Input Manual + Validasi Angka Bulat 4..10 */}
                  <form onSubmit={handleJudgeCountManualSubmit} className="pt-2 space-y-2">
                    <label
                      htmlFor="pengaturan-jurus-judge-input"
                      className="block text-xs font-medium text-blue-200"
                    >
                      Atau Masukkan Jumlah Juri (Angka Bulat 4–10)
                    </label>
                    <div className="flex items-stretch gap-2">
                      <input
                        ref={judgeInputRef}
                        id="pengaturan-jurus-judge-input"
                        data-testid="pengaturan-jurus-judge-input"
                        type="text"
                        inputMode="numeric"
                        disabled={targetJurusMatch.status === 'finished'}
                        value={judgeCountInput}
                        onChange={(e) => handleJudgeCountInputChange(e.target.value)}
                        aria-invalid={Boolean(judgeCountError)}
                        aria-describedby={judgeCountError ? 'pengaturan-jurus-input-error' : undefined}
                        placeholder="Contoh: 5"
                        className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-sm font-mono font-bold tabular-nums transition-colors focus:outline-none disabled:opacity-45 ${
                          judgeCountError
                            ? 'bg-rose-950/40 border-2 border-rose-500 ring-2 ring-rose-500/35 text-rose-100 placeholder:text-rose-300/60'
                            : 'bg-black/65 border border-blue-500/45 text-white placeholder:text-blue-300/55 focus:border-yellow-400'
                        }`}
                      />
                      <button
                        type="submit"
                        data-testid="pengaturan-jurus-apply-btn"
                        disabled={targetJurusMatch.status === 'finished'}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                      >
                        Terapkan
                      </button>
                    </div>

                    {judgeCountError && (
                      <div
                        id="pengaturan-jurus-input-error"
                        role="alert"
                        data-testid="pengaturan-jurus-input-error"
                        className="rounded-lg bg-rose-950/85 border border-rose-400/75 px-3 py-2 text-xs text-rose-100 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                        <span>{judgeCountError}</span>
                      </div>
                    )}
                  </form>

                  {targetJurusMatch.status === 'finished' ? (
                    <p className="text-xs text-rose-300">
                      Partai ini sudah selesai sehingga jumlah juri dikunci.
                    </p>
                  ) : (
                    <p className="text-[11px] text-blue-200/85">
                      Tersinkron ke: Panel Juri (1&ndash;{getJurusJudgeCount(targetJurusMatch)}) &middot; Panel Dewan &middot; Monitor Scoreboard
                    </p>
                  )}

                  {judgeCountSavedMsg && !judgeCountError && (
                    <div
                      role="status"
                      data-testid="pengaturan-jurus-saved-status"
                      className="rounded-lg bg-emerald-950/85 border border-emerald-400/60 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                      <span>{judgeCountSavedMsg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Kolom Kanan Pengaturan: Input Identitas Kejuaraan (Auto-Save ke Firebase RTDB) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              flushAutoSaveMeta();
            }}
            data-testid="sekretaris-pengaturan-identitas-panel"
            className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-yellow-300">Identitas Kejuaraan</h2>
              <div
                role="status"
                aria-live="polite"
                data-testid="pengaturan-identitas-autosave-status"
                className={`text-xs font-semibold flex items-center gap-1.5 ${
                  autoSaveStatus === 'invalid'
                    ? 'text-amber-300'
                    : autoSaveStatus === 'saving'
                    ? 'text-yellow-300'
                    : 'text-emerald-300'
                }`}
              >
                {autoSaveStatus === 'invalid' ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Nama kejuaraan wajib diisi</span>
                  </>
                ) : autoSaveStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Menyimpan otomatis ke Firebase...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Tersimpan otomatis ke Firebase</span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="tournament-name" className="block text-xs font-medium text-blue-200 mb-1">
                  Nama Kejuaraan
                </label>
                <input
                  id="tournament-name"
                  type="text"
                  value={tournamentName}
                  onChange={(e) => {
                    hasUserEditedMetaRef.current = true;
                    setTournamentName(e.target.value);
                  }}
                  onBlur={flushAutoSaveMeta}
                  maxLength={120}
                  aria-invalid={!tournamentName.trim()}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-lg text-white placeholder:text-blue-300/60 text-sm focus:outline-none ${
                    !tournamentName.trim()
                      ? 'bg-rose-950/35 border-2 border-rose-500'
                      : 'bg-black/65 border border-blue-500/45 focus:border-yellow-400'
                  }`}
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
                    onChange={(e) => {
                      hasUserEditedMetaRef.current = true;
                      setVenue(e.target.value);
                    }}
                    onBlur={flushAutoSaveMeta}
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
                    onChange={(e) => {
                      hasUserEditedMetaRef.current = true;
                      setEventDate(e.target.value);
                    }}
                    onBlur={flushAutoSaveMeta}
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
                        onClick={() => void handleRemoveLogo('left')}
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
                        onClick={() => void handleRemoveLogo('right')}
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

            <p className="text-[11px] text-blue-200/80 pt-1">
              Setiap perubahan identitas maupun logo kejuaraan langsung tersimpan dan tersinkron otomatis ke seluruh panel.
            </p>
          </form>

          {/* Kontrol Akses Perangkat & Operator Multi-Device */}
          <section
            data-testid="sekretaris-operator-access-panel"
            className="lg:col-span-2 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-800/50 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-yellow-300 shrink-0" />
                  <h2 className="font-display text-xl font-bold text-yellow-300">
                    Kontrol Akses Operator &amp; Multi-Perangkat
                  </h2>
                </div>
                <p className="text-xs text-blue-200">
                  {user
                    ? `Akun Event Aktif: ${user.email || user.uid} — gunakan akun Google yang sama di perangkat lain atau bagikan Link/ID Arena & daftarkan UID Petugas.`
                    : 'Login dengan Akun Google khusus event untuk memisahkan database Cloud Firestore per event agar tidak bertabrakan dengan event lain.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!user ? (
                  <button
                    type="button"
                    data-testid="sekretaris-google-login-button"
                    disabled={authLoading}
                    onClick={() => void signInGoogle()}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-55 text-black text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5 shrink-0" />
                    <span>{authLoading ? 'Memproses Login...' : 'Login'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const url = buildEventShareUrl(arena.id);
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        void navigator.clipboard.writeText(url).then(() => {
                          setCopiedEventLink(true);
                          window.setTimeout(() => setCopiedEventLink(false), 2000);
                        });
                      }
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400/50 text-xs font-semibold text-emerald-100 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedEventLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                    )}
                    <span>{copiedEventLink ? 'Link Event Disalin' : 'Salin Link Event'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      void navigator.clipboard.writeText(arena.id).then(() => {
                        setCopiedArenaId(true);
                        window.setTimeout(() => setCopiedArenaId(false), 2000);
                      });
                    }
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-950/85 hover:bg-blue-900 border border-blue-500/45 text-xs font-mono text-white flex items-center gap-2 cursor-pointer"
                >
                  {copiedArenaId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                  )}
                  <span>ID Arena: {arena.id}</span>
                </button>
              </div>
            </div>

            {authError && !user && (
              <div
                role="alert"
                className="rounded-lg bg-rose-950/85 border border-rose-400/60 px-3 py-2 text-xs text-rose-100 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <StationSharePanel arenaId={arena.id} arenaName={arena.name} />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!operatorUidInput.trim()) return;
                void addOperatorUid(
                  operatorUidInput.trim(),
                  operatorRoleInput,
                  operatorNameInput.trim() || undefined
                ).then((ok) => {
                  if (ok) {
                    setOperatorFeedback(
                      `Operator "${operatorNameInput.trim() || operatorUidInput.trim()}" (${operatorRoleInput}) berhasil didaftarkan.`
                    );
                    setOperatorUidInput('');
                    setOperatorNameInput('');
                  }
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-5">
                <label htmlFor="op-uid-input" className="block text-xs font-medium text-blue-200 mb-1">
                  UID Petugas (dari Profil Petugas)
                </label>
                <input
                  id="op-uid-input"
                  type="text"
                  value={operatorUidInput}
                  onChange={(e) => setOperatorUidInput(e.target.value)}
                  placeholder="Tempel UID Firebase petugas..."
                  maxLength={128}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white font-mono text-xs focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="op-name-input" className="block text-xs font-medium text-blue-200 mb-1">
                  Nama Petugas (Opsional)
                </label>
                <input
                  id="op-name-input"
                  type="text"
                  value={operatorNameInput}
                  onChange={(e) => setOperatorNameInput(e.target.value)}
                  placeholder="Contoh: Juri 1 Matras A"
                  maxLength={80}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="op-role-select" className="block text-xs font-medium text-blue-200 mb-1">
                  Peran Tugas
                </label>
                <select
                  id="op-role-select"
                  value={operatorRoleInput}
                  onChange={(e) => setOperatorRoleInput(e.target.value as OfficialStationRole)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400 cursor-pointer"
                >
                  <option value="Sekretaris">Sekretaris</option>
                  <option value="Dewan">Dewan</option>
                  <option value="Timer">Timer</option>
                  <option value="Juri">Juri</option>
                  <option value="Scoreboard">Scoreboard</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!operatorUidInput.trim()}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-bold cursor-pointer"
                >
                  Daftarkan
                </button>
              </div>
            </form>

            {operatorFeedback && (
              <div
                role="status"
                className="rounded-lg bg-emerald-950/85 border border-emerald-400/60 px-3 py-2 text-xs text-emerald-100 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{operatorFeedback}</span>
              </div>
            )}

            {operators.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-purple-800/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/55 text-blue-200 border-b border-purple-800/50">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Petugas</th>
                      <th className="px-3 py-2 font-semibold">UID</th>
                      <th className="px-3 py-2 font-semibold">Peran</th>
                      <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-900/40">
                    {operators.map((op) => (
                      <tr key={op.uid} className="bg-black/30">
                        <td className="px-3 py-2 font-medium text-white">
                          {op.displayName || 'Petugas Terdaftar'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300">{op.uid}</td>
                        <td className="px-3 py-2 text-yellow-300 font-semibold">{op.role}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void removeOperatorUid(op.uid)}
                            aria-label={`Hapus akses ${op.uid}`}
                            className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-800 border border-rose-500/40 text-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        ) : (
        <div className={isFullscreen ? 'space-y-3.5' : 'space-y-5'}>
          <OfficialProtestPanel />
          <RoundScoreRecapChart />
          <div className={`grid grid-cols-1 lg:grid-cols-2 items-start ${isFullscreen ? 'gap-3.5' : 'gap-5'}`}>
          {/* Kolom Kiri Halaman Awal: Daftar Partai Siap Bertanding & Kolom Kanan: Histori Hasil Tanding */}
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
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/75 border border-purple-500/45 text-yellow-200 font-mono font-bold shrink-0">
                            Gel. {m.gelanggang || 'A'}
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
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/75 border border-purple-500/45 text-yellow-200 font-mono font-bold shrink-0">
                            Gel. {m.gelanggang || 'A'}
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
      {showStationShareModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sekretaris-qr-share-modal-title"
          data-testid="sekretaris-qr-share-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowStationShareModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#120726] border border-emerald-400/55 p-5 sm:p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between gap-3 border-b border-purple-800/60 pb-3">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-5 h-5 text-yellow-300 shrink-0" />
                <div>
                  <h2
                    id="sekretaris-qr-share-modal-title"
                    className="font-display text-lg font-bold text-white"
                  >
                    QR Barcode &amp; Link Perangkat (Juri, Timer, Dewan, Monitor)
                  </h2>
                  <p className="text-[11px] text-emerald-300 font-mono">
                    {arena.name} &middot; {arena.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStationShareModal(false)}
                aria-label="Tutup modal QR & Link Perangkat"
                className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <StationSharePanel arenaId={arena.id} arenaName={arena.name} />

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowStationShareModal(false)}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-purple-900 hover:bg-purple-800 border border-purple-500/60 text-xs font-bold text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
