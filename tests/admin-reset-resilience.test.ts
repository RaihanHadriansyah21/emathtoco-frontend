import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const resetPage = readFileSync(
  join(process.cwd(), 'app', 'admin', 'reset', 'page.tsx'),
  'utf8',
);
const backendStore = readFileSync(
  join(process.cwd(), 'lib', 'backend-store.tsx'),
  'utf8',
);

describe('admin reset resilience contract', () => {
  it('keeps reset errors visible inside the confirmation modal', () => {
    expect(resetPage).toContain('role="alert"');
    expect(resetPage).toContain('{message.text}');
    expect(resetPage).toContain('timeoutMs: 60_000');
  });

  it('does not report the backend offline after one transient failure', () => {
    expect(backendStore).toContain('consecutiveFailuresRef.current >= 2');
    expect(backendStore).toContain("? 'offline' : 'degraded'");
  });
});
