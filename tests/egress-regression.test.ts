import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const uploadPage = readFileSync(
  join(root, 'app', 'matkul', '[id]', 'page.tsx'),
  'utf8',
);
const reviewPage = readFileSync(
  join(root, 'app', 'dosen', 'review', '[id]', 'page.tsx'),
  'utf8',
);

describe('egress regression contract', () => {
  it('keeps signed URL rotation out of polling pages', () => {
    expect(uploadPage).not.toContain('.createSignedUrl');
    expect(reviewPage).not.toContain('.createSignedUrl');
    expect(uploadPage).toContain('getAnswerImageUrls');
    expect(reviewPage).toContain('getAnswerImageUrls');
  });

  it('polls only parent status metadata and lazy-loads answer previews', () => {
    expect(uploadPage).toContain(".select('status_submit, updated_at')");
    expect(uploadPage).toContain('loading="lazy"');
    expect(reviewPage).toContain('loading="lazy"');
  });
});
