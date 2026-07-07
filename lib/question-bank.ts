import { supabase } from '@/lib/supabase';
import { SECTION_CODES, type SectionCode, getMaxScoreForSection } from '@/lib/domain-contract';

export type QuestionSetStatus = 'draft' | 'published' | 'archived';

export interface QuestionAsset {
  id: string;
  question_set_id: string;
  section_code: SectionCode;
  file_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  created_at: string;
  signedUrl?: string | null;
}

export interface QuestionSection {
  id: string;
  question_set_id: string;
  section_code: SectionCode;
  question_number: number;
  part_label: string;
  parent_prompt: string;
  question_text: string;
  helper_text: string | null;
  max_score: number;
  sort_order: number;
  assets: QuestionAsset[];
}

export interface QuestionSet {
  id: string;
  course_id: string;
  title: string;
  academic_year: string | null;
  semester: string | null;
  status: QuestionSetStatus;
  format_version: 'fixed_4x6_v1';
  published_at: string | null;
  updated_at: string;
  sections: QuestionSection[];
}

export interface ImageDimensions {
  width: number;
  height: number;
}

type QuestionSetRow = Omit<QuestionSet, 'sections'>;
type QuestionSectionRow = Omit<QuestionSection, 'assets'>;

export const FIXED_SECTION_LABEL =
  'Untuk demo sidang, format soal dikunci 4 soal × 6 bagian. Format jumlah soal lain tersedia pada pengembangan berikutnya.';

export const SECTION_META = SECTION_CODES.map((sectionCode, index) => {
  const [, numberText, partLabel] = sectionCode.match(/^S-(\d)([A-F])$/) ?? [];
  const questionNumber = Number(numberText);
  return {
    sectionCode,
    questionNumber,
    partLabel,
    sortOrder: index + 1,
    maxScore: getMaxScoreForSection(sectionCode),
  };
});

export function groupSectionsByQuestion(sections: QuestionSection[]): Map<number, QuestionSection[]> {
  const grouped = new Map<number, QuestionSection[]>();
  for (const section of sections) {
    const current = grouped.get(section.question_number) ?? [];
    current.push(section);
    grouped.set(section.question_number, current);
  }
  for (const [questionNumber, rows] of grouped.entries()) {
    grouped.set(
      questionNumber,
      [...rows].sort((a, b) => a.sort_order - b.sort_order),
    );
  }
  return grouped;
}

async function attachSignedUrls(assets: QuestionAsset[]): Promise<QuestionAsset[]> {
  if (assets.length === 0) return assets;

  const paths = assets.map((asset) => asset.file_path);
  const { data, error } = await supabase.storage
    .from('question-assets')
    .createSignedUrls(paths, 60 * 30);

  if (error || !data) {
    return assets.map((asset) => ({ ...asset, signedUrl: null }));
  }

  const signedByPath = new Map<string, string | null>();
  data.forEach((item, index) => {
    signedByPath.set(paths[index], item.signedUrl ?? null);
  });

  return assets.map((asset) => ({
    ...asset,
    signedUrl: signedByPath.get(asset.file_path) ?? null,
  }));
}

async function hydrateQuestionSet(row: QuestionSetRow): Promise<QuestionSet> {
  const { data: sectionRows, error: sectionsError } = await supabase
    .from('question_sections')
    .select(`
      id,
      question_set_id,
      section_code,
      question_number,
      part_label,
      parent_prompt,
      question_text,
      helper_text,
      max_score,
      sort_order
    `)
    .eq('question_set_id', row.id)
    .order('sort_order', { ascending: true });

  if (sectionsError) throw sectionsError;

  const { data: assetRows, error: assetsError } = await supabase
    .from('question_assets')
    .select(`
      id,
      question_set_id,
      section_code,
      file_path,
      mime_type,
      byte_size,
      width,
      height,
      caption,
      created_at
    `)
    .eq('question_set_id', row.id)
    .order('created_at', { ascending: true });

  if (assetsError) throw assetsError;

  const signedAssets = await attachSignedUrls((assetRows ?? []) as QuestionAsset[]);
  const assetsBySection = new Map<string, QuestionAsset[]>();
  for (const asset of signedAssets) {
    const current = assetsBySection.get(asset.section_code) ?? [];
    current.push(asset);
    assetsBySection.set(asset.section_code, current);
  }

  const sections = ((sectionRows ?? []) as QuestionSectionRow[]).map((section) => ({
    ...section,
    assets: assetsBySection.get(section.section_code) ?? [],
  }));

  return {
    ...row,
    sections,
  };
}

