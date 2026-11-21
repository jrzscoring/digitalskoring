import * as XLSX from 'xlsx';
import type { AddAthleteInput } from '../context/ArenaContext';
import type {
  ArenaCourt,
  ArenaData,
  AthleteAgeCategory,
  AthleteData,
  AthleteGender,
  CompetitionCategory,
  MatchData,
} from '../types/silat';
import { resolveCountryInfo } from './countries';
import { formatMatchScore, getJurusType, isJurusMatch } from './ipsiRules';

export const AGE_CATEGORIES: AthleteAgeCategory[] = [
  'Usia Dini 1',
  'Usia Dini 2',
  'Usia Dini',
  'Pra Remaja',
  'Remaja',
  'Dewasa',
  'Master',
];

export const COMPETITION_CATEGORIES: CompetitionCategory[] = ['Tanding', 'Jurus'];

export const JURUS_SPECIFICATIONS = [
  'Tunggal Baku',
  'Ganda',
  'Regu',
  'Tunggal Bebas',
] as const;

export const ARENA_COURTS: ArenaCourt[] = ['A', 'B', 'C', 'D'];

export const TANDING_CLASSES_BY_AGE: Record<AthleteAgeCategory, string[]> = {
  'Usia Dini 1': [
    'Under 26 kg',
    'Kelas A (26-28 kg)',
    'Kelas B (28-30 kg)',
    'Kelas C (30-32 kg)',
    'Kelas D (32-34 kg)',
    'Kelas E (34-36 kg)',
    'Kelas F (36-38 kg)',
    'Kelas G (38-40 kg)',
    'Kelas H (40-42 kg)',
    'Kelas I (42-44 kg)',
    'Kelas J (44-46 kg)',
    'Kelas K (46-48 kg)',
    'Kelas L (48-50 kg)',
    'Kelas M (50-52 kg)',
    'Kelas N (52-54 kg)',
    'Kelas O (54-56 kg)',
    'Kelas P (56-58 kg)',
    'Kelas Q (58-60 kg)',
    'Kelas R (60-62 kg)',
    'Kelas S (62-64 kg)',
    'Kelas Bebas',
  ],
  'Usia Dini 2': [
    'Under 26 kg',
    'Kelas A (26-28 kg)',
    'Kelas B (28-30 kg)',
    'Kelas C (30-32 kg)',
    'Kelas D (32-34 kg)',
    'Kelas E (34-36 kg)',
    'Kelas F (36-38 kg)',
    'Kelas G (38-40 kg)',
    'Kelas H (40-42 kg)',
    'Kelas I (42-44 kg)',
    'Kelas J (44-46 kg)',
    'Kelas K (46-48 kg)',
    'Kelas L (48-50 kg)',
    'Kelas M (50-52 kg)',
    'Kelas N (52-54 kg)',
    'Kelas O (54-56 kg)',
    'Kelas P (56-58 kg)',
    'Kelas Q (58-60 kg)',
    'Kelas R (60-62 kg)',
    'Kelas S (62-64 kg)',
    'Kelas Bebas',
  ],
  'Usia Dini': [
    'Under 26 kg',
    'Kelas A (26-28 kg)',
    'Kelas B (28-30 kg)',
    'Kelas C (30-32 kg)',
    'Kelas D (32-34 kg)',
    'Kelas E (34-36 kg)',
    'Kelas F (36-38 kg)',
    'Kelas G (38-40 kg)',
    'Kelas H (40-42 kg)',
    'Kelas I (42-44 kg)',
    'Kelas J (44-46 kg)',
    'Kelas K (46-48 kg)',
    'Kelas L (48-50 kg)',
    'Kelas M (50-52 kg)',
    'Kelas N (52-54 kg)',
    'Kelas O (54-56 kg)',
    'Kelas P (56-58 kg)',
    'Kelas Q (58-60 kg)',
    'Kelas R (60-62 kg)',
    'Kelas S (62-64 kg)',
    'Kelas Bebas',
  ],
  'Pra Remaja': [
    'Under 30 kg',
    'Kelas A (30-33 kg)',
    'Kelas B (33-36 kg)',
    'Kelas C (36-39 kg)',
    'Kelas D (39-42 kg)',
    'Kelas E (42-45 kg)',
    'Kelas F (45-48 kg)',
    'Kelas G (48-51 kg)',
    'Kelas H (51-54 kg)',
    'Kelas I (54-57 kg)',
    'Kelas J (57-60 kg)',
    'Kelas K (60-63 kg)',
    'Kelas L (63-66 kg)',
    'Kelas M (66-69 kg)',
    'Kelas N (69-72 kg)',
    'Kelas O (72-75 kg)',
    'Kelas P (75-78 kg)',
    'Kelas Bebas',
  ],
  Remaja: [
    'Under 39 kg',
    'Kelas A (39-43 kg)',
    'Kelas B (43-47 kg)',
    'Kelas C (47-51 kg)',
    'Kelas D (51-55 kg)',
    'Kelas E (55-59 kg)',
    'Kelas F (59-63 kg)',
    'Kelas G (63-67 kg)',
    'Kelas H (67-71 kg)',
    'Kelas I (71-75 kg)',
    'Kelas J (75-79 kg)',
    'Kelas K (79-83 kg)',
    'Kelas L (83-87 kg)',
    'Kelas Bebas',
  ],
  Dewasa: [
    'Under 45 kg',
    'Kelas A (45-50 kg)',
    'Kelas B (50-55 kg)',
    'Kelas C (55-60 kg)',
    'Kelas D (60-65 kg)',
    'Kelas E (65-70 kg)',
    'Kelas F (70-75 kg)',
    'Kelas G (75-80 kg)',
    'Kelas H (80-85 kg)',
    'Kelas I (85-90 kg)',
    'Kelas J (90-95 kg)',
    'Kelas Bebas',
  ],
  Master: [
    'Under 45 kg',
    'Kelas A (45-50 kg)',
    'Kelas B (50-55 kg)',
    'Kelas C (55-60 kg)',
    'Kelas D (60-65 kg)',
    'Kelas E (65-70 kg)',
    'Kelas F (70-75 kg)',
    'Kelas G (75-80 kg)',
    'Kelas H (80-85 kg)',
    'Kelas I (85-90 kg)',
    'Kelas J (90-95 kg)',
    'Kelas Bebas',
  ],
};

