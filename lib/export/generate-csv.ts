// ============================================================
// EMATHTOCO — Professional CSV Export Generator
// Pure TypeScript, no external dependencies.
// Generates academic-structured CSV with BOM for Excel.
// ============================================================

import { supabase } from '@/lib/supabase';

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

/** Escape CSV values: wrap in quotes if contains comma, quote, or newline */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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

/** Get the display value for a section score */
function getSectionScoreDisplay(
  sheets: SheetRow[],
  submissionId: string,
  sectionCode: string
): string {
  const sheet = sheets.find(
    s => s.pengumpulan_tugas_id === submissionId && s.section_code === sectionCode
  );
  if (!sheet) return '-';
  if (sheet.status === 'reupload_required') return 'REUPLOAD';
  if (sheet.nilai_final === null || sheet.nilai_final === undefined) return 'PENDING';
  return String(sheet.nilai_final);
}

/** Generate the status display text */
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
 * Fetch data and generate a professional CSV string.
 * Returns { csv, filename, count } or throws on error.
 */
export async function generateExportCSV(filters: ExportFilters): Promise<{
  csv: string;
  filename: string;
  count: number;
}> {
  // 1. Build the submissions query
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

  // Normalize submissions (handle array/object for joined tables)
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

  // Apply kelas filter client-side (since it's on the joined profile)
  const filteredSubmissions = filters.kelas
    ? submissions.filter(s => s.mahasiswa?.kelas === filters.kelas)
    : submissions;

  if (filteredSubmissions.length === 0) {
    throw new Error('Tidak ada data setelah menerapkan filter kelas.');
  }

  // 2. Fetch all lembar_jawaban for these submissions
  const submissionIds = filteredSubmissions.map(s => s.id);
  const { data: allSheets, error: sheetsError } = await supabase
    .from('lembar_jawaban')
    .select('pengumpulan_tugas_id, section_code, nilai_final, status')
    .in('pengumpulan_tugas_id', submissionIds);

  if (sheetsError) throw new Error(`Gagal mengambil data lembar jawaban: ${sheetsError.message}`);
  const sheets: SheetRow[] = (allSheets || []) as SheetRow[];

  // 3. Determine export metadata
  const mataKuliahName = filteredSubmissions[0]?.mata_kuliah?.nama_matkul || 'Unknown';
  const mataKuliahCode = filteredSubmissions[0]?.mata_kuliah?.kode_matkul || '';
  const exportDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const exportDateFilename = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const statusFilter = filters.finalizedOnly ? 'FINALIZED ONLY' : 'ALL STATUS';
  const modelFilter = filters.modelAi || 'ALL MODELS';

  // Determine unique kelas from data
  const kelasSet = new Set(filteredSubmissions.map(s => s.mahasiswa?.kelas || '-'));
  const kelasStr = [...kelasSet].join(', ');

  // 4. Build CSV lines
  const lines: string[] = [];

  // Header metadata block
  lines.push('E-MATHTOCO');
  lines.push(`REKAP NILAI KELAS ${mataKuliahName} (${mataKuliahCode})`);
  lines.push('');
  lines.push(`Tanggal Export,${escapeCSV(exportDate)}`);
  lines.push(`Model AI,${escapeCSV(modelFilter)}`);
  lines.push(`Status Data,${escapeCSV(statusFilter)}`);
  lines.push(`Kelas,${escapeCSV(kelasStr)}`);
  lines.push(`Jumlah Mahasiswa,${filteredSubmissions.length}`);
  lines.push('');

  // Grouped header row 1
  const groupHeader = [
    'IDENTITAS', '', '', '',
    'SOAL 1', '', '', '', '', '',
    'SOAL 2', '', '', '', '', '',
    'SOAL 3', '', '', '', '', '',
    'SOAL 4', '', '', '', '', '',
    'FINAL', '', '',
  ];
  lines.push(groupHeader.map(escapeCSV).join(','));

  // Column header row 2
  const columnHeader = [
    'No', 'Nama', 'NIM', 'Kelas',
    '1A', '1B', '1C', '1D', '1E', '1F',
    '2A', '2B', '2C', '2D', '2E', '2F',
    '3A', '3B', '3C', '3D', '3E', '3F',
    '4A', '4B', '4C', '4D', '4E', '4F',
    'Total', 'Status', 'Tanggal Submit',
  ];
  lines.push(columnHeader.map(escapeCSV).join(','));

  // Data rows
  filteredSubmissions.forEach((sub, idx) => {
    const row: string[] = [
      String(idx + 1),
      sub.mahasiswa?.nama_lengkap || '-',
      sub.mahasiswa?.nim_nip || '-',
      sub.mahasiswa?.kelas || '-',
    ];

    // Section scores (24 columns)
    for (const code of SECTION_CODES) {
      row.push(getSectionScoreDisplay(sheets, sub.id, code));
    }

    // Final columns
    row.push(sub.nilai_akhir !== null && sub.nilai_akhir !== undefined ? String(sub.nilai_akhir) : 'PENDING');
    row.push(getStatusDisplay(sub.status_submit));
    row.push(formatDate(sub.waktu_submit));

    lines.push(row.map(escapeCSV).join(','));
  });

  // 5. Assemble CSV with UTF-8 BOM for Excel
  const BOM = '\uFEFF';
  const csv = BOM + lines.join('\n');

  // 6. Generate professional filename
  const sanitizedMatkul = mataKuliahName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const sanitizedKelas = (filters.kelas || 'semua')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  const filename = `e-mathtoco_rekap_${sanitizedMatkul}_${sanitizedKelas}_${exportDateFilename}.csv`;

  return {
    csv,
    filename,
    count: filteredSubmissions.length,
  };
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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
