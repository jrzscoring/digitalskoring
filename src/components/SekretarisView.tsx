import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  FileDown,
  FileText,
  GitBranch,
  History,
  ImagePlus,
  ListChecks,
  Search,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';
import { exportArenaSummaryPdf, exportMatchPdf } from '../utils/pdfExport';
import { ModuleHeader } from './ModuleHeader';
import {
  BaganBracketPanel,
  InputAtletPanel,
  KontrolPartaiPanel,
} from './RegistrasiDataPanels';

type SekretarisSection = 'identitas' | 'input-atlet' | 'bagan-bracket' | 'kontrol-partai';

interface SekretarisViewProps {
  onNavigate: (view: AppView) => void;
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
    syncError,
    arena,
    matches,
    activeMatch,
    events,
    getMatchEvents,
    updateArenaMeta,
  } = useArena();

  const [tournamentName, setTournamentName] = useState(arena.tournamentName);
  const [venue, setVenue] = useState(arena.venue || '');
  const [eventDate, setEventDate] = useState(arena.eventDate || '');
  const [logoLeft, setLogoLeft] = useState(arena.logoLeft || '');
  const [logoRight, setLogoRight] = useState(arena.logoRight || '');
  const [arenaSaved, setArenaSaved] = useState(false);

  const [historySearch, setHistorySearch] = useState('');

  const [activeSection, setActiveSection] = useState<SekretarisSection>('identitas');
  const [registrasiMenuOpen, setRegistrasiMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const finishedMatches = useMemo(() => {
    return matches
      .filter((m) => m.status === 'finished' || Boolean(m.winner))
      .slice()
      .reverse();
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setRegistrasiMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRegistrasiMenuOpen(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <ModuleHeader currentView="sekretaris" onNavigate={onNavigate} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {syncError && (
          <div role="alert" className="px-4 py-3 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-sm">
            {syncError}
          </div>
        )}

        {/* Top Navbar: PDF Actions & Registrasi Data Dropdown */}
        <section className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {activeSection !== 'identitas' && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('identitas');
                  setRegistrasiMenuOpen(false);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>Identitas &amp; Partai</span>
              </button>
            )}
          </div>

          <nav aria-label="Menu Aksi Sekretaris" className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => exportMatchPdf(arena, activeMatch, events)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Ekspor PDF Partai Aktif</span>
            </button>
            <button
              type="button"
              onClick={() => exportArenaSummaryPdf(arena, matches)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Rekap Semua Partai (PDF)</span>
            </button>

            <div ref={menuContainerRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={registrasiMenuOpen}
                onClick={() => setRegistrasiMenuOpen((prev) => !prev)}
                className={`min-h-[42px] px-4 py-2 rounded-xl border font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                  activeSection !== 'identitas' || registrasiMenuOpen
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Registrasi Data</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    registrasiMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {registrasiMenuOpen && (
                <div
                  role="menu"
                  aria-label="Submenu Registrasi Data"
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5 z-40"
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
                        ? 'bg-amber-500/15 text-amber-300 font-bold'
                        : 'text-slate-200 hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <UserPlus className="w-4 h-4 shrink-0" />
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
                        ? 'bg-amber-500/15 text-amber-300 font-bold'
                        : 'text-slate-200 hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <GitBranch className="w-4 h-4 shrink-0" />
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
                        ? 'bg-amber-500/15 text-amber-300 font-bold'
                        : 'text-slate-200 hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <ListChecks className="w-4 h-4 shrink-0" />
                    <span>Kontrol Partai</span>
                  </button>
                </div>
              )}
            </div>
          </nav>
        </section>

        {activeSection === 'input-atlet' ? (
          <InputAtletPanel />
        ) : activeSection === 'bagan-bracket' ? (
          <BaganBracketPanel />
        ) : activeSection === 'kontrol-partai' ? (
          <KontrolPartaiPanel />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Arena Info */}
          <form onSubmit={handleSaveArena} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h2 className="font-display text-xl font-bold text-white">Identitas Kejuaraan</h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="tournament-name" className="block text-xs font-medium text-slate-400 mb-1">
                  Nama Kejuaraan
                </label>
                <input
                  id="tournament-name"
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  maxLength={120}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="venue-input" className="block text-xs font-medium text-slate-400 mb-1">
                    Tempat Pelaksanaan
                  </label>
                  <input
                    id="venue-input"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="Contoh: GOR Padepokan IPSI"
                    maxLength={120}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="event-date-input" className="block text-xs font-medium text-slate-400 mb-1">
                    Waktu Pelaksanaan
                  </label>
                  <input
                    id="event-date-input"
                    type="text"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder="Contoh: 13-15 Nov 2026 · 08.00 WIB"
                    maxLength={80}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-300">Logo Sisi Kiri</span>
                    {logoLeft && (
                      <button
                        type="button"
                        onClick={() => setLogoLeft('')}
                        aria-label="Hapus Logo Sisi Kiri"
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
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
                        className="w-12 h-12 object-contain rounded-lg bg-slate-900 border border-slate-700 p-1 shrink-0"
                      />
                    ) : null}
                    <label
                      htmlFor="logo-left-input"
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4 text-amber-400" />
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

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-300">Logo Sisi Kanan</span>
                    {logoRight && (
                      <button
                        type="button"
                        onClick={() => setLogoRight('')}
                        aria-label="Hapus Logo Sisi Kanan"
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
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
                        className="w-12 h-12 object-contain rounded-lg bg-slate-900 border border-slate-700 p-1 shrink-0"
                      />
                    ) : null}
                    <label
                      htmlFor="logo-right-input"
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4 text-amber-400" />
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
                className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                {arenaSaved ? 'Tersimpan & Tersinkron' : 'Simpan Identitas'}
              </button>
            </div>
          </form>

          {/* Histori Hasil Tanding */}
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Histori Hasil Tanding</h2>
                  <p className="text-xs text-slate-400">
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
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
                  finishedMatches.length === 0
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                }`}
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh Semua (PDF)</span>
              </button>
            </div>

            {finishedMatches.length > 0 && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  aria-label="Cari histori hasil tanding"
                  placeholder="Cari partai, pesilat, kontingen, atau kelas..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            )}

            {finishedMatches.length === 0 ? (
              <div className="rounded-xl bg-slate-950/60 border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
                Belum ada partai yang selesai bertanding. Partai yang telah disahkan pemenangnya oleh Dewan akan tampil di sini dan dapat diunduh per partai maupun sekaligus.
              </div>
            ) : filteredFinishedMatches.length === 0 ? (
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-6 text-center text-xs text-slate-400">
                Tidak ada partai selesai yang cocok dengan pencarian &ldquo;{historySearch}&rdquo;.
              </div>
            ) : (
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {filteredFinishedMatches.map((m) => {
                  const winnerText =
                    m.winner === 'blue'
                      ? `Sudut Biru — ${m.blueName}`
                      : m.winner === 'red'
                      ? `Sudut Merah — ${m.redName}`
                      : m.winner === 'draw'
                      ? 'Seri / Imbang'
                      : 'Selesai';

                  return (
                    <article
                      key={m.id}
                      className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-slate-400">
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                            {m.matchNumber}
                          </span>
                          <span>{m.stage}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span className="truncate">{m.weightClass}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 font-mono text-[11px] uppercase">
                          Selesai
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center">
                        <div
                          className={`sm:col-span-5 px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 ${
                            m.winner === 'blue'
                              ? 'bg-blue-950/60 border-blue-500'
                              : 'bg-blue-950/25 border-blue-900/50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              {m.winner === 'blue' && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                              <span className="truncate">{m.blueName}</span>
                            </div>
                            <div className="text-[11px] text-blue-200/80 truncate">{m.blueContingent}</div>
                          </div>
                          <span className="font-mono font-bold text-base text-blue-300 tabular-nums shrink-0">
                            {m.blueScore}
                          </span>
                        </div>

                        <div className="sm:col-span-1 text-center text-[11px] font-mono text-slate-500">
                          vs
                        </div>

                        <div
                          className={`sm:col-span-5 px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 ${
                            m.winner === 'red'
                              ? 'bg-red-950/60 border-red-500'
                              : 'bg-red-950/25 border-red-900/50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              {m.winner === 'red' && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                              <span className="truncate">{m.redName}</span>
                            </div>
                            <div className="text-[11px] text-red-200/80 truncate">{m.redContingent}</div>
                          </div>
                          <span className="font-mono font-bold text-base text-red-300 tabular-nums shrink-0">
                            {m.redScore}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                        <div className="text-xs text-slate-300">
                          <span className="text-slate-400">Pemenang: </span>
                          <span className="font-semibold text-amber-300">{winnerText}</span>
                          {m.winMethod ? (
                            <span className="text-slate-400"> ({m.winMethod})</span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => exportMatchPdf(arena, m, getMatchEvents(m.id))}
                          aria-label={`Unduh Hasil ${m.matchNumber}`}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Unduh Partai</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        )}
      </main>
    </div>
  );
}