export function getClassOptions(
  competitionCategory: CompetitionCategory,
  ageCategory: AthleteAgeCategory
): string[] {
  if (competitionCategory === 'Jurus') {
    return [...JURUS_SPECIFICATIONS];
  }
  return TANDING_CLASSES_BY_AGE[ageCategory] || TANDING_CLASSES_BY_AGE.Dewasa;
}

export function normalizeAgeCategory(raw: string): AthleteAgeCategory {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (v.includes('dini 1') || v.includes('dini1')) return 'Usia Dini 1';
  if (v.includes('dini 2') || v.includes('dini2')) return 'Usia Dini 2';
  if (v.includes('dini')) return 'Usia Dini';
  if (v.includes('pra')) return 'Pra Remaja';
  if (v.includes('remaja')) return 'Remaja';
  if (v.includes('master')) return 'Master';
  return 'Dewasa';
}

export function normalizeGender(raw: string): AthleteGender {
  const v = raw.trim().toLowerCase();
  if (
    v === 'p' ||
    v === 'pi' ||
    v.includes('putri') ||
    v.includes('perempuan') ||
    v.includes('wanita') ||
    v === 'female'
  ) {
    return 'Putri';
  }
  return 'Putra';
}

export function normalizeCompetitionCategory(raw: string): CompetitionCategory {
  const v = raw.trim().toLowerCase();
  if (
    v.includes('jurus') ||
    v.includes('tunggal') ||
    v.includes('ganda') ||
    v.includes('regu') ||
    v.includes('seni') ||
    v.includes('tgr')
  ) {
    return 'Jurus';
  }
  return 'Tanding';
}

export function normalizeJurusSpecification(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v.includes('tunggal bebas') || v.includes('bebas')) return 'Tunggal Bebas';
  if (v.includes('tunggal')) return 'Tunggal Baku';
  if (v.includes('ganda')) return 'Ganda';
  if (v.includes('regu')) return 'Regu';
  return 'Tunggal Baku';
}

