import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  FileDown,
  FileSpreadsheet,
  GitBranch,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type {
  ArenaCourt,
  AthleteAgeCategory,
  AthleteGender,
  BracketMatchSlot,
  BracketMode,
  CompetitionCategory,
  PemasalanPoolSize,
} from '../types/silat';
import {
  AGE_CATEGORIES,
  ARENA_COURTS,
  COMPETITION_CATEGORIES,
  JURUS_SPECIFICATIONS,
  TANDING_CLASSES_BY_AGE,
  downloadAthleteTemplateExcel,
  exportAthletesExcel,
  getClassOptions,
  parseAthletesExcel,
} from '../utils/athleteExcel';
import { formatMatchTime } from '../utils/ipsiRules';
import { exportMatchPdf } from '../utils/pdfExport';

export function InputAtletPanel() {
  const { athletes, addAthlete, importAthletes, deleteAthlete, clearAthletes } = useArena();
  const [name, setName] = useState('');
  const [contingent, setContingent] = useState('');
  const [ageCategory, setAgeCategory] = useState<AthleteAgeCategory>('Dewasa');
  const [gender, setGender] = useState<AthleteGender>('Putra');
  const [competitionCategory, setCompetitionCategory] = useState<CompetitionCategory>('Tanding');
  const [weightClass, setWeightClass] = useState('Kelas B (50-55 kg)');
  const [gelanggang, setGelanggang] = useState<ArenaCourt>('A');
  const [filterClass, setFilterClass] = useState<string>('Semua');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const classOptions = useMemo(
    () => getClassOptions(competitionCategory, ageCategory),
    [competitionCategory, ageCategory]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contingent.trim() || !weightClass.trim()) {
      setError('Lengkapi nama atlet, kontingen, dan kelas tanding.');
      return;
    }
    setError('');
    setFeedback('');
    await addAthlete({
      name,
      contingent,
      weightClass,
      gender,
      ageCategory,
      competitionCategory,
      gelanggang,
    });
    setName('');
    setContingent('');
    setFeedback('Atlet berhasil ditambahkan.');
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setFeedback('');
    setIsImporting(true);
    try {
      const { athletes: importedList, skipped } = await parseAthletesExcel(file);
      if (importedList.length === 0) {
        setError('Tidak ada baris atlet valid di file Excel. Gunakan Template Excel yang tersedia.');
        return;
      }
      const count = await importAthletes(importedList);
      setFeedback(
        skipped > 0
          ? `Berhasil mengimpor ${count} atlet (${skipped} baris kosong/tidak lengkap dilewati).`
          : `Berhasil mengimpor ${count} atlet dari Excel.`
      );
    } catch {
      setError('Gagal membaca file Excel. Pastikan format file .xlsx / .xls / .csv valid.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmClearAll = async () => {
    await clearAthletes();
    setConfirmClear(false);
    setFilterClass('Semua');
    setFeedback('Semua data atlet terdaftar telah dikosongkan.');
  };

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>(athletes.map((a) => a.weightClass));
    return ['Semua', ...Array.from(set)];
  }, [athletes]);

  const filteredAthletes = useMemo(() => {
    if (filterClass === 'Semua') return athletes;
    return athletes.filter((a) => a.weightClass === filterClass);
  }, [athletes, filterClass]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-amber-400" />
          <h2 className="font-display text-xl font-bold text-white">Input Atlet</h2>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400 font-medium">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="text-xs text-emerald-400 font-medium">
            {feedback}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="athlete-name" className="block text-xs font-medium text-slate-400 mb-1">
              Nama Atlet
            </label>
            <input
              id="athlete-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap pesilat"
              maxLength={80}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label htmlFor="athlete-contingent" className="block text-xs font-medium text-slate-400 mb-1">
              Kontingen / Perguruan
            </label>
            <input
              id="athlete-contingent"
              type="text"
              value={contingent}
              onChange={(e) => setContingent(e.target.value)}
              placeholder="Contoh: DKI Jakarta"
              maxLength={80}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="athlete-age-category" className="block text-xs font-medium text-slate-400 mb-1">
                Kategori Usia
              </label>
              <select
                id="athlete-age-category"
                value={ageCategory}
                onChange={(e) => {
                  const nextAge = e.target.value as AthleteAgeCategory;
                  setAgeCategory(nextAge);
                  if (competitionCategory === 'Tanding') {
                    const nextOpts = getClassOptions('Tanding', nextAge);
                    if (!nextOpts.includes(weightClass)) {
                      setWeightClass(nextOpts[2] || nextOpts[0]);
                    }
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                {AGE_CATEGORIES.map((age) => (
                  <option key={age} value={age}>
                    {age}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="athlete-gender" className="block text-xs font-medium text-slate-400 mb-1">
                Jenis Kelamin
              </label>
              <select
                id="athlete-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as AthleteGender)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                <option value="Putra">Putra</option>
                <option value="Putri">Putri</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="athlete-comp-category" className="block text-xs font-medium text-slate-400 mb-1">
                Kategori Pertandingan
              </label>
              <select
                id="athlete-comp-category"
                value={competitionCategory}
                onChange={(e) => {
                  const nextCat = e.target.value as CompetitionCategory;
                  setCompetitionCategory(nextCat);
                  const nextOpts = getClassOptions(nextCat, ageCategory);
                  setWeightClass(
                    nextCat === 'Jurus' ? nextOpts[0] : nextOpts[2] || nextOpts[0]
                  );
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                {COMPETITION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="athlete-gelanggang" className="block text-xs font-medium text-slate-400 mb-1">
                Gelanggang Pertandingan
              </label>
              <select
                id="athlete-gelanggang"
                value={gelanggang}
                onChange={(e) => setGelanggang(e.target.value as ArenaCourt)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                {ARENA_COURTS.map((court) => (
                  <option key={court} value={court}>
                    Gelanggang {court}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="athlete-class" className="block text-xs font-medium text-slate-400 mb-1">
              Kelas Tanding
            </label>
            <select
              id="athlete-class"
              value={classOptions.includes(weightClass) ? weightClass : classOptions[0]}
              onChange={(e) => setWeightClass(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Simpan Atlet</span>
        </button>
      </form>

      <section className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-white">Daftar Atlet Terdaftar</h2>
            <span className="text-xs font-mono text-slate-400">({filteredAthletes.length})</span>
          </div>
          <select
            aria-label="Filter Kelas Atlet"
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="min-h-[38px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
          >
            {uniqueClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Excel Bulk Menu & Kosongkan */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-800">
          <button
            type="button"
            onClick={() => {
              downloadAthleteTemplateExcel();
              setFeedback('Template Excel berhasil diunduh.');
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Template Excel</span>
          </button>

          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>{isImporting ? 'Mengimpor...' : 'Import Excel'}</span>
          </button>
          <input
            ref={fileInputRef}
            aria-label="Upload File Excel Atlet"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => void handleImportChange(e)}
            className="sr-only"
          />

          <button
            type="button"
            disabled={athletes.length === 0}
            onClick={() => {
              exportAthletesExcel(athletes);
              setFeedback(`Data ${athletes.length} atlet berhasil diunduh ke Excel.`);
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Unduh Excel</span>
          </button>

          <button
            type="button"
            disabled={athletes.length === 0}
            onClick={() => setConfirmClear(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-800/70 text-red-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            <Eraser className="w-3.5 h-3.5 text-red-300" />
            <span>Kosongkan</span>
          </button>
        </div>

        {confirmClear && (
          <div
            role="alertdialog"
            aria-label="Konfirmasi Kosongkan Atlet"
            className="p-3 rounded-xl bg-red-950/60 border border-red-800 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="text-red-100 font-medium">
              Yakin hapus semua ({athletes.length}) data atlet terdaftar?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmClearAll()}
                className="min-h-[32px] px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
              >
                Ya, Kosongkan
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[32px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {filteredAthletes.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
            Belum ada atlet terdaftar. Tambahkan manual atau gunakan Import Excel di atas.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredAthletes.map((a, idx) => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">#{idx + 1}</span>
                    <span className="text-sm font-bold text-white truncate">{a.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold">
                      {a.gender}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold">
                      {a.ageCategory || 'Dewasa'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-semibold">
                      {a.competitionCategory || 'Tanding'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                      Gelanggang {a.gelanggang || 'A'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {a.contingent} &middot; {a.weightClass}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteAthlete(a.id)}
                  aria-label={`Hapus ${a.name}`}
                  title={`Hapus ${a.name}`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-red-900/70 text-red-300 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function BaganBracketPanel() {
  const {
    athletes,
    brackets,
    matches,
    activeMatch,
    generateBracket,
    activateBracketMatch,
    advanceBracketWinner,
    clearBracket,
  } = useArena();

  const [bracketMode, setBracketMode] = useState<BracketMode>('prestasi');
  const [poolSize, setPoolSize] = useState<PemasalanPoolSize>(4);
  const [competitionCategory, setCompetitionCategory] = useState<CompetitionCategory>('Tanding');
  const [ageCategory, setAgeCategory] = useState<AthleteAgeCategory | 'Semua'>('Semua');
  const [gender, setGender] = useState<AthleteGender>('Putra');
  const [weightClass, setWeightClass] = useState('Kelas B (50-55 kg)');
  const [gelanggang, setGelanggang] = useState<ArenaCourt | 'Semua'>('Semua');
  const [selectedPoolFilter, setSelectedPoolFilter] = useState<number | 'all'>('all');
  const [statusMsg, setStatusMsg] = useState('');

  const dynamicClassOptions = useMemo(() => {
    if (competitionCategory === 'Jurus') {
      return [...JURUS_SPECIFICATIONS];
    }
    if (ageCategory !== 'Semua') {
      return TANDING_CLASSES_BY_AGE[ageCategory] || TANDING_CLASSES_BY_AGE.Dewasa;
    }
    return Array.from(
      new Set([
        ...TANDING_CLASSES_BY_AGE.Dewasa,
        ...TANDING_CLASSES_BY_AGE.Remaja,
        ...TANDING_CLASSES_BY_AGE['Pra Remaja'],
        ...TANDING_CLASSES_BY_AGE['Usia Dini'],
      ])
    );
  }, [competitionCategory, ageCategory]);

  const effectiveWeightClass = dynamicClassOptions.includes(weightClass)
    ? weightClass
    : dynamicClassOptions[2] || dynamicClassOptions[0];

  const matchingAthletes = useMemo(() => {
    return athletes.filter((a) => {
      if (a.weightClass !== effectiveWeightClass || a.gender !== gender) return false;
      if ((a.competitionCategory || 'Tanding') !== competitionCategory) return false;
      if (ageCategory !== 'Semua' && (a.ageCategory || 'Dewasa') !== ageCategory) return false;
      if (gelanggang !== 'Semua' && (a.gelanggang || 'A') !== gelanggang) return false;
      return true;
    });
  }, [athletes, effectiveWeightClass, gender, competitionCategory, ageCategory, gelanggang]);

  const registeredCount = matchingAthletes.length;

  const currentSlots = useMemo(() => {
    return brackets
      .filter((b) => b.weightClass === effectiveWeightClass && b.gender === gender)
      .sort((a, b) => {
        const pa = a.poolIndex ?? 0;
        const pb = b.poolIndex ?? 0;
        if (pa !== pb) return pa - pb;
        if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
        return a.slotIndex - b.slotIndex;
      });
  }, [brackets, effectiveWeightClass, gender]);

  const poolsGrouped = useMemo(() => {
    const poolMap = new Map<
      number,
      { poolLabel: string; rounds: Map<number, BracketMatchSlot[]> }
    >();
    for (const slot of currentSlots) {
      const pIdx = slot.poolIndex ?? 0;
      let entry = poolMap.get(pIdx);
      if (!entry) {
        entry = {
          poolLabel:
            slot.poolLabel ||
            (slot.bracketMode === 'pemasalan'
              ? `Pool ${String.fromCharCode(65 + (pIdx % 26))}`
              : 'Bagan Prestasi'),
          rounds: new Map<number, BracketMatchSlot[]>(),
        };
        poolMap.set(pIdx, entry);
      }
      const rArr = entry.rounds.get(slot.roundIndex) || [];
      rArr.push(slot);
      entry.rounds.set(slot.roundIndex, rArr);
    }
    return Array.from(poolMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([poolIdx, entry]) => ({
        poolIdx,
        poolLabel: entry.poolLabel,
        rounds: Array.from(entry.rounds.entries()).sort((a, b) => a[0] - b[0]),
      }));
  }, [currentSlots]);

  const visiblePools = useMemo(() => {
    if (selectedPoolFilter === 'all') return poolsGrouped;
    const found = poolsGrouped.filter((p) => p.poolIdx === selectedPoolFilter);
    return found.length > 0 ? found : poolsGrouped;
  }, [poolsGrouped, selectedPoolFilter]);

  const estimatedSummary = useMemo(() => {
    if (registeredCount < 2) {
      return 'Butuh min. 2 atlet cocok untuk menyusun bagan';
    }
    if (bracketMode === 'pemasalan') {
      const pools = Math.ceil(registeredCount / poolSize);
      return `${pools} Bagan / Pool (maks. ${poolSize} atlet per bagan)`;
    }
    let size = 2;
    while (size < registeredCount) size *= 2;
    return `Sistem Gugur ${size} Slot (${registeredCount} peserta, ${size - registeredCount} BYE)`;
  }, [registeredCount, bracketMode, poolSize]);

  const runGenerateBracket = async (
    targetMode: BracketMode,
    targetPoolSize: PemasalanPoolSize = poolSize
  ) => {
    setSelectedPoolFilter('all');
    const res = await generateBracket({
      weightClass: effectiveWeightClass,
      gender,
      bracketMode: targetMode,
      poolSize: targetMode === 'pemasalan' ? targetPoolSize : undefined,
      ageCategory,
      competitionCategory,
      gelanggang,
    });
    if (res.error) {
      setStatusMsg(res.error);
    } else if (targetMode === 'pemasalan') {
      setStatusMsg(
        `Bagan Pemasalan (${targetPoolSize} peserta/bagan) berhasil dibuat: ${res.poolCount} pool, ${res.createdSlots} slot partai.`
      );
    } else {
      setStatusMsg(
        `Bagan Prestasi (Sistem Gugur) berhasil dibuat: ${res.createdSlots} slot pertandingan.`
      );
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Bagan Bracket Pertandingan</h2>
            <p className="text-xs text-slate-400 mt-0.5">{estimatedSummary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{registeredCount} Atlet Siap</span>
            </span>
            <button
              type="button"
              onClick={() => void runGenerateBracket(bracketMode, poolSize)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <GitBranch className="w-4 h-4" />
              <span>Buat Bagan Bracket</span>
            </button>
            {currentSlots.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPoolFilter('all');
                  setStatusMsg('');
                  void clearBracket(effectiveWeightClass, gender);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-900/70 border border-slate-700 text-red-300 font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Bagan</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode Bagan (Prestasi vs Pemasalan 2/4/6/8) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
          <button
            type="button"
            aria-pressed={bracketMode === 'prestasi'}
            onClick={() => {
              setBracketMode('prestasi');
              void runGenerateBracket('prestasi');
            }}
            className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
              bracketMode === 'prestasi'
                ? 'bg-amber-500/15 border-amber-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm flex items-center gap-2">
                <Trophy className={`w-4 h-4 ${bracketMode === 'prestasi' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Bagan Prestasi</span>
              </span>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">
                Sistem Gugur
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Seluruh atlet pada kelas terpilih dipertandingkan dalam 1 bagan gugur penuh.
            </p>
          </button>

          <div
            className={`text-left p-3.5 rounded-xl border transition-colors ${
              bracketMode === 'pemasalan'
                ? 'bg-amber-500/15 border-amber-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={bracketMode === 'pemasalan'}
                onClick={() => {
                  setBracketMode('pemasalan');
                  void runGenerateBracket('pemasalan', poolSize);
                }}
                className="font-bold text-sm flex items-center gap-2 cursor-pointer text-left hover:text-amber-300 transition-colors"
              >
                <Layers className={`w-4 h-4 ${bracketMode === 'pemasalan' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Bagan Pemasalan</span>
              </button>

              <div
                role="group"
                aria-label="Pilihan Ukuran Bagan Pemasalan"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono"
              >
                <span className="text-[11px] uppercase text-emerald-300 font-semibold mr-0.5">
                  Bagan
                </span>
                {([2, 4, 6, 8] as PemasalanPoolSize[]).map((sizeOption, idx) => {
                  const selected = bracketMode === 'pemasalan' && poolSize === sizeOption;
                  return (
                    <React.Fragment key={sizeOption}>
                      {idx > 0 && (
                        <span className="text-slate-600 select-none" aria-hidden="true">
                          /
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Bagan ${sizeOption}`}
                        aria-pressed={selected}
                        onClick={() => {
                          setBracketMode('pemasalan');
                          setPoolSize(sizeOption);
                          void runGenerateBracket('pemasalan', sizeOption);
                        }}
                        className={`min-w-[28px] min-h-[28px] px-1.5 rounded font-bold cursor-pointer transition-colors ${
                          selected
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-emerald-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {sizeOption}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Atlet dibagi otomatis per pool berisi maksimal 2, 4, 6, atau 8 peserta.
              {bracketMode === 'pemasalan' && registeredCount > 0
                ? ` (${Math.ceil(registeredCount / poolSize)} Pool · Bagan ${poolSize})`
                : ''}
            </p>
          </div>
        </div>

        {/* Filter Kelas & Gelanggang Proporsional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="bracket-comp-category" className="block text-xs font-medium text-slate-400 mb-1">
              Kategori Pertandingan
            </label>
            <select
              id="bracket-comp-category"
              value={competitionCategory}
              onChange={(e) => {
                const nextCat = e.target.value as CompetitionCategory;
                setCompetitionCategory(nextCat);
                const opts =
                  nextCat === 'Jurus'
                    ? [...JURUS_SPECIFICATIONS]
                    : ageCategory !== 'Semua'
                    ? TANDING_CLASSES_BY_AGE[ageCategory]
                    : TANDING_CLASSES_BY_AGE.Dewasa;
                setWeightClass(nextCat === 'Jurus' ? opts[0] : opts[2] || opts[0]);
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              {COMPETITION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bracket-age-category" className="block text-xs font-medium text-slate-400 mb-1">
              Kategori Usia
            </label>
            <select
              id="bracket-age-category"
              value={ageCategory}
              onChange={(e) => {
                const nextAge = e.target.value as AthleteAgeCategory | 'Semua';
                setAgeCategory(nextAge);
                if (competitionCategory === 'Tanding' && nextAge !== 'Semua') {
                  const opts = TANDING_CLASSES_BY_AGE[nextAge];
                  if (!opts.includes(effectiveWeightClass)) {
                    setWeightClass(opts[2] || opts[0]);
                  }
                }
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              <option value="Semua">Semua Usia</option>
              {AGE_CATEGORIES.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bracket-gender" className="block text-xs font-medium text-slate-400 mb-1">
              Jenis Kelamin
            </label>
            <select
              id="bracket-gender"
              value={gender}
              onChange={(e) => {
                setGender(e.target.value as AthleteGender);
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              <option value="Putra">Putra</option>
              <option value="Putri">Putri</option>
            </select>
          </div>

          <div>
            <label htmlFor="bracket-class" className="block text-xs font-medium text-slate-400 mb-1">
              {competitionCategory === 'Jurus' ? 'Jenis Jurus' : 'Kelas Tanding'}
            </label>
            <select
              id="bracket-class"
              value={effectiveWeightClass}
              onChange={(e) => {
                setWeightClass(e.target.value);
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              {dynamicClassOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bracket-gelanggang" className="block text-xs font-medium text-slate-400 mb-1">
              Gelanggang
            </label>
            <select
              id="bracket-gelanggang"
              value={gelanggang}
              onChange={(e) => {
                setGelanggang(e.target.value as ArenaCourt | 'Semua');
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              <option value="Semua">Semua Gelanggang</option>
              {ARENA_COURTS.map((court) => (
                <option key={court} value={court}>
                  Gelanggang {court}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {statusMsg && (
        <div role="status" className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-amber-300">
          {statusMsg}
        </div>
      )}

      {poolsGrouped.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedPoolFilter('all')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold border cursor-pointer ${
              selectedPoolFilter === 'all'
                ? 'bg-amber-500 border-amber-400 text-slate-950'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Semua Pool ({poolsGrouped.length})
          </button>
          {poolsGrouped.map((p) => (
            <button
              key={p.poolIdx}
              type="button"
              onClick={() => setSelectedPoolFilter(p.poolIdx)}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold border cursor-pointer ${
                selectedPoolFilter === p.poolIdx
                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {p.poolLabel}
            </button>
          ))}
        </div>
      )}

      {poolsGrouped.length === 0 ? (
        <section className="rounded-2xl bg-slate-900 border border-dashed border-slate-800 p-10 text-center text-sm text-slate-400">
          Belum ada bagan bracket untuk {effectiveWeightClass} ({gender}). Pastikan minimal 2 atlet terdaftar sesuai filter di{' '}
          <strong className="text-white">Input Atlet</strong>, lalu pilih <strong className="text-amber-400">Bagan Prestasi</strong> atau{' '}
          <strong className="text-amber-400">Bagan Pemasalan (2/4/6/8)</strong> dan tekan{' '}
          <strong className="text-amber-400">Buat Bagan Bracket</strong>.
        </section>
      ) : (
        <div className="space-y-6">
          {visiblePools.map((pool) => (
            <section
              key={pool.poolIdx}
              className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <h3 className="font-display text-lg font-bold text-amber-300">{pool.poolLabel}</h3>
                <span className="text-xs font-mono text-slate-400">
                  {effectiveWeightClass} &middot; {gender}
                </span>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="flex gap-5 min-w-max items-stretch">
                  {pool.rounds.map(([roundIdx, slots]) => (
                    <div key={roundIdx} className="w-80 shrink-0 space-y-3">
                      <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center font-display text-lg font-bold text-amber-400">
                        {slots[0]?.stage || `Babak ${roundIdx + 1}`}
                      </div>

                      <div className="space-y-4">
                        {slots.map((slot) => {
                          const linkedMatch = slot.matchId
                            ? matches.find((m) => m.id === slot.matchId)
                            : undefined;
                          const isActiveSlot = linkedMatch?.id === activeMatch.id;
                          const canPlay =
                            slot.blueName &&
                            slot.redName &&
                            slot.blueName !== 'BYE' &&
                            slot.redName !== 'BYE' &&
                            slot.blueName !== 'Menunggu Pemenang' &&
                            slot.redName !== 'Menunggu Pemenang';

                          return (
                            <div
                              key={slot.id}
                              className={`rounded-2xl bg-slate-900 border p-3.5 space-y-2.5 ${
                                isActiveSlot ? 'border-amber-400' : 'border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <span>Partai Bagan #{slot.slotIndex + 1}</span>
                                {linkedMatch && (
                                  <span className="text-amber-300 font-bold">
                                    {linkedMatch.matchNumber} ({linkedMatch.blueScore} - {linkedMatch.redScore})
                                  </span>
                                )}
                              </div>

                              <div
                                className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                                  slot.winnerSide === 'blue'
                                    ? 'bg-blue-950/70 border-blue-400'
                                    : 'bg-blue-950/30 border-blue-900/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">{slot.blueName}</div>
                                  <div className="text-[11px] text-blue-200/80 truncate">{slot.blueContingent}</div>
                                </div>
                                {slot.winnerSide === 'blue' && <Trophy className="w-4 h-4 text-amber-400 shrink-0" />}
                              </div>

                              <div
                                className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                                  slot.winnerSide === 'red'
                                    ? 'bg-red-950/70 border-red-400'
                                    : 'bg-red-950/30 border-red-900/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">{slot.redName}</div>
                                  <div className="text-[11px] text-red-200/80 truncate">{slot.redContingent}</div>
                                </div>
                                {slot.winnerSide === 'red' && <Trophy className="w-4 h-4 text-amber-400 shrink-0" />}
                              </div>

                              {canPlay && (
                                <div className="pt-1 flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void activateBracketMatch(slot.id)}
                                    className={`flex-1 min-h-[34px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
                                      isActiveSlot
                                        ? 'bg-emerald-950 border border-emerald-600 text-emerald-300'
                                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                                    }`}
                                  >
                                    <Play className="w-3 h-3" />
                                    <span>{isActiveSlot ? 'Aktif' : 'Aktifkan'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void advanceBracketWinner(slot.id, 'blue')}
                                    className="min-h-[34px] px-2.5 rounded-lg bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    Biru Lolos
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void advanceBracketWinner(slot.id, 'red')}
                                    className="min-h-[34px] px-2.5 rounded-lg bg-red-800 hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    Merah Lolos
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function KontrolPartaiPanel() {
  const {
    arena,
    matches,
    activeMatch,
    events,
    liveTimerMs,
    setActiveMatch,
    resetMatch,
    deleteMatch,
  } = useArena();

  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Kontrol Partai Gelanggang</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Aktifkan partai ke papan skor &amp; panel wasit/juri, reset skor, hapus partai, atau ekspor PDF.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-amber-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          {activeMatch.matchNumber} &middot; {formatMatchTime(liveTimerMs)} &middot; {matches.length} Partai
        </div>
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
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
                  <span className="text-blue-300">
                    {m.blueName} ({m.blueContingent})
                  </span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-red-300">
                    {m.redName} ({m.redContingent})
                  </span>
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
  );
}
