import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ArenaCourt, ArenaData, AthleteData, MatchData, MatchEvent } from '../types/silat';
import {
  computeCornerJurusSummary,
  ensureJurusState,
  formatJurusElapsedMs,
  formatJurusScore,
  formatMatchScore,
  getJurusJudgeCount,
  getJurusJudgeIds,
  getJurusType,
  isJurusMatch,
} from './ipsiRules';
import type { MedalAwardEntry, MedalStandingRow } from './medalStandings';

function getWinnerSummary(match: MatchData): string {
  if (!match.winner) return 'Belum Disahkan';
  if (match.winner === 'draw') return 'Seri / Imbang';
  const name = match.winner === 'blue' ? match.blueName : match.redName;
  const contingent = match.winner === 'blue' ? match.blueContingent : match.redContingent;
  const corner = match.winner === 'blue' ? 'SUDUT BIRU' : 'SUDUT MERAH';
  return `${corner} — ${name} (${contingent})`;
}

function tryAddLogo(doc: jsPDF, dataUrl: string | undefined, x: number, y: number, size: number) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
  try {
    const format = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
    doc.addImage(dataUrl, format, x, y, size, size);
  } catch {
    // ignore malformed image data
  }
}

export function exportMatchPdf(arena: ArenaData, match: MatchData, events: MatchEvent[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Official Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 32, 'F');
  tryAddLogo(doc, arena.logoLeft, 10, 5, 22);
  tryAddLogo(doc, arena.logoRight, pageWidth - 32, 5, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BERITA ACARA PERTANDINGAN PENCAK SILAT', pageWidth / 2, 11, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const subtitleParts = [arena.tournamentName];
  if (arena.venue?.trim()) subtitleParts.push(arena.venue.trim());
  if (arena.eventDate?.trim()) subtitleParts.push(arena.eventDate.trim());
  doc.text(subtitleParts.join(' · '), pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text(
    `Peraturan Pertandingan IPSI 2026 & PERSILAT · Dicetak: ${new Date().toLocaleString('id-ID')}`,
    pageWidth / 2,
    25,
    { align: 'center' }
  );

  const isJurus = isJurusMatch(match);
  const jurusType = getJurusType(match);
  const jurusJudgeCount = getJurusJudgeCount(match);
  const jurusJudgeIds = getJurusJudgeIds(jurusJudgeCount);
  const jState = ensureJurusState(match);
  const blueJurus = computeCornerJurusSummary(jurusType, jState.blue, jurusJudgeCount);
  const redJurus = computeCornerJurusSummary(jurusType, jState.red, jurusJudgeCount);

  // Match Identity Table
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    head: [['Nomor Partai', 'Babak / Fase', isJurus ? 'Kategori Jurus TGRS' : 'Kelas Tanding', 'Status Pertandingan']],
    body: [[match.matchNumber, match.stage, match.weightClass, match.status.toUpperCase()]],
  });

  // Corner Comparison & Score Breakdown
  const afterMetaY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterMetaY,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, halign: 'center' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { fillColor: [239, 246, 255], textColor: [30, 64, 175], fontStyle: 'bold' },
      2: { fillColor: [254, 242, 242], textColor: [185, 28, 28], fontStyle: 'bold' },
    },
    head: [['Rincian Penilaian', `SUDUT BIRU (${match.blueName})`, `SUDUT MERAH (${match.redName})`]],
    body: isJurus
      ? [
          ['Kontingen / Daerah', match.blueContingent, match.redContingent],
          ...jurusJudgeIds.map((jid, idx) => [
            `Nilai Juri ${jid}`,
            formatJurusScore(blueJurus.judgeTotals[idx] ?? 0),
            formatJurusScore(redJurus.judgeTotals[idx] ?? 0),
          ]),
          ['Median Juri', formatJurusScore(blueJurus.median), formatJurusScore(redJurus.median)],
          ['Potongan Dewan', `-${formatJurusScore(blueJurus.penaltyTotal)}`, `-${formatJurusScore(redJurus.penaltyTotal)}`],
          ['Standar Deviasi', (blueJurus.stdDev / 100).toFixed(3), (redJurus.stdDev / 100).toFixed(3)],
          ['Waktu Tampil', formatJurusElapsedMs(jState.blue.recordedElapsedMs), formatJurusElapsedMs(jState.red.recordedElapsedMs)],
          ['TOTAL NILAI AKHIR', formatMatchScore(match, 'blue'), formatMatchScore(match, 'red')],
        ]
      : [
          ['Kontingen / Daerah', match.blueContingent, match.redContingent],
          ['Pukulan (+1)', String(match.bluePunches), String(match.redPunches)],
          ['Tendangan (+2)', String(match.blueKicks), String(match.redKicks)],
          ['Jatuhan Wasit (+3)', String(match.blueFalls), String(match.redFalls)],
          ['Binaan (0)', String(match.blueBinaan), String(match.redBinaan)],
          ['Teguran I (-1)', String(match.blueTeguran1), String(match.redTeguran1)],
          ['Teguran II (-2)', String(match.blueTeguran2), String(match.redTeguran2)],
          ['Peringatan (-5 / -10 / DQ)', String(match.bluePeringatan), String(match.redPeringatan)],
          ['TOTAL SKOR AKHIR', String(match.blueScore), String(match.redScore)],
        ],
  });

  // Official Decision Box
  const afterScoreY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterScoreY,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [180, 83, 9], textColor: 255 },
    head: [['Keputusan Resmi Pemenang', 'Jenis Kemenangan']],
    body: [[getWinnerSummary(match), match.winMethod || '-']],
  });

  // Event Chronology (Last 20 active official events)
  const validEvents = events.filter((e) => !e.undone && e.type !== 'judge_press').slice(0, 20);
  if (validEvents.length > 0) {
    const afterDecisionY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: afterDecisionY,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      head: [['Babak', 'Waktu', 'Petugas', 'Sudut', 'Keterangan', 'Poin']],
      body: validEvents.map((ev) => [
        isJurus ? 'TGRS' : `Babak ${ev.round}`,
        ev.matchTimeFormatted,
        ev.actorRole,
        ev.corner === 'blue' ? 'Biru' : ev.corner === 'red' ? 'Merah' : 'Netral',
        ev.description,
        ev.type.startsWith('jurus_')
          ? ev.pointsDelta === 0
            ? '-'
            : `${ev.pointsDelta > 0 ? '+' : '-'}${formatJurusScore(Math.abs(ev.pointsDelta))}`
          : ev.pointsDelta > 0
          ? `+${ev.pointsDelta}`
          : String(ev.pointsDelta),
      ]),
    });
  }

  // Signature Section
  const finalY = Math.min(
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14,
    260
  );
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const col1 = 35;
  const col2 = pageWidth / 2;
  const col3 = pageWidth - 35;

  doc.text('Ketua Pertandingan', col1, finalY, { align: 'center' });
  doc.text('Dewan Wasit-Juri', col2, finalY, { align: 'center' });
  doc.text('Wasit Pertandingan', col3, finalY, { align: 'center' });

  doc.line(col1 - 22, finalY + 18, col1 + 22, finalY + 18);
  doc.line(col2 - 22, finalY + 18, col2 + 22, finalY + 18);
  doc.line(col3 - 22, finalY + 18, col3 + 22, finalY + 18);

  const safeFileName = `Berita_Acara_${match.matchNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(safeFileName);
}

export function exportArenaSummaryPdf(
  arena: ArenaData,
  matches: MatchData[],
  options?: { title?: string; fileNamePrefix?: string }
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const reportTitle = options?.title || 'REKAPITULASI HASIL PERTANDINGAN';
  const fileNamePrefix = options?.fileNamePrefix || 'Rekap';

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');
  tryAddLogo(doc, arena.logoLeft, 10, 4, 18);
  tryAddLogo(doc, arena.logoRight, pageWidth - 28, 4, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${reportTitle} — ${arena.tournamentName.toUpperCase()}`, pageWidth / 2, 11, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const subParts: string[] = [];
  if (arena.venue?.trim()) subParts.push(arena.venue.trim());
  if (arena.eventDate?.trim()) subParts.push(arena.eventDate.trim());
  subParts.push('Peraturan IPSI 2026 & PERSILAT', `Dicetak ${new Date().toLocaleString('id-ID')}`);
  doc.text(subParts.join(' · '), pageWidth / 2, 19, {
    align: 'center',
  });

  autoTable(doc, {
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    head: [['Partai', 'Gelanggang', 'Kelas', 'Sudut Biru', 'Sudut Merah', 'Skor', 'Pemenang', 'Jenis Kemenangan']],
    body: matches.map((m) => [
      `${m.matchNumber} (${m.stage})`,
      `Gel. ${m.gelanggang || 'A'}`,
      m.weightClass,
      `${m.blueName}\n(${m.blueContingent})`,
      `${m.redName}\n(${m.redContingent})`,
      `${formatMatchScore(m, 'blue')} - ${formatMatchScore(m, 'red')}`,
      m.winner === 'blue' ? `BIRU: ${m.blueName}` : m.winner === 'red' ? `MERAH: ${m.redName}` : m.winner === 'draw' ? 'Seri' : '-',
      m.winMethod || '-',
    ]),
  });

  const safeName = `${fileNamePrefix}_${arena.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(safeName);
}

function drawLandscapeReportHeader(doc: jsPDF, arena: ArenaData, title: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');
  tryAddLogo(doc, arena.logoLeft, 10, 4, 18);
  tryAddLogo(doc, arena.logoRight, pageWidth - 28, 4, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${title} — ${arena.tournamentName.toUpperCase()}`, pageWidth / 2, 11, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const subParts: string[] = [];
  if (arena.venue?.trim()) subParts.push(arena.venue.trim());
  if (arena.eventDate?.trim()) subParts.push(arena.eventDate.trim());
  subParts.push('Peraturan IPSI 2026 & PERSILAT', `Dicetak ${new Date().toLocaleString('id-ID')}`);
  doc.text(subParts.join(' · '), pageWidth / 2, 19, {
    align: 'center',
  });
}