export function normalizeArenaCourt(raw: string): ArenaCourt {
  const match = raw.toUpperCase().match(/\b([A-D])\b/);
  if (match && (match[1] === 'A' || match[1] === 'B' || match[1] === 'C' || match[1] === 'D')) {
    return match[1] as ArenaCourt;
  }
  const lastChar = raw.trim().toUpperCase().slice(-1);
  if (lastChar === 'A' || lastChar === 'B' || lastChar === 'C' || lastChar === 'D') {
    return lastChar as ArenaCourt;
  }
  return 'A';
}

export function downloadAthleteTemplateExcel(): void {
  const wb = XLSX.utils.book_new();

  const templateRows = [
    {
      'Nama Atlet': 'Ahmad Fauzi',
      'Kontingen': 'DKI Jakarta',
      'Negara Asal': 'IDN',
      'Kategori Usia': 'Dewasa',
      'Jenis Kelamin': 'Putra',
      'Kategori Pertandingan': 'Tanding',
      'Kelas Tanding': 'Kelas B (50-55 kg)',
      'Gelanggang': 'A',
    },
    {
      'Nama Atlet': 'Siti Rahma',
      'Kontingen': 'Jawa Barat',
      'Negara Asal': 'IDN',
      'Kategori Usia': 'Remaja',
      'Jenis Kelamin': 'Putri',
      'Kategori Pertandingan': 'Jurus',
      'Kelas Tanding': 'Tunggal Baku',
      'Gelanggang': 'B',
    },
    {
      'Nama Atlet': 'Bima Pratama',
      'Kontingen': 'Jawa Tengah',
      'Negara Asal': 'MAS',
      'Kategori Usia': 'Usia Dini 1',
      'Jenis Kelamin': 'Putra',
      'Kategori Pertandingan': 'Jurus',
      'Kelas Tanding': 'Tunggal Bebas',
      'Gelanggang': 'C',
    },
  ];

  const wsTemplate = XLSX.utils.json_to_sheet(templateRows);
  wsTemplate['!cols'] = [
    { wch: 24 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 15 },
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template Atlet');

  const guideRows = [
    { Kolom: 'Nama Atlet', Keterangan: 'Nama lengkap atlet peserta (wajib diisi)' },
    { Kolom: 'Kontingen', Keterangan: 'Nama kontingen / daerah / perguruan (wajib diisi)' },
    { Kolom: 'Negara Asal', Keterangan: 'Kode/nama negara asal atlet (contoh: IDN, MAS, SGP, THA, VNM, NED, dll.)' },
    {
      Kolom: 'Kategori Usia',
      Keterangan: 'Pilihan IPSI 2026 & PERSILAT: Usia Dini 1, Usia Dini 2, Usia Dini, Pra Remaja, Remaja, Dewasa, Master',
    },
    { Kolom: 'Jenis Kelamin', Keterangan: 'Pilihan: Putra atau Putri' },
    { Kolom: 'Kategori Pertandingan', Keterangan: 'Pilihan: Tanding atau Jurus' },
    {
      Kolom: 'Kelas Tanding',
      Keterangan:
        'Untuk Tanding: kelas berat sesuai Kategori Usia IPSI 2026 (mis. Under, Kelas A s.d. Kelas Bebas). Untuk Jurus: Tunggal Baku, Ganda, Regu, atau Tunggal Bebas',
    },
    { Kolom: 'Gelanggang', Keterangan: 'Pilihan: A, B, C, atau D' },
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 24 }, { wch: 86 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  XLSX.writeFile(wb, 'template-input-atlet-silat.xlsx');
}

export function exportAthletesExcel(athletes: AthleteData[]): void {
  const wb = XLSX.utils.book_new();

  const rows = athletes.map((a, idx) => ({
    No: idx + 1,
    'Nama Atlet': a.name,
    'Kontingen': a.contingent,
    'Negara Asal': resolveCountryInfo(a.country, a.contingent).code,
    'Kategori Usia': a.ageCategory || 'Dewasa',
    'Jenis Kelamin': a.gender || 'Putra',
    'Kategori Pertandingan': normalizeCompetitionCategory(a.competitionCategory || 'Tanding'),
    'Kelas Tanding': a.weightClass,
    'Gelanggang': a.gelanggang || 'A',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 15 },
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Data Atlet');
  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `data-atlet-terdaftar-${dateStamp}.xlsx`);
}

function pickField(normalizedRow: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (normalizedRow[alias] !== undefined && normalizedRow[alias] !== '') {
      return normalizedRow[alias];
    }
  }
  return '';
}

export async function parseAthletesExcel(
  file: File
): Promise<{ athletes: AddAthleteInput[]; skipped: number }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { athletes: [], skipped: 0 };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const parsed: AddAthleteInput[] = [];
  let skipped = 0;

  for (const row of rawRows) {
    const normalizedRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      normalizedRow[k.trim().toLowerCase().replace(/\s+/g, ' ')] = String(v ?? '').trim();
    }

    const name = pickField(normalizedRow, [
      'nama atlet',
      'nama',
      'nama lengkap',
      'pesilat',
      'nama pesilat',
      'name',
    ]);
    const contingent = pickField(normalizedRow, [
      'kontingen',
      'kontingen / perguruan',
      'perguruan',
      'daerah',
      'contingent',
    ]);

    if (!name || !contingent) {
      skipped += 1;
      continue;
    }

    const countryRaw = pickField(normalizedRow, [
      'negara asal',
      'negara',
      'asal negara',
      'country',
      'nation',
    ]);
    const ageRaw = pickField(normalizedRow, ['kategori usia', 'usia', 'kelompok usia', 'kelompok umur', 'age']);
    const genderRaw = pickField(normalizedRow, ['jenis kelamin', 'kelamin', 'gender', 'jk', 'kategori']);
    const compRaw = pickField(normalizedRow, [
      'kategori pertandingan',
      'nomor pertandingan',
      'jenis pertandingan',
      'kategori tanding',
      'competition category',
    ]);
    const classRaw = pickField(normalizedRow, ['kelas tanding', 'kelas', 'nomor', 'weight class', 'class']);
    const courtRaw = pickField(normalizedRow, ['gelanggang', 'gelanggang pertandingan', 'arena', 'lapangan', 'court']);

    const ageCategory = normalizeAgeCategory(ageRaw);
    const competitionCategory = normalizeCompetitionCategory(compRaw || classRaw);
    const defaultTandingClass =
      TANDING_CLASSES_BY_AGE[ageCategory]?.[2] ||
      TANDING_CLASSES_BY_AGE[ageCategory]?.[0] ||
      'Kelas B (50-55 kg)';

    const weightClass =
      competitionCategory === 'Jurus'
        ? normalizeJurusSpecification(classRaw || compRaw)
        : classRaw || defaultTandingClass;

    parsed.push({
      name,
      contingent,
      country: resolveCountryInfo(countryRaw, contingent).code,
      ageCategory,
      gender: normalizeGender(genderRaw),
      competitionCategory,
      weightClass,
      gelanggang: normalizeArenaCourt(courtRaw),
    });
  }

  return { athletes: parsed, skipped };
}

