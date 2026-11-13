import React, { useState } from 'react';
import {
  Check,
  Copy,
  FileDown,
  FileText,
  FolderGit2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';
import { exportArenaSummaryPdf, exportMatchPdf } from '../utils/pdfExport';
import { ModuleHeader } from './ModuleHeader';

interface SekretarisViewProps {
  onNavigate: (view: AppView) => void;
}

export function SekretarisView({ onNavigate }: SekretarisViewProps) {
  const {
    mode,
    rtdbProjectId,
    user,
    syncError,
    arena,
    matches,
    activeMatch,
    events,
    updateArenaMeta,
    joinArenaById,
    addOperatorUid,
    createMatch,
    setActiveMatch,
    deleteMatch,
    resetMatch,
  } = useArena();

  const [tournamentName, setTournamentName] = useState(arena.tournamentName);
  const [arenaName, setArenaName] = useState(arena.name);
  const [arenaSaved, setArenaSaved] = useState(false);

  const [matchNumber, setMatchNumber] = useState(`Partai 0${matches.length + 1}`);
  const [weightClass, setWeightClass] = useState('Kelas C Putra (55-60 kg)');
  const [stage, setStage] = useState('Penyisihan');
  const [blueName, setBlueName] = useState('');
  const [blueContingent, setBlueContingent] = useState('');
  const [redName, setRedName] = useState('');
  const [redContingent, setRedContingent] = useState('');
  const [roundDurationSec, setRoundDurationSec] = useState(120);
  const [formError, setFormError] = useState('');

  const [joinIdInput, setJoinIdInput] = useState('');
  const [operatorUidInput, setOperatorUidInput] = useState('');
  const [operatorRole, setOperatorRole] = useState<'Dewan' | 'Timer' | 'Juri' | 'Scoreboard'>('Juri');
  const [copiedRole, setCopiedRole] = useState<string | null>(null);
  const [showDeployGuide, setShowDeployGuide] = useState(false);

  const handleSaveArena = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateArenaMeta(arenaName, tournamentName);
    setArenaSaved(true);
    setTimeout(() => setArenaSaved(false), 1800);
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchNumber.trim() || !blueName.trim() || !blueContingent.trim() || !redName.trim() || !redContingent.trim()) {
      setFormError('Lengkapi nomor partai, nama pesilat, dan kontingen kedua sudut.');
      return;
    }
    setFormError('');
    await createMatch({
      matchNumber,
      weightClass,
      stage,
      blueName,
      blueContingent,
      redName,
      redContingent,
      roundDurationSec,
      setAsActive: true,
    });
    setMatchNumber(`Partai 0${matches.length + 2}`);
    setBlueName('');
    setBlueContingent('');
    setRedName('');
    setRedContingent('');
  };

  const copyRoleUrl = async (role: Exclude<AppView, 'landing'>) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?arena=${encodeURIComponent(arena.id)}#/${role}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRole(role);
      setTimeout(() => setCopiedRole(null), 1500);
    } catch {
      // ignore clipboard errors
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

        {/* Top Header + PDF & GitHub Pages Quick Actions */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="font-display text-3xl font-bold text-white tracking-wide">
              Panel Sekretaris Pertandingan
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Kelola partai tanding, sinkronisasi perangkat via Firebase, dan ekspor laporan resmi IPSI 2026 PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
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
            <button
              type="button"
              onClick={() => setShowDeployGuide((v) => !v)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FolderGit2 className="w-4 h-4" />
              <span>GitHub Pages</span>
            </button>
          </div>
        </section>

        {showDeployGuide && (
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2 text-sm text-slate-300">
            <h2 className="font-display text-xl font-bold text-white">Panduan Publish Gratis ke GitHub Pages</h2>
            <p>
              Workflow <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">.github/workflows/deploy.yml</code> dan{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">base: &apos;./&apos;</code> pada Vite sudah dikonfigurasi otomatis.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Unggah kode proyek ini ke repository GitHub pada branch <code className="text-white">main</code>.</li>
              <li>Buka <strong className="text-white">Settings &rarr; Pages</strong> di GitHub, lalu pilih Source: <strong className="text-white">GitHub Actions</strong>.</li>
              <li>Setiap push ke <code className="text-white">main</code> otomatis membangun dan mempublikasikan aplikasi secara gratis.</li>
            </ol>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Arena Info & Add Match Form */}
          <div className="lg:col-span-5 space-y-6">
            {/* Arena Config */}
            <form onSubmit={handleSaveArena} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-white">Identitas Kejuaraan &amp; Gelanggang</h2>
                <span className="text-xs font-mono text-slate-400">
                  Mode:{' '}
                  {mode === 'firebase'
                    ? 'Online Firestore'
                    : mode === 'rtdb'
                    ? `Online RTDB (${rtdbProjectId || 'firebase'})`
                    : 'Lokal Multi-Tab'}
                </span>
              </div>

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
                <div>
                  <label htmlFor="arena-name" className="block text-xs font-medium text-slate-400 mb-1">
                    Nama Gelanggang
                  </label>
                  <input
                    id="arena-name"
                    type="text"
                    value={arenaName}
                    onChange={(e) => setArenaName(e.target.value)}
                    maxLength={80}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs font-mono text-slate-400 truncate">ID Arena: {arena.id}</span>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  {arenaSaved ? 'Tersimpan' : 'Simpan Gelanggang'}
                </button>
              </div>
            </form>

            {/* Create New Match Form */}
            <form onSubmit={handleCreateMatch} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <h2 className="font-display text-xl font-bold text-white">Tambah Partai Tanding</h2>

              {formError && (
                <p role="alert" className="text-xs text-red-400 font-medium">
                  {formError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="match-number" className="block text-xs font-medium text-slate-400 mb-1">
                    Nomor Partai
                  </label>
                  <input
                    id="match-number"
                    type="text"
                    value={matchNumber}
                    onChange={(e) => setMatchNumber(e.target.value)}
                    placeholder="Partai 02"
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="match-stage" className="block text-xs font-medium text-slate-400 mb-1">
                    Fase / Babak
                  </label>
                  <select
                    id="match-stage"
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="Penyisihan">Penyisihan</option>
                    <option value="Perempat Final">Perempat Final</option>
                    <option value="Semifinal">Semifinal</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="weight-class" className="block text-xs font-medium text-slate-400 mb-1">
                    Kelas Tanding
                  </label>
                  <input
                    id="weight-class"
                    type="text"
                    value={weightClass}
                    onChange={(e) => setWeightClass(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="round-duration" className="block text-xs font-medium text-slate-400 mb-1">
                    Durasi per Babak
                  </label>
                  <select
                    id="round-duration"
                    value={roundDurationSec}
                    onChange={(e) => setRoundDurationSec(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value={90}>01:30 (90 detik)</option>
                    <option value={120}>02:00 (120 detik — IPSI)</option>
                    <option value={150}>02:30 (150 detik)</option>
                    <option value={180}>03:00 (180 detik)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/60 space-y-2">
                  <div className="text-xs font-bold text-blue-300">Sudut Biru</div>
                  <input
                    aria-label="Nama Pesilat Sudut Biru"
                    type="text"
                    value={blueName}
                    onChange={(e) => setBlueName(e.target.value)}
                    placeholder="Nama Pesilat Biru"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-950 border border-blue-800/60 text-sm text-white focus:outline-none focus:border-blue-400"
                  />
                  <input
                    aria-label="Kontingen Sudut Biru"
                    type="text"
                    value={blueContingent}
                    onChange={(e) => setBlueContingent(e.target.value)}
                    placeholder="Kontingen / Daerah"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-950 border border-blue-800/60 text-sm text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/60 space-y-2">
                  <div className="text-xs font-bold text-red-300">Sudut Merah</div>
                  <input
                    aria-label="Nama Pesilat Sudut Merah"
                    type="text"
                    value={redName}
                    onChange={(e) => setRedName(e.target.value)}
                    placeholder="Nama Pesilat Merah"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-950 border border-red-800/60 text-sm text-white focus:outline-none focus:border-red-400"
                  />
                  <input
                    aria-label="Kontingen Sudut Merah"
                    type="text"
                    value={redContingent}
                    onChange={(e) => setRedContingent(e.target.value)}
                    placeholder="Kontingen / Daerah"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-950 border border-red-800/60 text-sm text-white focus:outline-none focus:border-red-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan &amp; Aktifkan Partai</span>
              </button>
            </form>
          </div>

          {/* Right Column: Match Queue & Multi-Device Sync Links */}
          <div className="lg:col-span-7 space-y-6">
            {/* Match List */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-white">Daftar Partai Gelanggang</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">{matches.length} Partai</span>
              </div>

              <div className="divide-y divide-slate-800">
                {matches.map((m) => {
                  const isActive = m.id === activeMatch.id;
                  return (
                    <div
                      key={m.id}
                      className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isActive ? 'bg-slate-800/40 -mx-3 px-3 rounded-xl' : ''
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-bold text-amber-300">{m.matchNumber}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{m.stage}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span className="truncate">{m.weightClass}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span className="font-mono uppercase text-slate-300">
                            {m.status === 'waiting'
                              ? 'Menunggu'
                              : m.status === 'active'
                              ? 'Berjalan'
                              : m.status === 'paused'
                              ? 'Dijeda'
                              : m.status === 'break'
                              ? 'Istirahat'
                              : 'Selesai'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          <span className="text-blue-300">{m.blueName} ({m.blueContingent})</span>
                          <span className="text-slate-500">vs</span>
                          <span className="text-red-300">{m.redName} ({m.redContingent})</span>
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-400">
                          Skor: Biru {m.blueScore} &ndash; {m.redScore} Merah
                          {m.winner ? ` · Pemenang: ${m.winner.toUpperCase()} (${m.winMethod})` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void setActiveMatch(m.id)}
                          disabled={isActive}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            isActive
                              ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-300 cursor-default'
                              : 'bg-slate-800 hover:bg-slate-700 text-white'
                          }`}
                        >
                          {isActive ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>{isActive ? 'Partai Aktif' : 'Aktifkan'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => exportMatchPdf(arena, m, m.id === activeMatch.id ? events : [])}
                          aria-label={`Ekspor PDF ${m.matchNumber}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void resetMatch(m.id)}
                          aria-label={`Reset ${m.matchNumber}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>

                        {matches.length > 1 && (
                          <button
                            type="button"
                            onClick={() => void deleteMatch(m.id)}
                            aria-label={`Hapus ${m.matchNumber}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-red-900/70 text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Multi-Device Sync Links & Firebase Operator Access */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Tautan Perangkat Arena (HP / Tablet / TV)</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Buka tautan peran di perangkat masing-masing (gunakan akun Google yang sama atau daftarkan UID operator untuk sinkronisasi Firebase lintas perangkat).
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(['dewan', 'timer', 'juri', 'scoreboard'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => void copyRoleUrl(role)}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/60 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 capitalize cursor-pointer"
                  >
                    {copiedRole === role ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{copiedRole === role ? 'Tersalin' : `Link ${role}`}</span>
                  </button>
                ))}
              </div>

              {(mode === 'rtdb' || (mode === 'firebase' && user)) && (
                <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="join-arena" className="block text-xs font-medium text-slate-400">
                      Gabung / Ganti Arena ID (Sinkronisasi Lintas Perangkat)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="join-arena"
                        type="text"
                        value={joinIdInput}
                        onChange={(e) => setJoinIdInput(e.target.value)}
                        placeholder="Contoh: gelanggang-a"
                        className="flex-1 min-h-[38px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void joinArenaById(joinIdInput)}
                        className="min-h-[38px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
                      >
                        Gabung
                      </button>
                    </div>
                  </div>

                  {mode === 'firebase' && user && (
                    <div className="space-y-2">
                      <label htmlFor="add-operator" className="block text-xs font-medium text-slate-400">
                        Tambah UID Operator (Akun Google Berbeda)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="add-operator"
                          type="text"
                          value={operatorUidInput}
                          onChange={(e) => setOperatorUidInput(e.target.value)}
                          placeholder="UID perangkat"
                          className="flex-1 min-h-[38px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                        <select
                          aria-label="Peran Operator"
                          value={operatorRole}
                          onChange={(e) => setOperatorRole(e.target.value as typeof operatorRole)}
                          className="min-h-[38px] px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                        >
                          <option value="Juri">Juri</option>
                          <option value="Dewan">Dewan</option>
                          <option value="Timer">Timer</option>
                          <option value="Scoreboard">Scoreboard</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (operatorUidInput.trim()) {
                              void addOperatorUid(operatorUidInput.trim(), operatorRole);
                              setOperatorUidInput('');
                            }
                          }}
                          aria-label="Tambah Operator"
                          className="min-h-[38px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
