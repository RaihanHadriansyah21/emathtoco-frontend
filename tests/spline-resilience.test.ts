import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const loginScene = readFileSync(
  join(process.cwd(), 'components', 'ui', 'login-ai-scene.tsx'),
  'utf8',
);

describe('Spline scene resilience contract', () => {
  it('mounts Spline directly without a separate connectivity precheck', () => {
    expect(loginScene).toContain('<SplineScene');
    expect(loginScene).not.toContain('checkSplineConnectivity');
    expect(loginScene).not.toContain("method: 'HEAD'");
    expect(loginScene).not.toContain('isSplineReady');
  });

  it('does not permanently replace a slow scene when the loader times out', () => {
    expect(loginScene).toContain('hiding the loader while the scene continues');
    expect(loginScene).not.toContain(
      'Spline load timed out (20s safeguard). Falling back',
    );
  });
});