function formatExcelMatchStatus(status: MatchData['status']): string {
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

export function exportMatchScheduleExcel(matches: MatchData[], arena?: ArenaData): void {
  const wb = XLSX.utils.book_new();

  const rows = matches.map((m, idx) => ({
    No: idx + 1,
    Partai: m.matchNumber,
    'Babak / Fase': m.stage,
    'Kelas / Kategori': m.weightClass,
    'Pesilat Biru': m.blueName,
    'Kontingen Biru': m.blueContingent,
    'Pesilat Merah': m.redName,
    'Kontingen Merah': m.redContingent,
    'Jumlah Babak': isJurusMatch(m) ? `Jurus ${getJurusType(m)}` : `${m.totalRounds ?? 3} Babak`,
    Status: formatExcelMatchStatus(m.status),
    'Skor Biru': formatMatchScore(m, 'blue'),
    'Skor Merah': formatMatchScore(m, 'red'),
    Pemenang:
      m.winner === 'blue'
        ? `Biru (${m.blueName})`
        : m.winner === 'red'
        ? `Merah (${m.redName})`
        : m.winner === 'draw'
        ? 'Seri'
        : '-',
    'Metode Kemenangan': m.winMethod || '-',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 12 },
    { wch: 11 },
    { wch: 11 },
    { wch: 24 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal Pertandingan');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const arenaSlug = arena?.name ? arena.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Gelanggang';
  XLSX.writeFile(wb, `jadwal-pertandingan-${arenaSlug}-${dateStamp}.xlsx`);
}