export function exportMedalStandingsPdf(
  arena: ArenaData,
  standings: MedalStandingRow[],
  awards: MedalAwardEntry[]
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawLandscapeReportHeader(doc, arena, 'DATA PEROLEHAN MEDALI KONTINGEN');

  autoTable(doc, {
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, halign: 'center' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      1: { halign: 'left', fontStyle: 'bold' },
      5: { fontStyle: 'bold' },
    },
    head: [['Peringkat', 'Kontingen / Perguruan', 'Emas', 'Perak', 'Perunggu', 'Total Medali']],
    body:
      standings.length > 0
        ? standings.map((r) => [
            String(r.rank),
            r.contingent,
            String(r.gold),
            String(r.silver),
            String(r.bronze),
            String(r.total),
          ])
        : [['-', 'Belum ada data perolehan medali', '0', '0', '0', '0']],
  });

  if (awards.length > 0) {
    const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('RINCIAN PERAIH MEDALI', 14, afterTableY);

    autoTable(doc, {
      startY: afterTableY + 3,
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      head: [['No', 'Medali', 'Nama Atlet', 'Kontingen / Perguruan', 'Kelas / Kategori', 'Partai / Babak']],
      body: awards.map((a, idx) => [
        String(idx + 1),
        a.medal,
        a.athleteName,
        a.contingent,
        a.weightClass,
        `${a.matchNumber} (${a.stage})`,
      ]),
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`Perolehan_Medali_${arena.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStamp}.pdf`);
}

export function exportAthletesRecapPdf(arena: ArenaData, athletes: AthleteData[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawLandscapeReportHeader(doc, arena, 'REKAP DAFTAR SELURUH ATLET TERDAFTAR');

  autoTable(doc, {
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    head: [
      [
        'No',
        'Nama Atlet',
        'Kontingen / Perguruan',
        'Kategori Usia',
        'Jenis Kelamin',
        'Kategori',
        'Kelas Tanding / Jurus',
        'Gelanggang',
      ],
    ],
    body:
      athletes.length > 0
        ? athletes.map((a, idx) => [
            String(idx + 1),
            a.name,
            a.contingent,
            a.ageCategory || 'Dewasa',
            a.gender || 'Putra',
            a.competitionCategory || 'Tanding',
            a.weightClass,
            `Gelanggang ${a.gelanggang || 'A'}`,
          ])
        : [['-', 'Belum ada atlet terdaftar', '-', '-', '-', '-', '-', '-']],
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`Rekap_Data_Atlet_${arena.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStamp}.pdf`);
}

function formatScheduleStatus(status: MatchData['status']): string {
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

export function exportMatchSchedulePdf(
  arena: ArenaData,
  matches: MatchData[],
  options?: { courtFilter?: ArenaCourt | 'Semua' }
): void {
  const courtFilter = options?.courtFilter && options.courtFilter !== 'Semua' ? options.courtFilter : undefined;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawLandscapeReportHeader(
    doc,
    arena,
    courtFilter
      ? `JADWAL PERTANDINGAN — GELANGGANG ${courtFilter}`
      : 'JADWAL PERTANDINGAN (KONTROL PARTAI)'
  );

  autoTable(doc, {
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    head: [
      [
        'No',
        'Gelanggang',
        'Partai',
        'Babak / Fase',
        'Kelas / Kategori',
        'Sudut Biru',
        'Sudut Merah',
        'Babak',
        'Status',
        'Skor & Pemenang',
      ],
    ],
    body:
      matches.length > 0
        ? matches.map((m, idx) => [
            String(idx + 1),
            `Gel. ${m.gelanggang || 'A'}`,
            m.matchNumber,
            m.stage,
            m.weightClass,
            `${m.blueName}\n(${m.blueContingent})`,
            `${m.redName}\n(${m.redContingent})`,
            `${m.totalRounds ?? 3} Babak`,
            formatScheduleStatus(m.status),
            m.winner
              ? `${formatMatchScore(m, 'blue')} - ${formatMatchScore(m, 'red')} (${m.winner === 'blue' ? 'BIRU' : m.winner === 'red' ? 'MERAH' : 'SERI'}${m.winMethod ? ` · ${m.winMethod}` : ''})`
              : `${formatMatchScore(m, 'blue')} - ${formatMatchScore(m, 'red')}`,
          ])
        : [['-', '-', '-', '-', 'Belum ada jadwal pertandingan', '-', '-', '-', '-', '-']],
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const suffix = courtFilter ? `_Gelanggang_${courtFilter}` : '';
  doc.save(`Jadwal_Pertandingan_${arena.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}_${dateStamp}.pdf`);
}

