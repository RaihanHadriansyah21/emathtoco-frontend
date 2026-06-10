// ============================================================
// EMATHTOCO — Professional Excel (.xlsx) Export Generator
// Built using ExcelJS.
// ============================================================

import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';

// Section codes in order
const SECTION_CODES = [
  'S-1A', 'S-1B', 'S-1C', 'S-1D', 'S-1E', 'S-1F',
  'S-2A', 'S-2B', 'S-2C', 'S-2D', 'S-2E', 'S-2F',
  'S-3A', 'S-3B', 'S-3C', 'S-3D', 'S-3E', 'S-3F',
  'S-4A', 'S-4B', 'S-4C', 'S-4D', 'S-4E', 'S-4F',
];

export interface ExportFilters {
  finalizedOnly: boolean;
  kelas?: string;
  mataKuliahId?: string;
  modelAi?: string;
}

interface SubmissionRow {
  id: string;
  mahasiswa_id: string;
  status_submit: string;
  waktu_submit: string | null;
  nilai_akhir: number | null;
  model_ai: string | null;
  mahasiswa: {
    nama_lengkap: string;
    nim_nip: string;
    kelas: string;
  } | null;
  mata_kuliah: {
    nama_matkul: string;
    kode_matkul: string;
  } | null;
}

interface SheetRow {
  pengumpulan_tugas_id: string;
  section_code: string;
  nilai_final: number | null;
  status: string | null;
}

/** Helper to convert column index (1-based) to Excel letter */
function getColumnLetter(colNum: number): string {
  let temp;
  let letter = '';
  while (colNum > 0) {
    temp = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colNum = (colNum - temp - 1) / 26;
  }
  return letter;
}

/** Format date for display */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Get the value for a section score */
function getSectionScoreValue(
  sheets: SheetRow[],
  submissionId: string,
  sectionCode: string
): number | string {
  const sheet = sheets.find(
    s => s.pengumpulan_tugas_id === submissionId && s.section_code === sectionCode
  );
  if (!sheet) return '-';
  if (sheet.status === 'reupload_required') return 'REUPLOAD';
  if (sheet.nilai_final === null || sheet.nilai_final === undefined) return 'PENDING';
  return sheet.nilai_final;
}

/** Get overall status display text */
function getStatusDisplay(status: string): string {
  switch (status) {
    case 'submitted': return 'Menunggu AI';
    case 'processing_ai': return 'Diproses AI';
    case 'reviewed': return 'Direview';
    case 'finalized': return 'Finalized';
    case 'draft': return 'Draft';
    default: return status;
  }
}

/**
 * Generate a styled Excel file buffer & dynamic filename.
 */