export async function fetchPublishedQuestionSet(courseId: string): Promise<QuestionSet | null> {
  const { data, error } = await supabase
    .from('question_sets')
    .select(`
      id,
      course_id,
      title,
      academic_year,
      semester,
      status,
      format_version,
      published_at,
      updated_at
    `)
    .eq('course_id', courseId)
    .eq('status', 'published')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return hydrateQuestionSet(data as QuestionSetRow);
}

export async function fetchEditableQuestionSet(courseId: string): Promise<QuestionSet | null> {
  const { data, error } = await supabase
    .from('question_sets')
    .select(`
      id,
      course_id,
      title,
      academic_year,
      semester,
      status,
      format_version,
      published_at,
      updated_at
    `)
    .eq('course_id', courseId)
    .in('status', ['draft', 'published'])
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return hydrateQuestionSet(data as QuestionSetRow);
}

export async function createBlankQuestionSet(courseId: string, title: string): Promise<QuestionSet> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data: setRow, error: setError } = await supabase
    .from('question_sets')
    .insert({
      course_id: courseId,
      title,
      status: 'draft',
      format_version: 'fixed_4x6_v1',
      created_by: userData.user?.id ?? null,
    })
    .select(`
      id,
      course_id,
      title,
      academic_year,
      semester,
      status,
      format_version,
      published_at,
      updated_at
    `)
    .single();

  if (setError) throw setError;

  const sectionRows = SECTION_META.map((meta) => ({
    question_set_id: setRow.id,
    section_code: meta.sectionCode,
    question_number: meta.questionNumber,
    part_label: meta.partLabel,
    parent_prompt: '',
    question_text: '',
    helper_text: null,
    max_score: meta.maxScore,
    sort_order: meta.sortOrder,
  }));

  const { error: sectionsError } = await supabase
    .from('question_sections')
    .insert(sectionRows);

  if (sectionsError) throw sectionsError;

  return hydrateQuestionSet(setRow as QuestionSetRow);
}

export async function updateQuestionSection(
  sectionId: string,
  values: Pick<QuestionSection, 'parent_prompt' | 'question_text' | 'helper_text'>,
): Promise<void> {
  const { error } = await supabase
    .from('question_sections')
    .update({
      parent_prompt: values.parent_prompt,
      question_text: values.question_text,
      helper_text: values.helper_text || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sectionId);

  if (error) throw error;
}

export async function publishQuestionSet(questionSetId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_question_set', {
    p_question_set_id: questionSetId,
  });
  if (error) throw error;
}

export function validateQuestionImage(file: File): string | null {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type)) {
    return 'File harus berupa gambar PNG, JPG/JPEG, atau WEBP.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'Ukuran gambar maksimal 2 MB.';
  }
  return null;
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<ImageDimensions>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadQuestionAsset(params: {
  courseId: string;
  questionSetId: string;
  sectionCode: SectionCode;
  file: File;
  caption?: string;
}): Promise<void> {
  const validation = validateQuestionImage(params.file);
  if (validation) throw new Error(validation);

  const dimensions = await readImageDimensions(params.file);
  if (dimensions.width > 2000 || dimensions.height > 2000) {
    throw new Error('Dimensi gambar maksimal 2000×2000 piksel.');
  }

  const extension = params.file.type === 'image/png'
    ? 'png'
    : params.file.type === 'image/webp'
      ? 'webp'
      : 'jpg';
  const filePath = `${params.courseId}/${params.questionSetId}/${params.sectionCode}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('question-assets')
    .upload(filePath, params.file, {
      cacheControl: '3600',
      contentType: params.file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: userData } = await supabase.auth.getUser();
  const { error: metadataError } = await supabase
    .from('question_assets')
    .insert({
      question_set_id: params.questionSetId,
      section_code: params.sectionCode,
      file_path: filePath,
      mime_type: params.file.type,
      byte_size: params.file.size,
      width: dimensions.width,
      height: dimensions.height,
      caption: params.caption || null,
      uploaded_by: userData.user?.id ?? null,
    });

  if (metadataError) throw metadataError;
}

export async function deleteQuestionAsset(asset: QuestionAsset): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from('question-assets')
    .remove([asset.file_path]);

  if (storageError) throw storageError;

  const { error: metadataError } = await supabase
    .from('question_assets')
    .delete()
    .eq('id', asset.id);

  if (metadataError) throw metadataError;
}
