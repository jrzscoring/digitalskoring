import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ArenaData, MatchData, MatchEvent } from '../types/silat';

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

  // Match Identity Table
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    head: [['Nomor Partai', 'Babak / Fase', 'Kelas Tanding', 'Status Pertandingan']],
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
    body: [
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

  // Event Chronology (Last 20 active events)
  const validEvents = events.filter((e) => !e.undone).slice(0, 20);
  if (validEvents.length > 0) {
    const afterDecisionY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: afterDecisionY,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      head: [['Babak', 'Waktu', 'Petugas', 'Sudut', 'Keterangan', 'Poin']],
      body: validEvents.map((ev) => [
        `Babak ${ev.round}`,
        ev.matchTimeFormatted,
        ev.actorRole,
        ev.corner === 'blue' ? 'Biru' : ev.corner === 'red' ? 'Merah' : 'Netral',
        ev.description,
        ev.pointsDelta > 0 ? `+${ev.pointsDelta}` : String(ev.pointsDelta),
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
    head: [['Partai', 'Kelas', 'Sudut Biru', 'Sudut Merah', 'Skor', 'Pemenang', 'Jenis Kemenangan']],
    body: matches.map((m) => [
      `${m.matchNumber} (${m.stage})`,
      m.weightClass,
      `${m.blueName}\n(${m.blueContingent})`,
      `${m.redName}\n(${m.redContingent})`,
      `${m.blueScore} - ${m.redScore}`,
      m.winner === 'blue' ? `BIRU: ${m.blueName}` : m.winner === 'red' ? `MERAH: ${m.redName}` : m.winner === 'draw' ? 'Seri' : '-',
      m.winMethod || '-',
    ]),
  });

  const safeName = `${fileNamePrefix}_${arena.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(safeName);
}