export async function generateExportExcel(filters: ExportFilters): Promise<{
  buffer: ExcelJS.Buffer;
  filename: string;
  count: number;
}> {
  // 1. Query Supabase
  let query = supabase
    .from('pengumpulan_tugas')
    .select(`
      id,
      mahasiswa_id,
      status_submit,
      waktu_submit,
      nilai_akhir,
      model_ai,
      mahasiswa:profil_pengguna!pengumpulan_tugas_mahasiswa_id_fkey(nama_lengkap, nim_nip, kelas),
      mata_kuliah (nama_matkul, kode_matkul)
    `)
    .order('waktu_submit', { ascending: true });

  if (filters.finalizedOnly) {
    query = query.eq('status_submit', 'finalized');
  }

  if (filters.mataKuliahId) {
    query = query.eq('mata_kuliah_id', filters.mataKuliahId);
  }

  if (filters.modelAi) {
    query = query.eq('model_ai', filters.modelAi);
  }

  const { data: rawSubmissions, error: subError } = await query;
  if (subError) throw new Error(`Gagal mengambil data pengumpulan: ${subError.message}`);
  if (!rawSubmissions || rawSubmissions.length === 0) {
    throw new Error('Tidak ada data yang cocok dengan filter yang dipilih.');
  }

  // Normalize data
  const submissions: SubmissionRow[] = rawSubmissions.map((r: Record<string, unknown>) => {
    const mhs = Array.isArray(r.mahasiswa) ? r.mahasiswa[0] : r.mahasiswa;
    const mk = Array.isArray(r.mata_kuliah) ? r.mata_kuliah[0] : r.mata_kuliah;
    return {
      id: r.id as string,
      mahasiswa_id: r.mahasiswa_id as string,
      status_submit: r.status_submit as string,
      waktu_submit: r.waktu_submit as string | null,
      nilai_akhir: r.nilai_akhir as number | null,
      model_ai: r.model_ai as string | null,
      mahasiswa: mhs as SubmissionRow['mahasiswa'],
      mata_kuliah: mk as SubmissionRow['mata_kuliah'],
    };
  });

  // Client-side kelas filter
  const filteredSubmissions = filters.kelas
    ? submissions.filter(s => s.mahasiswa?.kelas === filters.kelas)
    : submissions;

  if (filteredSubmissions.length === 0) {
    throw new Error('Tidak ada data setelah menerapkan filter kelas.');
  }

  // Fetch all sheets (lembar_jawaban)
  const submissionIds = filteredSubmissions.map(s => s.id);
  const { data: allSheets, error: sheetsError } = await supabase
    .from('lembar_jawaban')
    .select('pengumpulan_tugas_id, section_code, nilai_final, status')
    .in('pengumpulan_tugas_id', submissionIds);

  if (sheetsError) throw new Error(`Gagal mengambil data lembar jawaban: ${sheetsError.message}`);
  const sheets: SheetRow[] = (allSheets || []) as SheetRow[];

  // 2. Setup workbook and sheet
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rekap Nilai');

  // Configure grid lines and frozen rows (freeze first 11 rows)
  sheet.views = [
    {
      state: 'frozen',
      ySplit: 11,
      showGridLines: true,
    },
  ];

  // Resolve metadata fields
  const mataKuliahName = filteredSubmissions[0]?.mata_kuliah?.nama_matkul || 'Unknown';
  const mataKuliahCode = filteredSubmissions[0]?.mata_kuliah?.kode_matkul || '';

  const today = new Date();
  const exportDate = today.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const exportDateFilename = today.toISOString().slice(0, 10);

  const statusFilter = filters.finalizedOnly ? 'FINALIZED ONLY' : 'ALL STATUS';
  const modelFilter = filters.modelAi || 'ALL MODELS';

  const kelasSet = new Set(filteredSubmissions.map(s => s.mahasiswa?.kelas || '-'));
  const kelasStr = [...kelasSet].join(', ');

  // 3. Populate Header / Title Section (Rows 1-2)
  sheet.mergeCells('A1:AE1');
  const titleRow1 = sheet.getCell('A1');
  titleRow1.value = 'E-MATHTOCO';
  titleRow1.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow1.alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' } // Slate-900
  };

  sheet.mergeCells('A2:AE2');
  const titleRow2 = sheet.getCell('A2');
  titleRow2.value = `REKAP NILAI KELAS ${mataKuliahName.toUpperCase()} (${mataKuliahCode})`;
  titleRow2.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF94A3B8' } }; // Slate-400
  titleRow2.alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' }
  };

  sheet.getRow(1).height = 32;
  sheet.getRow(2).height = 24;

  // 4. Metadata Block (Rows 4-8)
  const metadata = [
    { label: 'Tanggal Export', value: `: ${exportDate}` },
    { label: 'Model AI', value: `: ${modelFilter}` },
    { label: 'Status Data', value: `: ${statusFilter}` },
    { label: 'Kelas', value: `: ${kelasStr}` },
    { label: 'Jumlah Mahasiswa', value: `: ${filteredSubmissions.length}` },
  ];

  metadata.forEach((item, idx) => {
    const rowNum = 4 + idx;
    const labelCell = sheet.getCell(`A${rowNum}`);
    const valCell = sheet.getCell(`B${rowNum}`);

    labelCell.value = item.label;
    labelCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } }; // slate-600

    valCell.value = item.value;
    valCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } }; // slate-800

    sheet.getRow(rowNum).height = 18;
  });

  // 5. Grouped Headers Row 10 (IDENTITAS, SOAL 1-4, FINAL)
  sheet.mergeCells('A10:D10');
  sheet.mergeCells('E10:J10');
  sheet.mergeCells('K10:P10');
  sheet.mergeCells('Q10:V10');
  sheet.mergeCells('W10:AB10');
  sheet.mergeCells('AC10:AE10');

  const groupHeaders = [
    { cell: 'A10', text: 'IDENTITAS' },
    { cell: 'E10', text: 'SOAL 1' },
    { cell: 'K10', text: 'SOAL 2' },
    { cell: 'Q10', text: 'SOAL 3' },
    { cell: 'W10', text: 'SOAL 4' },
    { cell: 'AC10', text: 'FINAL' },
  ];

  groupHeaders.forEach(gh => {
    const cell = sheet.getCell(gh.cell);
    cell.value = gh.text;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // slate-800
    };
  });

  // Borders for grouped headers row
  for (let c = 1; c <= 31; c++) {
    const cell = sheet.getCell(`${getColumnLetter(c)}10`);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'thin', color: { argb: 'FF0F172A' } }
    };
  }
  sheet.getRow(10).height = 26;

  // 6. Sub Headers Row 11
  const colHeaders = [
    'No', 'Nama', 'NIM', 'Kelas',
    '1A', '1B', '1C', '1D', '1E', '1F',
    '2A', '2B', '2C', '2D', '2E', '2F',
    '3A', '3B', '3C', '3D', '3E', '3F',
    '4A', '4B', '4C', '4D', '4E', '4F',
    'Total', 'Status', 'Tanggal Submit'
  ];

  colHeaders.forEach((text, colIdx) => {
    const colLetter = getColumnLetter(colIdx + 1);
    const cell = sheet.getCell(`${colLetter}11`);
    cell.value = text;
    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' } // slate-700
    };

    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'double', color: { argb: 'FFCBD5E1' } }
    };
  });
  sheet.getRow(11).height = 22;

  // 7. Populating Data Rows (Row 12+)
  filteredSubmissions.forEach((sub, idx) => {
    const rowNum = 12 + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;

    // No
    row.getCell(1).value = idx + 1;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Nama
    row.getCell(2).value = sub.mahasiswa?.nama_lengkap || '-';
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

    // NIM
    row.getCell(3).value = sub.mahasiswa?.nim_nip || '-';
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).numFmt = '@'; // Force text string format

    // Kelas
    row.getCell(4).value = sub.mahasiswa?.kelas || '-';
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

    // Section scores (24 columns)
    SECTION_CODES.forEach((code, codeIdx) => {
      const colIdx = 5 + codeIdx;
      const cell = row.getCell(colIdx);
      const scoreVal = getSectionScoreValue(sheets, sub.id, code);

      cell.value = scoreVal;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Coloring section cells based on rules
      if (scoreVal === 'PENDING') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF9C3' } // soft yellow
        };
        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFA16207' } }; // dark yellow text
      } else if (scoreVal === 'REUPLOAD') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' } // soft red
        };
        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } }; // dark red text
      } else if (typeof scoreVal === 'number') {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1E293B' } };
      } else {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF94A3B8' } }; // gray for '-'
      }
    });

    // Total accumulated score
    const totalCell = row.getCell(29);
    totalCell.value = sub.nilai_akhir !== null && sub.nilai_akhir !== undefined ? sub.nilai_akhir : 'PENDING';
    totalCell.alignment = { horizontal: 'center', vertical: 'middle' };

    if (totalCell.value === 'PENDING') {
      totalCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF9C3' }
      };
      totalCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFA16207' } };
    } else {
      totalCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    }

    // Status Column
    const statusCell = row.getCell(30);
    const statusText = getStatusDisplay(sub.status_submit);
    statusCell.value = statusText.toUpperCase();
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

    if (sub.status_submit === 'finalized') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' } // soft green
      };
      statusCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FF15803D' } }; // dark green text
    } else {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF9C3' } // soft yellow
      };
      statusCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FFA16207' } }; // dark yellow text
    }

    // Tanggal Submit
    const dateCell = row.getCell(31);
    dateCell.value = formatDate(sub.waktu_submit);
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dateCell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF475569' } };

    // Apply thin border to all cells in the row
    for (let c = 1; c <= 31; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (!cell.font) {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1E293B' } };
      }
    }
  });

  // 8. Custom column widths for standard visual spacing
  sheet.columns.forEach((column, colIdx) => {
    if (colIdx === 0) column.width = 6;       // No
    else if (colIdx === 1) column.width = 24;  // Nama
    else if (colIdx === 2) column.width = 16;  // NIM
    else if (colIdx === 3) column.width = 10;  // Kelas
    else if (colIdx >= 4 && colIdx < 28) column.width = 7; // Section scores S-1A to S-4F
    else if (colIdx === 28) column.width = 10; // Total
    else if (colIdx === 29) column.width = 15; // Status
    else if (colIdx === 30) column.width = 20; // Date Submit
  });

  // 9. Generate filename following user's exact specification
  const sanitizedMatkul = mataKuliahName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const sanitizedKelas = (filters.kelas || 'semua')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  const filename = `e-mathtoco_rekap_${sanitizedMatkul}_kelas${sanitizedKelas}_${exportDateFilename}.xlsx`;

  // 10. Write workbook buffer
  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename,
    count: filteredSubmissions.length
  };
}

/**
 * Trigger dynamic file download in the browser
 */
export function downloadExcel(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
