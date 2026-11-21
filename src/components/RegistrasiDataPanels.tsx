import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Eraser,
  Eye,
  FileDown,
  FileSpreadsheet,
  GitBranch,
  GripVertical,
  ImagePlus,
  Layers,
  Lock,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { readAndResizeAthletePhoto, resolveAthletePhoto } from '../utils/athletePhotos';
import { CountryFlag, INTERNATIONAL_COUNTRIES, resolveCountryInfo } from '../utils/countries';
import { useArena } from '../context/ArenaContext';
import type {
  ArenaCourt,
  AthleteAgeCategory,
  AthleteData,
  AthleteGender,
  BracketMatchSlot,
  BracketMode,
  CompetitionCategory,
  JurusCategory,
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
import {
  JURUS_DEFAULT_DURATION_SEC,
  JURUS_JUDGE_COUNT_OPTIONS,
  computeCornerJurusSummary,
  ensureJurusState,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchScore,
  formatMatchTime,
  getJurusJudgeCount,
  getJurusType,
  isJurusMatch,
} from '../utils/ipsiRules';
import {
  shuffleAllClassesMatchups,
  shuffleClassMatchups,
  swapMatchCorners,
  type CornerRef,
  type LotingMatchDraft,
} from '../utils/loting';
import { exportMatchPdf } from '../utils/pdfExport';

export function InputAtletPanel() {
  const {
    athletes,
    matches,
    activeMatch,
    addAthlete,
    updateAthlete,
    importAthletes,
    deleteAthlete,
    clearAthletes,
    applyLotingMatchAssignments,
    updateMatchMeta,
  } = useArena();
  const [name, setName] = useState('');
  const [contingent, setContingent] = useState('');
  const [country, setCountry] = useState('IDN');
  const [photo, setPhoto] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
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
  const photoInputRef = useRef<HTMLInputElement>(null);

  // State Menu Loting Partai
  const [showLotingModal, setShowLotingModal] = useState(false);
  const [lotingDrafts, setLotingDrafts] = useState<LotingMatchDraft[]>([]);
  const [lotingClassFilter, setLotingClassFilter] = useState<string>('Semua');
  const [lotingNotice, setLotingNotice] = useState('');
  const [lotingDirty, setLotingDirty] = useState(false);
  const [isSavingLoting, setIsSavingLoting] = useState(false);
  const [draggedCorner, setDraggedCorner] = useState<CornerRef | null>(null);
  const [dragOverCorner, setDragOverCorner] = useState<CornerRef | null>(null);
  const [selectedSwapCorner, setSelectedSwapCorner] = useState<CornerRef | null>(null);

  const classOptions = useMemo(
    () => getClassOptions(competitionCategory, ageCategory),
    [competitionCategory, ageCategory]
  );

  const selectedCountryInfo = useMemo(
    () => resolveCountryInfo(country, contingent),
    [country, contingent]
  );

  const resetFormFields = () => {
    setName('');
    setContingent('');
    setCountry('IDN');
    setPhoto('');
    setPhotoError('');
    setEditingAthleteId(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await readAndResizeAthletePhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Gagal memproses foto atlet.'
      );
    }
  };

  const handleEditAthlete = (ath: AthleteData) => {
    setEditingAthleteId(ath.id);
    setName(ath.name);
    setContingent(ath.contingent);
    setCountry(resolveCountryInfo(ath.country, ath.contingent).code);
    setPhoto(ath.photo || '');
    setPhotoError('');
    setAgeCategory(ath.ageCategory || 'Dewasa');
    setGender(ath.gender || 'Putra');
    setCompetitionCategory(ath.competitionCategory || 'Tanding');
    setWeightClass(ath.weightClass);
    setGelanggang(ath.gelanggang || 'A');
    setError('');
    setFeedback(`Mode ubah aktif untuk ${ath.name}. Perbarui data lalu tekan Simpan Perubahan.`);
  };

  const handleSyncToScoreboardCorner = async (ath: AthleteData, corner: 'blue' | 'red') => {
    const athCountry = resolveCountryInfo(ath.country, ath.contingent).code;
    await updateMatchMeta(
      activeMatch.id,
      corner === 'blue'
        ? {
            blueName: ath.name,
            blueContingent: ath.contingent,
            blueCountry: athCountry,
            bluePhoto: ath.photo || '',
          }
        : {
            redName: ath.name,
            redContingent: ath.contingent,
            redCountry: athCountry,
            redPhoto: ath.photo || '',
          }
    );
    setFeedback(
      `${ath.name} (${athCountry}) disinkronkan ke ${
        corner === 'blue' ? 'Sudut Biru' : 'Sudut Merah'
      } Scoreboard (${activeMatch.matchNumber}).`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contingent.trim() || !weightClass.trim()) {
      setError('Lengkapi nama atlet, kontingen, dan kelas tanding.');
      return;
    }
    setError('');
    setFeedback('');

    const normalizedCountry = resolveCountryInfo(country, contingent).code;
    if (editingAthleteId) {
      await updateAthlete(editingAthleteId, {
        name,
        contingent,
        country: normalizedCountry,
        photo,
        weightClass,
        gender,
        ageCategory,
        competitionCategory,
        gelanggang,
      });
      resetFormFields();
      setFeedback('Data, foto & negara atlet berhasil diperbarui dan disinkronkan ke partai aktif.');
      return;
    }

    await addAthlete({
      name,
      contingent,
      country: normalizedCountry,
      photo,
      weightClass,
      gender,
      ageCategory,
      competitionCategory,
      gelanggang,
    });
    resetFormFields();
    setFeedback('Atlet berhasil ditambahkan dan siap disinkronkan ke Scoreboard.');
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

  const athleteMatchNumbersMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ath of athletes) {
      const aName = ath.name.trim().toLowerCase();
      const aCont = ath.contingent.trim().toLowerCase();
      const matchedNums = matches
        .filter((m) => {
          const bName = m.blueName.trim().toLowerCase();
          const bCont = m.blueContingent.trim().toLowerCase();
          const rName = m.redName.trim().toLowerCase();
          const rCont = m.redContingent.trim().toLowerCase();
          const matchesBlue = bName === aName && (!aCont || !bCont || bCont === '-' || bCont === aCont);
          const matchesRed = rName === aName && (!aCont || !rCont || rCont === '-' || rCont === aCont);
          return matchesBlue || matchesRed;
        })
        .map((m) => m.matchNumber);
      map.set(ath.id, matchedNums.length > 0 ? matchedNums.join(', ') : '-');
    }
    return map;
  }, [athletes, matches]);

  const toLotingDrafts = (): LotingMatchDraft[] =>
    matches.map((m) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      weightClass: m.weightClass,
      stage: m.stage,
      competitionCategory: m.competitionCategory,
      jurusType: m.jurusType,
      status: m.status,
      blueName: m.blueName,
      blueContingent: m.blueContingent,
      blueCountry: m.blueCountry,
      bluePhoto: m.bluePhoto,
      redName: m.redName,
      redContingent: m.redContingent,
      redCountry: m.redCountry,
      redPhoto: m.redPhoto,
    }));

  const openLotingMenu = () => {
    setLotingDrafts(toLotingDrafts());
    setLotingClassFilter('Semua');
    setLotingNotice('');
    setLotingDirty(false);
    setDraggedCorner(null);
    setDragOverCorner(null);
    setSelectedSwapCorner(null);
    setShowLotingModal(true);
  };

  const lotingClasses = useMemo(() => {
    const classes = new Set<string>(lotingDrafts.map((m) => m.weightClass));
    return ['Semua', ...Array.from(classes)];
  }, [lotingDrafts]);

  const lotingGroups = useMemo(() => {
    const map = new Map<string, LotingMatchDraft[]>();
    for (const draft of lotingDrafts) {
      if (lotingClassFilter !== 'Semua' && draft.weightClass !== lotingClassFilter) {
        continue;
      }
      const list = map.get(draft.weightClass) || [];
      list.push(draft);
      map.set(draft.weightClass, list);
    }
    return Array.from(map.entries()).map(([weightClassLabel, items]) => ({
      weightClassLabel,
      items,
      waitingCount: items.filter((item) => item.status === 'waiting').length,
    }));
  }, [lotingDrafts, lotingClassFilter]);

  const handleShuffleAllClasses = () => {
    const waitingCount = lotingDrafts.filter((m) => m.status === 'waiting').length;
    if (waitingCount === 0) {
      setLotingNotice('Tidak ada partai berstatus Menunggu untuk diacak.');
      return;
    }
    setLotingDrafts((prev) => shuffleAllClassesMatchups(prev));
    setLotingDirty(true);
    setSelectedSwapCorner(null);
    setLotingNotice('Semua kelas berhasil diacak otomatis. Tekan "Simpan Hasil Loting" untuk menerapkan.');
  };

  const handleShuffleClass = (targetClass: string) => {
    const classItems = lotingDrafts.filter((m) => m.weightClass === targetClass);
    const waitingCount = classItems.filter((m) => m.status === 'waiting').length;
    if (waitingCount === 0) {
      setLotingNotice(`Tidak ada partai berstatus Menunggu pada kelas ${targetClass}.`);
      return;
    }
    const shuffledClass = shuffleClassMatchups(classItems);
    const shuffledById = new Map(shuffledClass.map((item) => [item.id, item]));
    setLotingDrafts((prev) => prev.map((item) => shuffledById.get(item.id) || item));
    setLotingDirty(true);
    setSelectedSwapCorner(null);
    setLotingNotice(
      `Pertemuan kelas ${targetClass} berhasil diacak otomatis. Tekan "Simpan Hasil Loting" untuk menerapkan.`
    );
  };

  const performCornerSwap = (from: CornerRef, to: CornerRef) => {
    const res = swapMatchCorners(lotingDrafts, from, to);
    if (!res.swapped) {
      if (res.reason) setLotingNotice(res.reason);
      return;
    }
    setLotingDrafts(res.updated);
    setLotingDirty(true);
    setLotingNotice('Posisi atlet berhasil ditukar. Tekan "Simpan Hasil Loting" untuk menyimpan perubahan.');
  };

  const handleSaveLoting = async () => {
    setIsSavingLoting(true);
    try {
      const updatedCount = await applyLotingMatchAssignments(
        lotingDrafts.map((d) => ({
          matchId: d.id,
          blueName: d.blueName,
          blueContingent: d.blueContingent,
          blueCountry: d.blueCountry,
          bluePhoto: d.bluePhoto,
          redName: d.redName,
          redContingent: d.redContingent,
          redCountry: d.redCountry,
          redPhoto: d.redPhoto,
        }))
      );
      setLotingDirty(false);
      setSelectedSwapCorner(null);
      setFeedback(
        updatedCount > 0
          ? `Hasil loting berhasil disimpan untuk ${updatedCount} partai.`
          : 'Tidak ada perubahan posisi partai untuk disimpan.'
      );
      setShowLotingModal(false);
    } finally {
      setIsSavingLoting(false);
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-[265px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)] gap-3.5 items-start">
      <div className="space-y-3 min-w-0">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3.5 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-yellow-300" />
            <h2 className="font-display text-lg font-bold text-yellow-300">
              {editingAthleteId ? 'Ubah Data Atlet' : 'Input Atlet'}
            </h2>
          </div>
          {editingAthleteId && (
            <button
              type="button"
              onClick={() => {
                resetFormFields();
                setFeedback('');
              }}
              className="px-2 py-0.5 rounded-md bg-purple-950 hover:bg-purple-900 border border-purple-500/50 text-[10px] font-bold text-blue-200 cursor-pointer"
            >
              Batal Ubah
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-[11px] text-red-300 font-medium">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="text-[11px] text-yellow-300 font-medium">
            {feedback}
          </p>
        )}

        <div className="space-y-2.5">
          {/* Upload Foto Atlet & Preview */}
          <div className="rounded-xl bg-black/55 border border-purple-700/55 p-2.5 flex items-center gap-2.5">
            <div className="relative w-14 h-18 rounded-lg overflow-hidden border border-blue-400/50 bg-[#070b18] shrink-0">
              <img
                src={resolveAthletePhoto(photo, 'blue', weightClass).src}
                alt="Preview Foto Atlet"
                className="w-full h-full object-cover object-top"
              />
              {!photo && (
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-bold uppercase tracking-wider text-center text-blue-200 py-0.5">
                  Default
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-[11px] font-medium text-blue-200">
                Foto Atlet (Scoreboard)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  data-testid="upload-athlete-photo-btn"
                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-blue-950/90 hover:bg-blue-900 border border-blue-500/50 hover:border-yellow-400 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                  <span>{photo ? 'Ganti Foto' : 'Upload Foto'}</span>
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto('');
                      setPhotoError('');
                    }}
                    aria-label="Hapus foto atlet"
                    className="min-h-[30px] px-2 py-1 rounded-lg bg-red-950/75 hover:bg-red-900 border border-red-500/50 text-[11px] font-semibold text-rose-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
              <input
                ref={photoInputRef}
                aria-label="Upload Foto Atlet"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handlePhotoUpload(e)}
                className="sr-only"
              />
              {photoError ? (
                <p className="text-[10px] text-red-300 leading-tight">{photoError}</p>
              ) : (
                <p className="text-[10px] text-blue-300/70 leading-tight">
                  JPG/PNG/WEBP, otomatis dikompresi &amp; sinkron ke Scoreboard.
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="athlete-name" className="block text-[11px] font-medium text-blue-200 mb-1">
              Nama Atlet
            </label>
            <input
              id="athlete-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap pesilat"
              maxLength={80}
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div>
            <label htmlFor="athlete-contingent" className="block text-[11px] font-medium text-blue-200 mb-1">
              Kontingen / Perguruan
            </label>
            <input
              id="athlete-contingent"
              type="text"
              value={contingent}
              onChange={(e) => setContingent(e.target.value)}
              placeholder="Contoh: DKI Jakarta"
              maxLength={80}
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white placeholder:text-blue-300/60 focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div>
            <label htmlFor="athlete-country" className="block text-[11px] font-medium text-blue-200 mb-1">
              Negara Asal
            </label>
            <div className="flex items-center gap-2">
              <div className="min-h-[36px] px-2 rounded-lg bg-black/65 border border-blue-500/45 flex items-center justify-center shrink-0">
                <CountryFlag
                  code={selectedCountryInfo.code}
                  name={selectedCountryInfo.name}
                  className="w-6 h-4"
                />
              </div>
              <select
                id="athlete-country"
                value={selectedCountryInfo.code}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                {INTERNATIONAL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="athlete-age-category" className="block text-[11px] font-medium text-blue-200 mb-1">
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
                className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                {AGE_CATEGORIES.map((age) => (
                  <option key={age} value={age}>
                    {age}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="athlete-gender" className="block text-[11px] font-medium text-blue-200 mb-1">
                Jenis Kelamin
              </label>
              <select
                id="athlete-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as AthleteGender)}
                className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="Putra">Putra</option>
                <option value="Putri">Putri</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="athlete-comp-category" className="block text-[11px] font-medium text-blue-200 mb-1">
                Kategori
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
                className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                {COMPETITION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="athlete-gelanggang" className="block text-[11px] font-medium text-blue-200 mb-1">
                Gelanggang
              </label>
              <select
                id="athlete-gelanggang"
                value={gelanggang}
                onChange={(e) => setGelanggang(e.target.value as ArenaCourt)}
                className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                {ARENA_COURTS.map((court) => (
                  <option key={court} value={court}>
                    Gel. {court}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="athlete-class" className="block text-[11px] font-medium text-blue-200 mb-1">
              Kelas Tanding
            </label>
            <select
              id="athlete-class"
              value={classOptions.includes(weightClass) ? weightClass : classOptions[0]}
              onChange={(e) => setWeightClass(e.target.value)}
              className="w-full min-h-[36px] px-2 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
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
          className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          {editingAthleteId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{editingAthleteId ? 'Simpan Perubahan' : 'Simpan Atlet'}</span>
        </button>
      </form>

      {/* Menu Template Excel, Import Excel, Unduh Excel & Kosongkan (di kolom kiri di bawah Input Atlet) */}
      <section
        aria-label="Kelola Excel dan Data Atlet"
        className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3 space-y-2.5"
      >
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              downloadAthleteTemplateExcel();
              setFeedback('Template Excel berhasil diunduh.');
            }}
            className="min-h-[34px] px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 hover:border-yellow-400 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
            <span className="truncate">Template Excel</span>
          </button>

          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[34px] px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 hover:border-yellow-400 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
            <span className="truncate">{isImporting ? 'Mengimpor...' : 'Import Excel'}</span>
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
            className="min-h-[34px] px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 hover:border-yellow-400 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span className="truncate">Unduh Excel</span>
          </button>

          <button
            type="button"
            disabled={athletes.length === 0}
            onClick={() => setConfirmClear(true)}
            className="min-h-[34px] px-2 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/60 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Eraser className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
            <span className="truncate">Kosongkan</span>
          </button>
        </div>

        {confirmClear && (
          <div
            role="alertdialog"
            aria-label="Konfirmasi Kosongkan Atlet"
            className="p-2.5 rounded-xl bg-red-950/75 border border-red-500/70 space-y-2 text-[11px]"
          >
            <div className="text-white font-medium">
              Yakin hapus semua ({athletes.length}) data atlet terdaftar?
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmClearAll()}
                className="min-h-[30px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
              >
                Ya, Kosongkan
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[30px] px-2.5 rounded-lg bg-blue-950/90 hover:bg-blue-900 border border-blue-500/45 text-white font-semibold cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </section>
      </div>

      <section className="min-w-0 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-purple-800/60">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg sm:text-xl font-bold text-yellow-300">Daftar Atlet Terdaftar</h2>
            <span className="text-xs font-mono text-blue-200">({filteredAthletes.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openLotingMenu}
              data-testid="open-loting-menu-btn"
              className="min-h-[34px] px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Loting</span>
            </button>
            <select
              aria-label="Filter Kelas Atlet"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="min-h-[34px] px-2.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
            >
              {uniqueClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredAthletes.length === 0 ? (
          <div className="py-10 text-center text-sm text-blue-200 border border-dashed border-purple-700/60 rounded-xl bg-black/45">
            Belum ada atlet terdaftar. Tambahkan manual atau gunakan Import Excel di kolom kiri.
          </div>
        ) : (
          <div className="overflow-x-auto lg:overflow-x-visible rounded-xl border border-purple-800/60 bg-black/45">
            <table className="w-full text-center border-collapse text-[11px]">
              <thead>
                <tr className="bg-purple-950/75 border-b border-purple-700/70 divide-x divide-purple-700/75 text-[10px] font-bold uppercase tracking-wide text-yellow-300">
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Partai</th>
                  <th className="py-1.5 px-2 text-left">Atlet / Negara / Kontingen</th>
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Gender</th>
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Kategori Usia</th>
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Disiplin</th>
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Gelanggang</th>
                  <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Aksi &amp; Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-800/50">
                {filteredAthletes.map((a) => {
                  const partaiLabel = athleteMatchNumbersMap.get(a.id) || '-';
                  const disiplinLabel = a.competitionCategory || 'Tanding';
                  const ageLabel = a.ageCategory || 'Dewasa';
                  const gelanggangLabel = `Gel. ${a.gelanggang || 'A'}`;
                  const countryInfo = resolveCountryInfo(a.country, a.contingent);
                  const photoPreview = resolveAthletePhoto(a.photo, 'blue', a.weightClass);
                  return (
                    <tr
                      key={a.id}
                      className="divide-x divide-purple-800/60 hover:bg-blue-950/35 transition-colors align-middle"
                    >
                      <td className="py-1 px-1.5 text-center whitespace-nowrap font-mono font-bold text-yellow-300">
                        {partaiLabel}
                      </td>
                      <td className="py-1 px-2 text-left min-w-0 max-w-[230px] xl:max-w-[290px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative w-8 h-10 rounded-md overflow-hidden border border-purple-500/50 bg-black shrink-0">
                            <img
                              src={photoPreview.src}
                              alt={a.name}
                              className="w-full h-full object-cover object-top"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CountryFlag
                                code={countryInfo.code}
                                name={countryInfo.name}
                                className="w-4 h-3 shrink-0"
                              />
                              <span className="font-mono text-[9px] font-extrabold text-yellow-300 shrink-0">
                                {countryInfo.code}
                              </span>
                              <span className="font-bold text-white leading-tight truncate">
                                {a.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-blue-200/85 leading-tight truncate">
                              {a.contingent} &middot; {a.weightClass}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-1 px-1.5 text-center whitespace-nowrap font-semibold text-[11px] text-yellow-300">
                        {a.gender}
                      </td>
                      <td className="py-1 px-1.5 text-center whitespace-nowrap font-medium text-[11px] text-blue-200">
                        {ageLabel}
                      </td>
                      <td
                        className={`py-1 px-1.5 text-center whitespace-nowrap font-semibold text-[11px] ${
                          disiplinLabel === 'Jurus' ? 'text-yellow-300' : 'text-white'
                        }`}
                      >
                        {disiplinLabel}
                      </td>
                      <td className="py-1 px-1.5 text-center whitespace-nowrap font-bold text-[11px] text-yellow-300">
                        {gelanggangLabel}
                      </td>
                      <td className="py-1 px-1.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleSyncToScoreboardCorner(a, 'blue')}
                            title={`Pasang ${a.name} ke Sudut Biru (${activeMatch.matchNumber})`}
                            className="min-h-[26px] px-1.5 rounded-md bg-blue-700/85 hover:bg-blue-600 border border-sky-400/55 text-[10px] font-bold text-white cursor-pointer transition-colors"
                          >
                            Biru
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSyncToScoreboardCorner(a, 'red')}
                            title={`Pasang ${a.name} ke Sudut Merah (${activeMatch.matchNumber})`}
                            className="min-h-[26px] px-1.5 rounded-md bg-red-700/85 hover:bg-red-600 border border-rose-400/55 text-[10px] font-bold text-white cursor-pointer transition-colors"
                          >
                            Merah
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditAthlete(a)}
                            aria-label={`Ubah ${a.name}`}
                            title={`Ubah data & foto ${a.name}`}
                            className="min-h-[26px] min-w-[26px] inline-flex items-center justify-center rounded-lg bg-blue-950/80 hover:bg-yellow-400 border border-blue-500/45 text-blue-200 hover:text-black cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteAthlete(a.id)}
                            aria-label={`Hapus ${a.name}`}
                            title={`Hapus ${a.name}`}
                            className="min-h-[26px] min-w-[26px] inline-flex items-center justify-center rounded-lg bg-blue-950/80 hover:bg-red-700 border border-blue-500/45 text-yellow-300 hover:text-white cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>

    {/* Pop-up Menu Loting Pertemuan Partai */}
    {showLotingModal && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu Loting Partai"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-1.5 sm:p-2.5"
      >
        <div className="w-full h-full max-w-none rounded-xl sm:rounded-2xl bg-[#110624] border-2 border-purple-500/75 shadow-2xl flex flex-col overflow-hidden">
          {/* Header Modal Loting */}
          <div className="px-3.5 sm:px-5 py-2.5 border-b border-purple-800/70 flex items-center justify-between gap-3 bg-gradient-to-r from-purple-950 via-[#16082f] to-black">
            <div className="flex items-center gap-2 min-w-0">
              <Shuffle className="w-5 h-5 text-yellow-300 shrink-0" />
              <h2 className="font-display text-lg sm:text-xl font-bold text-yellow-300 truncate">
                Menu Loting Pertemuan Partai ({lotingDrafts.length} Partai)
              </h2>
            </div>
            <button
              type="button"
              aria-label="Tutup Menu Loting"
              onClick={() => setShowLotingModal(false)}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-purple-900/70 text-blue-200 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bar Kontrol Loting */}
          <div className="px-3.5 sm:px-5 py-2 border-b border-purple-800/50 bg-black/45 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter Kelas Loting"
                value={lotingClassFilter}
                onChange={(e) => setLotingClassFilter(e.target.value)}
                className="min-h-[34px] px-2.5 rounded-lg bg-black/75 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                {lotingClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls === 'Semua' ? `Semua Kelas (${lotingDrafts.length} Partai)` : cls}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleShuffleAllClasses}
                data-testid="loting-shuffle-all-btn"
                className="min-h-[34px] px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Acak Semua Kelas</span>
              </button>

              {lotingDirty && (
                <button
                  type="button"
                  onClick={() => {
                    setLotingDrafts(toLotingDrafts());
                    setLotingDirty(false);
                    setSelectedSwapCorner(null);
                    setLotingNotice('Perubahan loting dikembalikan ke kondisi awal.');
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {lotingNotice && (
            <div
              role="status"
              className="px-4 sm:px-6 py-2.5 bg-blue-950/75 border-b border-blue-500/45 text-xs text-yellow-300 font-medium"
            >
              {lotingNotice}
            </div>
          )}

          {/* Daftar Semua Partai Terdaftar Dikelompokkan Per Kelas */}
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2">
            {lotingGroups.length === 0 ? (
              <div className="rounded-xl bg-black/55 border border-dashed border-purple-700/60 p-8 text-center text-sm text-blue-200">
                Belum ada partai terdaftar. Buat partai melalui <strong className="text-yellow-300">Bagan Bracket</strong> atau{' '}
                <strong className="text-yellow-300">Kontrol Partai</strong> terlebih dahulu.
              </div>
            ) : (
              lotingGroups.map((group) => (
                <section
                  key={group.weightClassLabel}
                  aria-label={`Kelas ${group.weightClassLabel}`}
                  className="rounded-xl bg-black/55 border border-purple-700/60 p-2.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-purple-800/50">
                    <span className="font-display text-sm sm:text-base font-bold text-yellow-300">
                      {group.weightClassLabel}
                    </span>

                    <button
                      type="button"
                      disabled={group.waitingCount === 0}
                      onClick={() => handleShuffleClass(group.weightClassLabel)}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-purple-800/80 hover:bg-purple-700 border border-purple-400/50 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Shuffle className="w-3 h-3 text-yellow-300" />
                      <span>Acak Kelas Ini</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {group.items.map((m) => {
                      const isEditable = m.status === 'waiting';
                      const mIsJurus = isJurusMatch(m);
                      const statusLabel = getMatchStatusLabel(m.status);

                      const renderCornerSlot = (corner: 'blue' | 'red') => {
                        const isBlue = corner === 'blue';
                        const athleteName = isBlue ? m.blueName : m.redName;
                        const athleteContingent = isBlue ? m.blueContingent : m.redContingent;
                        const isDraggingSelf =
                          draggedCorner?.matchId === m.id && draggedCorner?.corner === corner;
                        const isDragOverTarget =
                          dragOverCorner?.matchId === m.id && dragOverCorner?.corner === corner;
                        const isSelected =
                          selectedSwapCorner?.matchId === m.id && selectedSwapCorner?.corner === corner;
                        const canDropHere =
                          isEditable &&
                          draggedCorner !== null &&
                          !(draggedCorner.matchId === m.id && draggedCorner.corner === corner) &&
                          lotingDrafts.find((d) => d.id === draggedCorner.matchId)?.weightClass.trim() ===
                            m.weightClass.trim();

                        return (
                          <div
                            draggable={isEditable}
                            data-testid={`loting-corner-${m.id}-${corner}`}
                            onDragStart={(e) => {
                              if (!isEditable) return;
                              setSelectedSwapCorner(null);
                              setDraggedCorner({ matchId: m.id, corner });
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', `${m.id}:${corner}`);
                            }}
                            onDragOver={(e) => {
                              if (!isEditable) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (
                                dragOverCorner?.matchId !== m.id ||
                                dragOverCorner?.corner !== corner
                              ) {
                                setDragOverCorner({ matchId: m.id, corner });
                              }
                            }}
                            onDragLeave={() => {
                              if (
                                dragOverCorner?.matchId === m.id &&
                                dragOverCorner?.corner === corner
                              ) {
                                setDragOverCorner(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!isEditable) return;
                              let source = draggedCorner;
                              if (!source) {
                                const raw = e.dataTransfer.getData('text/plain');
                                const [srcId, srcCorner] = raw.split(':');
                                if (srcId && (srcCorner === 'blue' || srcCorner === 'red')) {
                                  source = { matchId: srcId, corner: srcCorner };
                                }
                              }
                              setDragOverCorner(null);
                              setDraggedCorner(null);
                              if (source) {
                                performCornerSwap(source, { matchId: m.id, corner });
                              }
                            }}
                            onDragEnd={() => {
                              setDraggedCorner(null);
                              setDragOverCorner(null);
                            }}
                            onClick={() => {
                              if (!isEditable) return;
                              if (!selectedSwapCorner) {
                                setSelectedSwapCorner({ matchId: m.id, corner });
                                setLotingNotice(
                                  `Terpilih: ${athleteName}. Tarik atau klik atlet lain di kelas ${m.weightClass} untuk menukar.`
                                );
                                return;
                              }
                              if (
                                selectedSwapCorner.matchId === m.id &&
                                selectedSwapCorner.corner === corner
                              ) {
                                setSelectedSwapCorner(null);
                                return;
                              }
                              const source = selectedSwapCorner;
                              setSelectedSwapCorner(null);
                              performCornerSwap(source, { matchId: m.id, corner });
                            }}
                            title={
                              isEditable
                                ? 'Tarik untuk memindahkan atau klik untuk menukar posisi atlet'
                                : 'Partai sedang berjalan/selesai (terkunci)'
                            }
                            className={`rounded-md px-2 py-1 border flex items-center justify-between gap-1.5 min-w-0 transition-all select-none ${
                              isEditable ? 'cursor-grab active:cursor-grabbing' : 'opacity-70 cursor-not-allowed'
                            } ${
                              isSelected || (isDragOverTarget && canDropHere)
                                ? 'ring-2 ring-yellow-400 border-yellow-400 bg-yellow-400/15'
                                : isBlue
                                ? 'bg-blue-950/65 border-blue-500/45 hover:border-yellow-400/70'
                                : 'bg-red-950/65 border-red-500/45 hover:border-yellow-400/70'
                            } ${isDraggingSelf ? 'opacity-45 scale-[0.99]' : ''}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isEditable ? (
                                <GripVertical
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isBlue ? 'text-blue-300' : 'text-red-300'
                                  }`}
                                />
                              ) : (
                                <Lock className="w-3 h-3 shrink-0 text-blue-300/70" />
                              )}
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white leading-tight truncate">
                                  {athleteName}
                                </div>
                                <div className="text-[9px] text-blue-200/80 leading-tight truncate">
                                  {athleteContingent}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div
                          key={m.id}
                          className="rounded-lg bg-[#0d051c]/90 border border-purple-800/60 px-2 py-1.5 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1.5 text-[10px] min-w-0">
                            <div className="flex items-center gap-1 min-w-0 truncate">
                              <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 font-mono font-bold shrink-0">
                                {m.matchNumber}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                  mIsJurus
                                    ? 'bg-purple-800/85 text-yellow-300'
                                    : 'bg-blue-900/85 text-blue-100'
                                }`}
                              >
                                {mIsJurus ? `Jurus · ${getJurusType(m)}` : 'Tanding'}
                              </span>
                              <span className="text-white font-semibold truncate">{m.stage}</span>
                            </div>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${
                                isEditable
                                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                                  : 'bg-purple-950/80 border-purple-500/50 text-blue-200'
                              }`}
                            >
                              {isEditable ? 'Siap Loting' : `Terkunci (${statusLabel})`}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            {renderCornerSlot('blue')}
                            {renderCornerSlot('red')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>

          {/* Footer Modal Loting */}
          <div className="px-3.5 sm:px-5 py-2.5 border-t border-purple-800/70 bg-black/60 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-blue-200">
              {lotingDirty
                ? 'Ada perubahan hasil loting yang belum disimpan.'
                : 'Semua susunan partai sesuai data tersimpan.'}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setShowLotingModal(false)}
                className="min-h-[36px] px-4 py-1.5 rounded-xl bg-blue-950/85 hover:bg-blue-900 border border-blue-500/50 text-xs font-bold text-white cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={!lotingDirty || isSavingLoting}
                onClick={() => void handleSaveLoting()}
                data-testid="save-loting-btn"
                className="min-h-[36px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>{isSavingLoting ? 'Menyimpan...' : 'Simpan Hasil Loting'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export function BaganBracketPanel() {
  const {
    athletes,
    brackets,
    generateBracket,
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Kolom Kiri: Menu Kontrol Bagan Bracket */}
      <section
        aria-label="Menu Kontrol Bagan Bracket"
        className="lg:col-span-5 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-5"
      >
        {/* Header Bar */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-purple-800/60">
          <div>
            <h2 className="font-display text-xl font-bold text-yellow-300">Bagan Bracket Pertandingan</h2>
            <p className="text-xs text-blue-200 mt-0.5">{estimatedSummary}</p>
          </div>
          <span className="min-h-[34px] px-3 py-1 rounded-xl bg-black/65 border border-blue-500/45 text-xs font-mono text-yellow-300 flex items-center gap-1.5 shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>{registeredCount} Atlet Siap</span>
          </span>
        </div>

        {/* Mode Bagan (Prestasi vs Pemasalan 2/4/6/8) */}
        <div className="space-y-3">
          <button
            type="button"
            aria-pressed={bracketMode === 'prestasi'}
            onClick={() => {
              setBracketMode('prestasi');
              void runGenerateBracket('prestasi');
            }}
            className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
              bracketMode === 'prestasi'
                ? 'bg-yellow-400/15 border-yellow-400 text-white'
                : 'bg-black/65 border-blue-500/40 text-blue-100 hover:border-yellow-400/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm flex items-center gap-2">
                <Trophy className={`w-4 h-4 ${bracketMode === 'prestasi' ? 'text-yellow-300' : 'text-blue-300'}`} />
                <span>Bagan Prestasi</span>
              </span>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-blue-950/80 border border-blue-500/45 text-yellow-300">
                Sistem Gugur
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-1.5">
              Seluruh atlet pada kelas terpilih dipertandingkan dalam 1 bagan gugur penuh.
            </p>
          </button>

          <div
            className={`text-left p-3.5 rounded-xl border transition-colors ${
              bracketMode === 'pemasalan'
                ? 'bg-yellow-400/15 border-yellow-400 text-white'
                : 'bg-black/65 border-blue-500/40 text-blue-100 hover:border-yellow-400/70'
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
                className="font-bold text-sm flex items-center gap-2 cursor-pointer text-left hover:text-yellow-300 transition-colors"
              >
                <Layers className={`w-4 h-4 ${bracketMode === 'pemasalan' ? 'text-yellow-300' : 'text-blue-300'}`} />
                <span>Bagan Pemasalan</span>
              </button>

              <div
                role="group"
                aria-label="Pilihan Ukuran Bagan Pemasalan"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-950/85 border border-blue-500/50 text-xs font-mono"
              >
                <span className="text-[11px] uppercase text-blue-200 font-semibold mr-0.5">
                  Bagan
                </span>
                {([2, 4, 6, 8] as PemasalanPoolSize[]).map((sizeOption, idx) => {
                  const selected = bracketMode === 'pemasalan' && poolSize === sizeOption;
                  return (
                    <React.Fragment key={sizeOption}>
                      {idx > 0 && (
                        <span className="text-blue-400/60 select-none" aria-hidden="true">
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
                            ? 'bg-yellow-400 text-black'
                            : 'text-white hover:bg-blue-900 hover:text-yellow-300'
                        }`}
                      >
                        {sizeOption}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-blue-200 mt-1.5">
              Atlet dibagi otomatis per pool berisi maksimal 2, 4, 6, atau 8 peserta.
              {bracketMode === 'pemasalan' && registeredCount > 0
                ? ` (${Math.ceil(registeredCount / poolSize)} Pool · Bagan ${poolSize})`
                : ''}
            </p>
          </div>
        </div>

        {/* Filter Kelas & Gelanggang */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="bracket-comp-category" className="block text-xs font-medium text-blue-200 mb-1">
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
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
            >
              {COMPETITION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bracket-age-category" className="block text-xs font-medium text-blue-200 mb-1">
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
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
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
            <label htmlFor="bracket-gender" className="block text-xs font-medium text-blue-200 mb-1">
              Jenis Kelamin
            </label>
            <select
              id="bracket-gender"
              value={gender}
              onChange={(e) => {
                setGender(e.target.value as AthleteGender);
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="Putra">Putra</option>
              <option value="Putri">Putri</option>
            </select>
          </div>

          <div>
            <label htmlFor="bracket-gelanggang" className="block text-xs font-medium text-blue-200 mb-1">
              Gelanggang
            </label>
            <select
              id="bracket-gelanggang"
              value={gelanggang}
              onChange={(e) => {
                setGelanggang(e.target.value as ArenaCourt | 'Semua');
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="Semua">Semua Gelanggang</option>
              {ARENA_COURTS.map((court) => (
                <option key={court} value={court}>
                  Gelanggang {court}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bracket-class" className="block text-xs font-medium text-blue-200 mb-1">
              {competitionCategory === 'Jurus' ? 'Jenis Jurus' : 'Kelas Tanding'}
            </label>
            <select
              id="bracket-class"
              value={effectiveWeightClass}
              onChange={(e) => {
                setWeightClass(e.target.value);
                setStatusMsg('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-black/65 border border-blue-500/45 text-sm text-white focus:outline-none focus:border-yellow-400"
            >
              {dynamicClassOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => void runGenerateBracket(bracketMode, poolSize)}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
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
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-950/75 hover:bg-red-800 border border-red-500/60 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Trash2 className="w-4 h-4 text-yellow-300" />
              <span>Hapus Bagan</span>
            </button>
          )}
        </div>

        {statusMsg && (
          <div role="status" className="px-4 py-3 rounded-xl bg-black/65 border border-blue-500/50 text-xs text-yellow-300">
            {statusMsg}
          </div>
        )}
      </section>

      {/* Kolom Kanan: Preview Bagan Bracket */}
      <section
        aria-label="Preview Bagan Bracket"
        className="lg:col-span-7 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-purple-800/60">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-yellow-300 shrink-0" />
            <div>
              <h3 className="font-display text-lg font-bold text-yellow-300">Preview Bagan Bracket</h3>
              <p className="text-xs text-blue-200">
                {competitionCategory} &middot; {ageCategory === 'Semua' ? 'Semua Usia' : ageCategory} &middot; {effectiveWeightClass} ({gender}) &middot;{' '}
                {gelanggang === 'Semua' ? 'Semua Gelanggang' : `Gelanggang ${gelanggang}`}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-500/45 text-[11px] font-mono uppercase text-yellow-300">
            {bracketMode === 'pemasalan' ? `Pemasalan · Bagan ${poolSize}` : 'Prestasi · Gugur'}
          </span>
        </div>

        {poolsGrouped.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedPoolFilter('all')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                selectedPoolFilter === 'all'
                  ? 'bg-yellow-400 border-yellow-300 text-black'
                  : 'bg-blue-950/80 border-blue-500/45 text-white hover:bg-blue-900'
              }`}
            >
              Semua Pool ({poolsGrouped.length})
            </button>
            {poolsGrouped.map((p) => (
              <button
                key={p.poolIdx}
                type="button"
                onClick={() => setSelectedPoolFilter(p.poolIdx)}
                className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                  selectedPoolFilter === p.poolIdx
                    ? 'bg-yellow-400 border-yellow-300 text-black'
                    : 'bg-blue-950/80 border-blue-500/45 text-white hover:bg-blue-900'
                }`}
              >
                {p.poolLabel}
              </button>
            ))}
          </div>
        )}

        {poolsGrouped.length === 0 ? (
          <div className="rounded-2xl bg-black/45 border border-dashed border-purple-700/60 p-8 text-center text-sm text-blue-200 space-y-3">
            <p>
              Belum ada bagan bracket untuk {effectiveWeightClass} ({gender}). Pastikan minimal 2 atlet terdaftar sesuai filter di{' '}
              <strong className="text-white">Input Atlet</strong>, lalu pilih <strong className="text-yellow-300">Bagan Prestasi</strong> atau{' '}
              <strong className="text-yellow-300">Bagan Pemasalan (2/4/6/8)</strong> dan tekan{' '}
              <strong className="text-yellow-300">Buat Bagan Bracket</strong>.
            </p>
            {matchingAthletes.length > 0 && (
              <div className="pt-3 border-t border-purple-800/50 text-left space-y-2">
                <div className="text-xs font-semibold text-yellow-300">
                  Peserta Cocok dengan Filter ({matchingAthletes.length} Atlet):
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchingAthletes.map((athlete) => (
                    <span
                      key={athlete.id}
                      className="px-2.5 py-1 rounded-lg bg-blue-950/70 border border-blue-500/40 text-xs text-white"
                    >
                      {athlete.name} <span className="text-blue-300">({athlete.contingent})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {visiblePools.map((pool) => (
              <div
                key={pool.poolIdx}
                className="rounded-2xl bg-black/50 border border-purple-700/60 p-4 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-800/60">
                  <h4 className="font-display text-lg font-bold text-yellow-300">{pool.poolLabel}</h4>
                  <span className="text-xs font-mono text-blue-200">
                    {effectiveWeightClass} &middot; {gender}
                  </span>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-5 min-w-max items-stretch">
                    {pool.rounds.map(([roundIdx, slots]) => (
                      <div key={roundIdx} className="w-72 shrink-0 space-y-3">
                        <div className="px-3 py-2 rounded-xl bg-black/65 border border-blue-500/45 text-center font-display text-base font-bold text-yellow-300">
                          {slots[0]?.stage || `Babak ${roundIdx + 1}`}
                        </div>

                        <div className="space-y-3">
                          {slots.map((slot) => (
                            <div
                              key={slot.id}
                              className="rounded-2xl bg-black/65 border border-purple-700/60 p-3 space-y-2"
                            >
                              <div
                                className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                                  slot.winnerSide === 'blue'
                                    ? 'bg-blue-950/85 border-blue-400'
                                    : 'bg-blue-950/45 border-blue-700/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">{slot.blueName}</div>
                                  <div className="text-[11px] text-blue-200/85 truncate">{slot.blueContingent}</div>
                                </div>
                                {slot.winnerSide === 'blue' && <Trophy className="w-4 h-4 text-yellow-300 shrink-0" />}
                              </div>

                              <div
                                className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                                  slot.winnerSide === 'red'
                                    ? 'bg-red-950/85 border-red-400'
                                    : 'bg-red-950/45 border-red-700/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">{slot.redName}</div>
                                  <div className="text-[11px] text-red-200/85 truncate">{slot.redContingent}</div>
                                </div>
                                {slot.winnerSide === 'red' && <Trophy className="w-4 h-4 text-yellow-300 shrink-0" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


function getMatchStatusLabel(status: string): string {
  if (status === 'waiting') return 'Menunggu';
  if (status === 'active') return 'Berjalan';
  if (status === 'paused') return 'Dijeda';
  if (status === 'break') return 'Istirahat';
  return 'Selesai';
}

export function KontrolPartaiPanel() {
  const {
    arena,
    matches,
    activeMatch,
    events,
    getMatchEvents,
    liveTimerMs,
    createMatch,
    updateMatchMeta,
    setActiveMatch,
    setMatchTotalRounds,
    setMatchJurusJudgeCount,
    resetMatch,
    deleteMatch,
  } = useArena();

  const [selectedMatchId, setSelectedMatchId] = useState<string>(activeMatch.id);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCategory, setNewCategory] = useState<CompetitionCategory>('Jurus');
  const [newJurusType, setNewJurusType] = useState<JurusCategory>('Tunggal Baku');
  const [newJurusJudgeCount, setNewJurusJudgeCount] = useState<number>(4);
  const [newGender, setNewGender] = useState<AthleteGender>('Putra');
  const [newTandingClass, setNewTandingClass] = useState('Kelas B (50-55 kg)');
  const [newTotalRounds, setNewTotalRounds] = useState<2 | 3>(3);
  const [newMatchNumber, setNewMatchNumber] = useState('');
  const [newStage, setNewStage] = useState('Final');
  const [newBlueName, setNewBlueName] = useState('');
  const [newBlueContingent, setNewBlueContingent] = useState('');
  const [newBlueCountry, setNewBlueCountry] = useState('IDN');
  const [newBluePhoto, setNewBluePhoto] = useState('');
  const [newRedName, setNewRedName] = useState('');
  const [newRedContingent, setNewRedContingent] = useState('');
  const [newRedCountry, setNewRedCountry] = useState('IDN');
  const [newRedPhoto, setNewRedPhoto] = useState('');
  const [newSetActive, setNewSetActive] = useState(true);
  const [createError, setCreateError] = useState('');

  // Quick profile editor for selected match (Athlete photo & country for Scoreboard)
  const [editingProfile, setEditingProfile] = useState(false);
  const [editBlueName, setEditBlueName] = useState('');
  const [editBlueContingent, setEditBlueContingent] = useState('');
  const [editBlueCountry, setEditBlueCountry] = useState('IDN');
  const [editBluePhoto, setEditBluePhoto] = useState('');
  const [editRedName, setEditRedName] = useState('');
  const [editRedContingent, setEditRedContingent] = useState('');
  const [editRedCountry, setEditRedCountry] = useState('IDN');
  const [editRedPhoto, setEditRedPhoto] = useState('');

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || activeMatch,
    [matches, selectedMatchId, activeMatch]
  );

  const openProfileEditor = () => {
    setEditBlueName(selectedMatch.blueName);
    setEditBlueContingent(selectedMatch.blueContingent);
    setEditBlueCountry(selectedMatch.blueCountry || 'IDN');
    setEditBluePhoto(selectedMatch.bluePhoto || '');
    setEditRedName(selectedMatch.redName);
    setEditRedContingent(selectedMatch.redContingent);
    setEditRedCountry(selectedMatch.redCountry || 'IDN');
    setEditRedPhoto(selectedMatch.redPhoto || '');
    setEditingProfile((v) => !v);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateMatchMeta(selectedMatch.id, {
      blueName: editBlueName.trim() || selectedMatch.blueName,
      blueContingent: editBlueContingent.trim() || selectedMatch.blueContingent,
      blueCountry: editBlueCountry.trim() || 'IDN',
      bluePhoto: editBluePhoto,
      redName: editRedName.trim() || selectedMatch.redName,
      redContingent: editRedContingent.trim() || selectedMatch.redContingent,
      redCountry: editRedCountry.trim() || 'IDN',
      redPhoto: editRedPhoto,
    });
    setEditingProfile(false);
  };

  const isSelectedActive = selectedMatch.id === activeMatch.id;
  const isSelectedJurus = isJurusMatch(selectedMatch);
  const selectedJurusType = getJurusType(selectedMatch);
  const selectedJurusJudgeCount = getJurusJudgeCount(selectedMatch);
  const selectedJurusState = ensureJurusState(selectedMatch);
  const selectedBlueSummary = computeCornerJurusSummary(selectedJurusType, selectedJurusState.blue, selectedJurusJudgeCount);
  const selectedRedSummary = computeCornerJurusSummary(selectedJurusType, selectedJurusState.red, selectedJurusJudgeCount);

  const selectedEvents = useMemo(
    () => (isSelectedActive ? events : getMatchEvents(selectedMatch.id)),
    [isSelectedActive, events, getMatchEvents, selectedMatch.id]
  );
  const selectedTimerMs = isSelectedActive ? liveTimerMs : selectedMatch.timerRemainingMs;

  const suggestedNextMatchNum = useMemo(
    () => `Partai ${String(matches.length + 1).padStart(2, '0')}`,
    [matches.length]
  );

  const handleCreatePartai = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlueName.trim() || !newRedName.trim()) {
      setCreateError('Isi nama peserta/tim untuk Sudut Biru dan Sudut Merah.');
      return;
    }
    setCreateError('');
    const isJurus = newCategory === 'Jurus';
    await createMatch({
      matchNumber: newMatchNumber.trim() || suggestedNextMatchNum,
      weightClass: isJurus
        ? `${newJurusType} (${newGender})`
        : `${newTandingClass} (${newGender})`,
      stage: newStage.trim() || 'Final',
      competitionCategory: newCategory,
      jurusType: isJurus ? newJurusType : undefined,
      jurusJudgeCount: isJurus ? newJurusJudgeCount : undefined,
      totalRounds: isJurus ? 1 : newTotalRounds,
      blueName: newBlueName.trim(),
      blueContingent: newBlueContingent.trim() || '-',
      blueCountry: newBlueCountry,
      bluePhoto: newBluePhoto,
      redName: newRedName.trim(),
      redContingent: newRedContingent.trim() || '-',
      redCountry: newRedCountry,
      redPhoto: newRedPhoto,
      roundDurationSec: isJurus ? JURUS_DEFAULT_DURATION_SEC : 120,
      setAsActive: newSetActive,
    });
    setNewMatchNumber('');
    setNewBlueName('');
    setNewBlueContingent('');
    setNewBlueCountry('IDN');
    setNewBluePhoto('');
    setNewRedName('');
    setNewRedContingent('');
    setNewRedCountry('IDN');
    setNewRedPhoto('');
    setShowCreateForm(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Kolom Kiri: Menu Kontrol & Daftar Pilihan Partai */}
      <section
        aria-label="Menu Kontrol Partai"
        className="lg:col-span-5 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-purple-800/60">
          <div>
            <h2 className="font-display text-xl font-bold text-yellow-300">Kontrol Partai Gelanggang</h2>
            <p className="text-xs text-blue-200 mt-0.5">
              Muat atau buat partai Tanding / Jurus TGRS. Semua panel (Juri, Dewan, Timer, Scoreboard) otomatis mengikuti partai aktif.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono tabular-nums text-yellow-300 bg-black/65 px-2.5 py-1.5 rounded-lg border border-blue-500/45">
              {matches.length} Partai
            </span>
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCreateForm ? 'Tutup Form' : 'Buat Partai'}</span>
            </button>
          </div>
        </div>

        {/* Form Tambah / Muat Partai Baru (Tanding / Jurus TGRS) */}
        {showCreateForm && (
          <form
            onSubmit={handleCreatePartai}
            className="rounded-xl bg-black/75 border border-yellow-400/60 p-3.5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                Tambah Partai Baru (Tanding / Jurus TGRS)
              </h3>
            </div>

            {createError && (
              <p role="alert" className="text-xs text-red-300 font-medium">
                {createError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewCategory('Tanding')}
                className={`min-h-[36px] rounded-lg border text-xs font-bold cursor-pointer ${
                  newCategory === 'Tanding'
                    ? 'bg-blue-600 border-yellow-400 text-white'
                    : 'bg-black/60 border-purple-700/60 text-blue-200'
                }`}
              >
                Kategori Tanding
              </button>
              <button
                type="button"
                onClick={() => setNewCategory('Jurus')}
                className={`min-h-[36px] rounded-lg border text-xs font-bold cursor-pointer ${
                  newCategory === 'Jurus'
                    ? 'bg-yellow-400 border-yellow-300 text-black'
                    : 'bg-black/60 border-purple-700/60 text-blue-200'
                }`}
              >
                Kategori Jurus (TGRS)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-blue-200 mb-1">Nomor Partai</label>
                <input
                  type="text"
                  value={newMatchNumber}
                  onChange={(e) => setNewMatchNumber(e.target.value)}
                  placeholder={suggestedNextMatchNum}
                  maxLength={32}
                  className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-blue-200 mb-1">Babak / Fase</label>
                <input
                  type="text"
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  placeholder="Final"
                  maxLength={40}
                  className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            {newCategory === 'Jurus' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Kategori Jurus TGRS</label>
                  <select
                    value={newJurusType}
                    onChange={(e) => setNewJurusType(e.target.value as JurusCategory)}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                  >
                    {JURUS_SPECIFICATIONS.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Golongan</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as AthleteGender)}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="Putra">Putra</option>
                    <option value="Putri">Putri</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Jumlah Juri (4–10)</label>
                  <select
                    aria-label="Jumlah Juri TGRS Baru"
                    data-testid="create-jurus-judge-count"
                    value={newJurusJudgeCount}
                    onChange={(e) => setNewJurusJudgeCount(Number(e.target.value))}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-yellow-400/60 text-xs font-bold text-yellow-300 focus:outline-none focus:border-yellow-300"
                  >
                    {JURUS_JUDGE_COUNT_OPTIONS.map((cnt) => (
                      <option key={cnt} value={cnt}>
                        {cnt} Juri
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Kelas</label>
                  <input
                    type="text"
                    value={newTandingClass}
                    onChange={(e) => setNewTandingClass(e.target.value)}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Golongan</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as AthleteGender)}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="Putra">Putra</option>
                    <option value="Putri">Putri</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-blue-200 mb-1">Babak</label>
                  <select
                    value={newTotalRounds}
                    onChange={(e) => setNewTotalRounds(Number(e.target.value) === 2 ? 2 : 3)}
                    className="w-full min-h-[36px] px-2.5 rounded-lg bg-black/70 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value={2}>2 Babak</option>
                    <option value={3}>3 Babak</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5 p-2 rounded-lg bg-blue-950/35 border border-blue-700/50">
                <div className="text-[10px] font-bold uppercase text-blue-300">Sudut Biru</div>
                <input
                  type="text"
                  value={newBlueName}
                  onChange={(e) => setNewBlueName(e.target.value)}
                  placeholder={newCategory === 'Jurus' && (newJurusType === 'Ganda' || newJurusType === 'Regu') ? 'Nama Tim / Pasangan Biru' : 'Nama Pesilat Biru'}
                  maxLength={80}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                />
                <input
                  type="text"
                  value={newBlueContingent}
                  onChange={(e) => setNewBlueContingent(e.target.value)}
                  placeholder="Kontingen Biru"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                />
                <select
                  aria-label="Negara Sudut Biru"
                  value={newBlueCountry}
                  onChange={(e) => setNewBlueCountry(e.target.value)}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                >
                  {INTERNATIONAL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <label className="flex-1 min-h-[30px] px-2 rounded bg-blue-900/60 hover:bg-blue-800 border border-blue-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5 text-yellow-300" />
                    <span>{newBluePhoto ? 'Ganti Foto' : 'Foto Atlet'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) {
                          void readAndResizeAthletePhoto(file).then(setNewBluePhoto).catch(() => {});
                        }
                      }}
                    />
                  </label>
                  {newBluePhoto && (
                    <button
                      type="button"
                      onClick={() => setNewBluePhoto('')}
                      className="min-h-[30px] px-2 rounded bg-black/70 border border-blue-500/40 text-[11px] text-yellow-300 cursor-pointer"
                      aria-label="Hapus Foto Biru"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 p-2 rounded-lg bg-red-950/35 border border-red-700/50">
                <div className="text-[10px] font-bold uppercase text-red-300">Sudut Merah</div>
                <input
                  type="text"
                  value={newRedName}
                  onChange={(e) => setNewRedName(e.target.value)}
                  placeholder={newCategory === 'Jurus' && (newJurusType === 'Ganda' || newJurusType === 'Regu') ? 'Nama Tim / Pasangan Merah' : 'Nama Pesilat Merah'}
                  maxLength={80}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                />
                <input
                  type="text"
                  value={newRedContingent}
                  onChange={(e) => setNewRedContingent(e.target.value)}
                  placeholder="Kontingen Merah"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                />
                <select
                  aria-label="Negara Sudut Merah"
                  value={newRedCountry}
                  onChange={(e) => setNewRedCountry(e.target.value)}
                  className="w-full min-h-[34px] px-2 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                >
                  {INTERNATIONAL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <label className="flex-1 min-h-[30px] px-2 rounded bg-red-900/60 hover:bg-red-800 border border-red-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5 text-yellow-300" />
                    <span>{newRedPhoto ? 'Ganti Foto' : 'Foto Atlet'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) {
                          void readAndResizeAthletePhoto(file).then(setNewRedPhoto).catch(() => {});
                        }
                      }}
                    />
                  </label>
                  {newRedPhoto && (
                    <button
                      type="button"
                      onClick={() => setNewRedPhoto('')}
                      className="min-h-[30px] px-2 rounded bg-black/70 border border-red-500/40 text-[11px] text-yellow-300 cursor-pointer"
                      aria-label="Hapus Foto Merah"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newSetActive}
                onChange={(e) => setNewSetActive(e.target.checked)}
                className="accent-yellow-400"
              />
              <span>Langsung muat sebagai Partai Aktif Gelanggang</span>
            </label>

            <button
              type="submit"
              className="w-full min-h-[40px] rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs cursor-pointer transition-colors"
            >
              Simpan &amp; Muat Partai {newCategory === 'Jurus' ? `Jurus (${newJurusType})` : 'Tanding'}
            </button>
          </form>
        )}

        {/* Menu Kontrol Partai Terpilih */}
        <div className="rounded-xl bg-black/60 border border-blue-500/45 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-blue-200">
              Kontrol Terpilih: <strong className="text-yellow-300">{selectedMatch.matchNumber}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded border font-mono uppercase text-[10px] font-bold ${
                  isSelectedJurus
                    ? 'bg-yellow-400/20 border-yellow-400/70 text-yellow-300'
                    : 'bg-blue-950/80 border-blue-500/50 text-blue-200'
                }`}
              >
                {isSelectedJurus ? `Jurus · ${selectedJurusType}` : 'Tanding'}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-500/40 font-mono uppercase text-[10px] text-white">
                {getMatchStatusLabel(selectedMatch.status)}
              </span>
            </div>
          </div>

          {/* Quick Category Switcher when waiting */}
          {selectedMatch.status === 'waiting' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-blue-200 mr-1">Mode:</span>
              <button
                type="button"
                onClick={() =>
                  void updateMatchMeta(selectedMatch.id, {
                    competitionCategory: 'Tanding',
                    totalRounds: 3,
                    roundDurationSec: 120,
                    weightClass: isSelectedJurus ? 'Kelas B Putra (50-55 kg)' : selectedMatch.weightClass,
                  })
                }
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  !isSelectedJurus
                    ? 'bg-blue-600 border-yellow-400 text-white'
                    : 'bg-black/60 border-purple-700/60 text-blue-200 hover:border-blue-400'
                }`}
              >
                Tanding
              </button>
              {JURUS_SPECIFICATIONS.map((spec) => {
                const activeSpec = isSelectedJurus && selectedJurusType === spec;
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() =>
                      void updateMatchMeta(selectedMatch.id, {
                        competitionCategory: 'Jurus',
                        jurusType: spec,
                        weightClass: spec,
                        totalRounds: 1,
                        roundDurationSec: JURUS_DEFAULT_DURATION_SEC,
                      })
                    }
                    className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      activeSpec
                        ? 'bg-yellow-400 border-yellow-300 text-black'
                        : 'bg-black/60 border-purple-700/60 text-blue-200 hover:border-yellow-400'
                    }`}
                  >
                    {spec}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isSelectedJurus ? (
              <>
                <span className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-black/75 border border-yellow-400/50 text-xs font-mono font-semibold text-yellow-300 flex items-center">
                  {selectedMatch.roundDurationSec}s (TGRS)
                </span>
                <select
                  aria-label={`Jumlah Juri ${selectedMatch.matchNumber}`}
                  data-testid="sekretaris-jurus-judge-count"
                  value={selectedMatch.jurusJudgeCount ?? 3}
                  disabled={selectedMatch.status === 'finished'}
                  onChange={(e) =>
                    void setMatchJurusJudgeCount(selectedMatch.id, Number(e.target.value))
                  }
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-black/75 border border-yellow-400/60 text-xs font-bold text-yellow-300 focus:outline-none focus:border-yellow-300 disabled:opacity-50 cursor-pointer"
                >
                  {!selectedMatch.jurusJudgeCount && (
                    <option value={3}>3 Juri (Awal — Pilih 4–10)</option>
                  )}
                  {JURUS_JUDGE_COUNT_OPTIONS.map((cnt) => (
                    <option key={cnt} value={cnt}>
                      {cnt} Juri
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select
                aria-label={`Jumlah Babak ${selectedMatch.matchNumber}`}
                value={selectedMatch.totalRounds ?? 3}
                disabled={selectedMatch.status === 'finished'}
                onChange={(e) =>
                  void setMatchTotalRounds(selectedMatch.id, Number(e.target.value) === 2 ? 2 : 3)
                }
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-black/75 border border-blue-500/45 text-xs font-semibold text-white focus:outline-none focus:border-yellow-400 disabled:opacity-50"
              >
                <option value={2}>2 Babak</option>
                <option value={3}>3 Babak</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => void setActiveMatch(selectedMatch.id)}
              disabled={isSelectedActive}
              className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                isSelectedActive
                  ? 'bg-yellow-400 text-black cursor-default'
                  : 'bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-white'
              }`}
            >
              {isSelectedActive ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isSelectedActive ? 'Partai Aktif' : 'Aktifkan'}</span>
            </button>

            <button
              type="button"
              onClick={() => exportMatchPdf(arena, selectedMatch, selectedEvents)}
              aria-label={`Ekspor PDF ${selectedMatch.matchNumber}`}
              title={`Ekspor PDF ${selectedMatch.matchNumber}`}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-yellow-300 cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void resetMatch(selectedMatch.id)}
              aria-label={`Reset ${selectedMatch.matchNumber}`}
              title={`Reset ${selectedMatch.matchNumber}`}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 text-white cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {matches.length > 1 && (
              <button
                type="button"
                onClick={() => void deleteMatch(selectedMatch.id)}
                aria-label={`Hapus ${selectedMatch.matchNumber}`}
                title={`Hapus ${selectedMatch.matchNumber}`}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-red-950/70 hover:bg-red-700 border border-red-500/60 text-white cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Daftar Pilihan Partai */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {matches.map((m) => {
            const isActive = m.id === activeMatch.id;
            const isSelected = m.id === selectedMatch.id;
            const mIsJurus = isJurusMatch(m);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedMatchId(m.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                  isSelected
                    ? 'bg-yellow-400/15 border-yellow-400'
                    : isActive
                    ? 'bg-blue-950/55 border-blue-400/70 hover:border-yellow-400/70'
                    : 'bg-black/55 border-purple-700/50 hover:border-blue-400/70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-blue-200 min-w-0">
                    <span className="font-bold text-yellow-300">{m.matchNumber}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{m.stage}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="truncate">{m.weightClass}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-black font-bold text-[10px] uppercase">
                        Aktif
                      </span>
                    )}
                    <span className="font-mono uppercase text-[10px] text-white/90">
                      {getMatchStatusLabel(m.status)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                  <span className="text-blue-300 truncate">{m.blueName}</span>
                  <span className="text-yellow-300/80">vs</span>
                  <span className="text-red-300 truncate">{m.redName}</span>
                </div>

                <div className="text-[11px] font-mono tabular-nums text-blue-200/90">
                  Biru {formatMatchScore(m, 'blue')} &ndash; {formatMatchScore(m, 'red')} Merah &middot;{' '}
                  {mIsJurus ? `Jurus ${getJurusType(m)}` : `${m.totalRounds ?? 3} Babak`}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Kolom Kanan: Preview Partai Terpilih */}
      <section
        aria-label="Preview Partai"
        className="lg:col-span-7 rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-purple-800/60">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-yellow-300 shrink-0" />
            <div>
              <h3 className="font-display text-lg font-bold text-yellow-300">
                Preview {selectedMatch.matchNumber}
              </h3>
              <p className="text-xs text-blue-200">
                {selectedMatch.stage} &middot; {selectedMatch.weightClass} &middot;{' '}
                {isSelectedJurus
                  ? `Kategori Jurus TGRS (${selectedJurusType})`
                  : `${selectedMatch.totalRounds ?? 3} Babak (Babak ${selectedMatch.currentRound})`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openProfileEditor}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/45 hover:border-yellow-400 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-yellow-300" />
              <span>{editingProfile ? 'Tutup Editor' : 'Foto & Negara'}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs font-mono tabular-nums text-yellow-300">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatMatchTime(selectedTimerMs)}</span>
            </span>
            <span
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                isSelectedActive
                  ? 'bg-yellow-400/15 border-yellow-400 text-yellow-300'
                  : 'bg-blue-950/80 border-blue-500/45 text-blue-200'
              }`}
            >
              {isSelectedActive ? 'Aktif di Gelanggang' : getMatchStatusLabel(selectedMatch.status)}
            </span>
          </div>
        </div>

        {/* Editor Foto, Negara & Nama Atlet untuk Tampilan Scoreboard Internasional */}
        {editingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="rounded-xl bg-black/75 border border-yellow-400/55 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                Profil Atlet &amp; Negara (Tampil di Scoreboard)
              </span>
              <button
                type="submit"
                className="min-h-[32px] px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer"
              >
                Simpan Profil
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-950/35 border border-blue-600/50 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase text-blue-300">Sudut Biru</div>
                <div className="flex items-center gap-2.5">
                  <img
                    src={editBluePhoto || resolveAthletePhoto(undefined, 'blue', selectedMatch.weightClass).src}
                    alt={editBlueName}
                    className="w-12 h-14 object-cover object-top rounded-lg border border-blue-400/60 bg-black shrink-0"
                  />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="min-h-[30px] px-2.5 rounded-lg bg-blue-900/70 hover:bg-blue-800 border border-blue-500/50 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-yellow-300" />
                      <span>{editBluePhoto ? 'Ganti Foto Atlet' : 'Upload Foto Atlet'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) {
                            void readAndResizeAthletePhoto(file).then(setEditBluePhoto).catch(() => {});
                          }
                        }}
                      />
                    </label>
                    {editBluePhoto && (
                      <button
                        type="button"
                        onClick={() => setEditBluePhoto('')}
                        className="text-[11px] text-yellow-300 hover:text-yellow-200 text-left cursor-pointer"
                      >
                        Pakai Foto Default
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={editBlueName}
                  onChange={(e) => setEditBlueName(e.target.value)}
                  placeholder="Nama Pesilat Biru"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                />
                <input
                  type="text"
                  value={editBlueContingent}
                  onChange={(e) => setEditBlueContingent(e.target.value)}
                  placeholder="Kontingen"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                />
                <select
                  value={editBlueCountry}
                  onChange={(e) => setEditBlueCountry(e.target.value)}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-blue-500/40 text-xs text-white"
                >
                  {INTERNATIONAL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-red-950/35 border border-red-600/50 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase text-red-300">Sudut Merah</div>
                <div className="flex items-center gap-2.5">
                  <img
                    src={editRedPhoto || resolveAthletePhoto(undefined, 'red', selectedMatch.weightClass).src}
                    alt={editRedName}
                    className="w-12 h-14 object-cover object-top rounded-lg border border-red-400/60 bg-black shrink-0"
                  />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="min-h-[30px] px-2.5 rounded-lg bg-red-900/70 hover:bg-red-800 border border-red-500/50 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-yellow-300" />
                      <span>{editRedPhoto ? 'Ganti Foto Atlet' : 'Upload Foto Atlet'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) {
                            void readAndResizeAthletePhoto(file).then(setEditRedPhoto).catch(() => {});
                          }
                        }}
                      />
                    </label>
                    {editRedPhoto && (
                      <button
                        type="button"
                        onClick={() => setEditRedPhoto('')}
                        className="text-[11px] text-yellow-300 hover:text-yellow-200 text-left cursor-pointer"
                      >
                        Pakai Foto Default
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={editRedName}
                  onChange={(e) => setEditRedName(e.target.value)}
                  placeholder="Nama Pesilat Merah"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                />
                <input
                  type="text"
                  value={editRedContingent}
                  onChange={(e) => setEditRedContingent(e.target.value)}
                  placeholder="Kontingen"
                  maxLength={80}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                />
                <select
                  value={editRedCountry}
                  onChange={(e) => setEditRedCountry(e.target.value)}
                  className="w-full min-h-[34px] px-2.5 rounded bg-black/70 border border-red-500/40 text-xs text-white"
                >
                  {INTERNATIONAL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        )}

        {/* Pratinjau Sudut Biru vs Sudut Merah */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className={`rounded-2xl border p-4 space-y-3 ${
              selectedMatch.winner === 'blue'
                ? 'bg-blue-950/85 border-blue-400'
                : 'bg-blue-950/45 border-blue-700/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
                Sudut Biru
              </span>
              {selectedMatch.winner === 'blue' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-300">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Pemenang</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={resolveAthletePhoto(selectedMatch.bluePhoto, 'blue', selectedMatch.weightClass).src}
                alt={selectedMatch.blueName}
                className="w-11 h-14 object-cover object-top rounded-lg border border-blue-400/50 bg-black shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {(() => {
                    const c = resolveCountryInfo(selectedMatch.blueCountry, selectedMatch.blueContingent);
                    return (
                      <>
                        <CountryFlag code={c.code} name={c.name} className="w-5 h-3.5" />
                        <span className="text-[10px] font-mono font-bold text-blue-200">{c.code}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="text-base font-bold text-white truncate">{selectedMatch.blueName}</div>
                <div className="text-xs text-blue-200/85 truncate">{selectedMatch.blueContingent}</div>
              </div>
            </div>
            <div className="font-mono text-4xl font-extrabold text-blue-200 tabular-nums">
              {formatMatchScore(selectedMatch, 'blue')}
            </div>
            {isSelectedJurus ? (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-800/60 text-[11px] text-blue-100">
                <div>Median Juri: <strong className="font-mono">{formatJurusScore(selectedBlueSummary.median)}</strong></div>
                <div>Potongan: <strong className="font-mono text-yellow-300">-{formatJurusScore(selectedBlueSummary.penaltyTotal)}</strong></div>
                <div>Waktu Tampil: <strong className="font-mono">{formatJurusElapsedMs(selectedJurusState.blue.recordedElapsedMs)}</strong></div>
                <div>Std Dev: <strong className="font-mono">{(selectedBlueSummary.stdDev / 100).toFixed(3)}</strong></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-blue-800/60 text-[11px] text-blue-100">
                <div>Pukulan: <strong className="font-mono">{selectedMatch.bluePunches}</strong></div>
                <div>Tendangan: <strong className="font-mono">{selectedMatch.blueKicks}</strong></div>
                <div>Jatuhan: <strong className="font-mono">{selectedMatch.blueFalls}</strong></div>
                <div>Binaan: <strong className="font-mono">{selectedMatch.blueBinaan}</strong></div>
                <div>Teguran: <strong className="font-mono">{selectedMatch.blueTeguran1 + selectedMatch.blueTeguran2}</strong></div>
                <div>Peringatan: <strong className="font-mono">{selectedMatch.bluePeringatan}</strong></div>
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl border p-4 space-y-3 ${
              selectedMatch.winner === 'red'
                ? 'bg-red-950/85 border-red-400'
                : 'bg-red-950/45 border-red-700/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-300">
                Sudut Merah
              </span>
              {selectedMatch.winner === 'red' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-300">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Pemenang</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={resolveAthletePhoto(selectedMatch.redPhoto, 'red', selectedMatch.weightClass).src}
                alt={selectedMatch.redName}
                className="w-11 h-14 object-cover object-top rounded-lg border border-red-400/50 bg-black shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {(() => {
                    const c = resolveCountryInfo(selectedMatch.redCountry, selectedMatch.redContingent);
                    return (
                      <>
                        <CountryFlag code={c.code} name={c.name} className="w-5 h-3.5" />
                        <span className="text-[10px] font-mono font-bold text-red-200">{c.code}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="text-base font-bold text-white truncate">{selectedMatch.redName}</div>
                <div className="text-xs text-red-200/85 truncate">{selectedMatch.redContingent}</div>
              </div>
            </div>
            <div className="font-mono text-4xl font-extrabold text-red-200 tabular-nums">
              {formatMatchScore(selectedMatch, 'red')}
            </div>
            {isSelectedJurus ? (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-red-800/60 text-[11px] text-red-100">
                <div>Median Juri: <strong className="font-mono">{formatJurusScore(selectedRedSummary.median)}</strong></div>
                <div>Potongan: <strong className="font-mono text-yellow-300">-{formatJurusScore(selectedRedSummary.penaltyTotal)}</strong></div>
                <div>Waktu Tampil: <strong className="font-mono">{formatJurusElapsedMs(selectedJurusState.red.recordedElapsedMs)}</strong></div>
                <div>Std Dev: <strong className="font-mono">{(selectedRedSummary.stdDev / 100).toFixed(3)}</strong></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-red-800/60 text-[11px] text-red-100">
                <div>Pukulan: <strong className="font-mono">{selectedMatch.redPunches}</strong></div>
                <div>Tendangan: <strong className="font-mono">{selectedMatch.redKicks}</strong></div>
                <div>Jatuhan: <strong className="font-mono">{selectedMatch.redFalls}</strong></div>
                <div>Binaan: <strong className="font-mono">{selectedMatch.redBinaan}</strong></div>
                <div>Teguran: <strong className="font-mono">{selectedMatch.redTeguran1 + selectedMatch.redTeguran2}</strong></div>
                <div>Peringatan: <strong className="font-mono">{selectedMatch.redPeringatan}</strong></div>
              </div>
            )}
          </div>
        </div>

        {selectedMatch.winner && (
          <div className="rounded-xl bg-yellow-400/15 border border-yellow-400/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-yellow-300">
              <Trophy className="w-4 h-4 shrink-0" />
              <span>
                Keputusan Resmi:{' '}
                {selectedMatch.winner === 'blue'
                  ? `Sudut Biru (${selectedMatch.blueName})`
                  : selectedMatch.winner === 'red'
                  ? `Sudut Merah (${selectedMatch.redName})`
                  : 'Seri / Imbang'}
              </span>
            </div>
            {selectedMatch.winMethod && (
              <span className="font-mono text-white">{selectedMatch.winMethod}</span>
            )}
          </div>
        )}

        {/* Log Kejadian Partai Terpilih */}
        <div className="rounded-xl bg-black/55 border border-purple-700/50 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-300">
              Log Kejadian Partai
            </h4>
            <span className="text-[11px] font-mono text-blue-200">
              {selectedEvents.filter((ev) => !ev.undone).length} Kejadian
            </span>
          </div>

          {selectedEvents.length === 0 ? (
            <p className="text-xs text-blue-200/80 py-3 text-center border border-dashed border-purple-800/60 rounded-lg">
              Belum ada catatan nilai atau pelanggaran pada partai ini.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {selectedEvents
                .slice()
                .reverse()
                .slice(0, 12)
                .map((ev) => (
                  <div
                    key={ev.id}
                    className={`px-3 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      ev.undone
                        ? 'bg-black/30 border-purple-900/40 text-blue-300/50 line-through'
                        : ev.corner === 'blue'
                        ? 'bg-blue-950/40 border-blue-700/50 text-blue-100'
                        : ev.corner === 'red'
                        ? 'bg-red-950/40 border-red-700/50 text-red-100'
                        : 'bg-black/50 border-purple-700/50 text-white'
                    }`}
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-mono text-[11px] text-yellow-300 mr-2">
                        {isSelectedJurus ? 'TGRS' : `B${ev.round}`} {ev.matchTimeFormatted}
                      </span>
                      <span>{ev.description}</span>
                    </div>
                    <span className="font-mono font-bold shrink-0">
                      {ev.type.startsWith('jurus_')
                        ? ev.pointsDelta === 0
                          ? 'LOG'
                          : `${ev.pointsDelta > 0 ? '+' : '-'}${formatJurusScore(Math.abs(ev.pointsDelta))}`
                        : ev.pointsDelta > 0
                        ? `+${ev.pointsDelta}`
                        : ev.pointsDelta}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
