import React, { useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { ArenaCourt, CompetitionCategory, MatchStatus } from '../types/silat';
import { ARENA_COURTS, exportAthletesExcel, exportMatchScheduleExcel } from '../utils/athleteExcel';
import { formatMatchScore, getJurusType, isJurusMatch } from '../utils/ipsiRules';
import { computeMedalStandings } from '../utils/medalStandings';
import {
  exportAthletesRecapPdf,
  exportMatchSchedulePdf,
  exportMedalStandingsPdf,
} from '../utils/pdfExport';

export function PerolehanMedaliPanel() {
  const { arena, matches, brackets, athletes } = useArena();
  const [searchQuery, setSearchQuery] = useState('');

  const { standings, awards, totalGold, totalSilver, totalBronze } = useMemo(
    () => computeMedalStandings(matches, brackets, athletes),
    [matches, brackets, athletes]
  );

  const filteredStandings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return standings;
    return standings.filter((r) => r.contingent.toLowerCase().includes(q));
  }, [standings, searchQuery]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-purple-800/60">
          <div className="flex items-start gap-3">
            <Award className="w-6 h-6 text-yellow-300 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-xl font-bold text-yellow-300">
                Data Perolehan Medali Kontingen
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Terhitung otomatis dan terbarui secara real-time saat partai Semifinal &amp; Final disahkan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="min-h-[38px] px-3 py-1.5 rounded-xl bg-black/65 border border-blue-500/45 text-xs font-mono text-yellow-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" aria-hidden="true" />
              <span>Update Real-Time</span>
            </span>
            <button
              type="button"
              onClick={() => exportMedalStandingsPdf(arena, standings, awards)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
            >
              <FileDown className="w-4 h-4" />
              <span>Unduh PDF</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-black/65 border border-yellow-400/50 p-3.5">
            <div className="text-xs text-blue-200">Total Emas</div>
            <div className="font-mono text-2xl font-bold text-yellow-300 tabular-nums mt-1">
              {totalGold}
            </div>
          </div>
          <div className="rounded-xl bg-black/65 border border-blue-500/45 p-3.5">
            <div className="text-xs text-blue-200">Total Perak</div>
            <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
              {totalSilver}
            </div>
          </div>
          <div className="rounded-xl bg-black/65 border border-purple-500/50 p-3.5">
            <div className="text-xs text-blue-200">Total Perunggu</div>
            <div className="font-mono text-2xl font-bold text-blue-200 tabular-nums mt-1">
              {totalBronze}
            </div>
          </div>
          <div className="rounded-xl bg-black/65 border border-blue-500/45 p-3.5">
            <div className="text-xs text-blue-200">Kontingen Terdaftar</div>
            <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
              {standings.length}
            </div>
          </div>
        </div>

        {/* Search */}
        {standings.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 text-blue-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari kontingen perolehan medali"
              placeholder="Cari nama kontingen / perguruan..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
            />
          </div>
        )}

        {/* Standings Table */}
        {standings.length === 0 ? (
          <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-8 text-center text-sm text-blue-200">
            Belum ada data kontingen maupun perolehan medali. Daftarkan atlet atau selesaikan partai Semifinal &amp; Final untuk melihat klasemen medali secara real-time.
          </div>
        ) : filteredStandings.length === 0 ? (
          <div className="rounded-xl bg-black/55 border border-purple-700/60 p-6 text-center text-xs text-blue-200">
            Tidak ada kontingen yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-purple-700/50">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-blue-950/80 text-yellow-300 text-xs uppercase font-bold border-b border-purple-700/60">
                  <th className="py-3 px-3.5 w-20 text-center">Peringkat</th>
                  <th className="py-3 px-3.5">Kontingen / Perguruan</th>
                  <th className="py-3 px-3.5 w-24 text-center">Emas</th>
                  <th className="py-3 px-3.5 w-24 text-center">Perak</th>
                  <th className="py-3 px-3.5 w-24 text-center">Perunggu</th>
                  <th className="py-3 px-3.5 w-24 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-800/50 bg-black/55">
                {filteredStandings.map((row) => (
                  <tr key={row.contingent} className="hover:bg-blue-950/35 transition-colors">
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-yellow-300 tabular-nums">
                      #{row.rank}
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-white">{row.contingent}</td>
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-yellow-300 tabular-nums">
                      {row.gold}
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-white tabular-nums">
                      {row.silver}
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-blue-200 tabular-nums">
                      {row.bronze}
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-yellow-300 tabular-nums">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {awards.length > 0 && (
        <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-purple-800/60">
            <Trophy className="w-4 h-4 text-yellow-300" />
            <h3 className="font-display text-base font-bold text-yellow-300">
              Rincian Peraih Medali ({awards.length})
            </h3>
          </div>
          <div className="overflow-x-auto rounded-xl border border-purple-700/50">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-950/75 text-blue-200 uppercase font-bold border-b border-purple-700/60">
                  <th className="py-2.5 px-3">Medali</th>
                  <th className="py-2.5 px-3">Nama Atlet</th>
                  <th className="py-2.5 px-3">Kontingen / Perguruan</th>
                  <th className="py-2.5 px-3">Kelas / Kategori</th>
                  <th className="py-2.5 px-3">Partai / Babak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-800/50 bg-black/55">
                {awards.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-950/30">
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                          item.medal === 'Emas'
                            ? 'bg-yellow-400/20 border-yellow-400 text-yellow-300'
                            : item.medal === 'Perak'
                            ? 'bg-blue-950/80 border-blue-400 text-white'
                            : 'bg-purple-950/80 border-purple-400 text-blue-200'
                        }`}
                      >
                        {item.medal}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">{item.athleteName}</td>
                    <td className="py-2.5 px-3 text-blue-200">{item.contingent}</td>
                    <td className="py-2.5 px-3 text-blue-200">{item.weightClass}</td>
                    <td className="py-2.5 px-3 font-mono text-yellow-300/90">
                      {item.matchNumber} ({item.stage})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function RekapAtletPanel() {
  const { arena, athletes } = useArena();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Semua' | CompetitionCategory>('Semua');
  const [courtFilter, setCourtFilter] = useState<'Semua' | ArenaCourt>('Semua');

  const filteredAthletes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return athletes.filter((a) => {
      if (categoryFilter !== 'Semua' && (a.competitionCategory || 'Tanding') !== categoryFilter) {
        return false;
      }
      if (courtFilter !== 'Semua' && (a.gelanggang || 'A') !== courtFilter) {
        return false;
      }
      if (!q) return true;
      return [
        a.name,
        a.contingent,
        a.ageCategory || 'Dewasa',
        a.gender,
        a.competitionCategory || 'Tanding',
        a.weightClass,
        `gelanggang ${a.gelanggang || 'A'}`,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [athletes, searchQuery, categoryFilter, courtFilter]);

  return (
    <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-purple-800/60">
        <div className="flex items-start gap-3">
          <Users className="w-6 h-6 text-yellow-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-xl font-bold text-yellow-300">
              Rekap Daftar Semua Data Atlet
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">
              Total {athletes.length} atlet terdaftar ({filteredAthletes.length} ditampilkan)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredAthletes.length === 0}
            onClick={() => exportAthletesRecapPdf(arena, filteredAthletes)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 disabled:cursor-not-allowed text-black font-bold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>Unduh PDF</span>
          </button>
          <button
            type="button"
            disabled={filteredAthletes.length === 0}
            onClick={() => exportAthletesExcel(filteredAthletes)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 disabled:opacity-45 disabled:cursor-not-allowed border border-blue-500/45 hover:border-yellow-400 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-yellow-300" />
            <span>Unduh Excel</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-blue-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari rekap data atlet"
            placeholder="Cari nama atlet, kontingen, kelas, atau usia..."
            className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter kategori rekap atlet"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'Semua' | CompetitionCategory)}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="Semua">Semua Kategori</option>
            <option value="Tanding">Tanding</option>
            <option value="Jurus">Jurus</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter gelanggang rekap atlet"
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value as 'Semua' | ArenaCourt)}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="Semua">Semua Gelanggang</option>
            {ARENA_COURTS.map((c) => (
              <option key={c} value={c}>
                Gelanggang {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {athletes.length === 0 ? (
        <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-8 text-center text-sm text-blue-200">
          Belum ada atlet terdaftar pada event ini. Tambahkan melalui menu <strong className="text-yellow-300">Registrasi Data &rarr; Input Atlet</strong>.
        </div>
      ) : filteredAthletes.length === 0 ? (
        <div className="rounded-xl bg-black/55 border border-purple-700/60 p-6 text-center text-xs text-blue-200">
          Tidak ada data atlet yang sesuai dengan filter saat ini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-purple-700/50">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-blue-950/80 text-yellow-300 text-xs uppercase font-bold border-b border-purple-700/60">
                <th className="py-3 px-3 w-12 text-center">No</th>
                <th className="py-3 px-3">Nama Atlet</th>
                <th className="py-3 px-3">Kontingen / Perguruan</th>
                <th className="py-3 px-3">Kategori Usia</th>
                <th className="py-3 px-3">JK</th>
                <th className="py-3 px-3">Kategori</th>
                <th className="py-3 px-3">Kelas / Jurus</th>
                <th className="py-3 px-3 text-center">Gelanggang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-800/50 bg-black/55">
              {filteredAthletes.map((a, idx) => (
                <tr key={a.id} className="hover:bg-blue-950/35 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono text-blue-200 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-white">{a.name}</td>
                  <td className="py-2.5 px-3 text-blue-100">{a.contingent}</td>
                  <td className="py-2.5 px-3 text-yellow-300">{a.ageCategory || 'Dewasa'}</td>
                  <td className="py-2.5 px-3 text-blue-200">{a.gender}</td>
                  <td className="py-2.5 px-3 text-white">{a.competitionCategory || 'Tanding'}</td>
                  <td className="py-2.5 px-3 text-blue-100">{a.weightClass}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-yellow-300">
                    {a.gelanggang || 'A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function getStatusBadgeLabel(status: MatchStatus): string {
  switch (status) {
    case 'waiting':
      return 'Menunggu';
    case 'active':
      return 'Berjalan';
    case 'paused':
      return 'Dijeda';
    case 'break':
      return 'Istirahat';
    case 'finished':
      return 'Selesai';
  }
}

export function JadwalPertandinganPanel() {
  const { arena, matches, activeMatch } = useArena();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'waiting' | 'running' | 'finished'>('Semua');
  const [courtFilter, setCourtFilter] = useState<'Semua' | ArenaCourt>('Semua');

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (courtFilter !== 'Semua' && (m.gelanggang || 'A') !== courtFilter) return false;
      if (statusFilter === 'waiting' && m.status !== 'waiting') return false;
      if (statusFilter === 'running' && m.status !== 'active' && m.status !== 'paused' && m.status !== 'break') {
        return false;
      }
      if (statusFilter === 'finished' && m.status !== 'finished') return false;
      if (!q) return true;
      return [
        m.matchNumber,
        m.stage,
        m.weightClass,
        m.blueName,
        m.blueContingent,
        m.redName,
        m.redContingent,
        `gelanggang ${m.gelanggang || 'A'}`,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [matches, searchQuery, statusFilter, courtFilter]);

  return (
    <section className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-purple-800/60">
        <div className="flex items-start gap-3">
          <CalendarDays className="w-6 h-6 text-yellow-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-xl font-bold text-yellow-300">
              Jadwal Pertandingan
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">
              Tersinkron otomatis dari data Kontrol Partai ({matches.length} partai terdaftar).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredMatches.length === 0}
            onClick={() => exportMatchSchedulePdf(arena, filteredMatches, { courtFilter })}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-45 disabled:cursor-not-allowed text-black font-bold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>Unduh PDF</span>
          </button>
          <button
            type="button"
            disabled={filteredMatches.length === 0}
            onClick={() => exportMatchScheduleExcel(filteredMatches, arena, { courtFilter })}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 disabled:opacity-45 disabled:cursor-not-allowed border border-blue-500/45 hover:border-yellow-400 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-yellow-300" />
            <span>Unduh Excel</span>
          </button>
        </div>
      </div>

      {/* Search, Status & Gelanggang Filter */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-blue-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari jadwal pertandingan"
            placeholder="Cari nomor partai, babak, kelas, pesilat, atau kontingen..."
            className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter gelanggang jadwal pertandingan"
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value as 'Semua' | ArenaCourt)}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="Semua">Semua Gelanggang</option>
            {ARENA_COURTS.map((c) => (
              <option key={c} value={c}>
                Gelanggang {c}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter status jadwal pertandingan"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'Semua' | 'waiting' | 'running' | 'finished')
            }
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="Semua">Semua Status ({matches.length})</option>
            <option value="waiting">Menunggu</option>
            <option value="running">Sedang Berjalan / Jeda</option>
            <option value="finished">Selesai</option>
          </select>
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-8 text-center text-sm text-blue-200">
          Tidak ada jadwal pertandingan yang cocok dengan filter saat ini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-purple-700/50">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-blue-950/80 text-yellow-300 text-xs uppercase font-bold border-b border-purple-700/60">
                <th className="py-3 px-3 w-12 text-center">No</th>
                <th className="py-3 px-3 text-center">Gel.</th>
                <th className="py-3 px-3">Partai</th>
                <th className="py-3 px-3">Fase</th>
                <th className="py-3 px-3">Kelas / Kategori</th>
                <th className="py-3 px-3">Sudut Biru</th>
                <th className="py-3 px-3">Sudut Merah</th>
                <th className="py-3 px-3 text-center">Babak</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Skor / Pemenang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-800/50 bg-black/55">
              {filteredMatches.map((m, idx) => {
                const isActive = m.id === activeMatch.id;
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors ${
                      isActive ? 'bg-blue-950/45' : 'hover:bg-blue-950/25'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono text-blue-200 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-yellow-300 whitespace-nowrap">
                      Gel. {m.gelanggang || 'A'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-yellow-300 whitespace-nowrap">
                      {m.matchNumber}
                      {isActive && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-yellow-400 text-black text-[10px] font-bold uppercase">
                          Aktif
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-white whitespace-nowrap">{m.stage}</td>
                    <td className="py-2.5 px-3 text-blue-100">{m.weightClass}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-blue-300">{m.blueName}</div>
                      <div className="text-[11px] text-blue-200/80">{m.blueContingent}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-red-300">{m.redName}</div>
                      <div className="text-[11px] text-red-200/80">{m.redContingent}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-white whitespace-nowrap">
                      {isJurusMatch(m) ? getJurusType(m) : `${m.totalRounds ?? 3} Babak`}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase border ${
                          m.status === 'finished'
                            ? 'bg-blue-950/80 border-blue-400/60 text-blue-200'
                            : m.status === 'active'
                            ? 'bg-yellow-400/20 border-yellow-400 text-yellow-300 font-bold'
                            : 'bg-black/60 border-purple-600/60 text-white'
                        }`}
                      >
                        {getStatusBadgeLabel(m.status)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums whitespace-nowrap">
                      <span className="text-blue-300 font-bold">{formatMatchScore(m, 'blue')}</span>
                      <span className="text-yellow-300 mx-1">-</span>
                      <span className="text-red-300 font-bold">{formatMatchScore(m, 'red')}</span>
                      {m.winner && (
                        <div className="text-[10px] text-yellow-300 mt-0.5">
                          {m.winner === 'blue' ? 'BIRU' : m.winner === 'red' ? 'MERAH' : 'SERI'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
