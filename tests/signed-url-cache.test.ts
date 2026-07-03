import { describe, expect, it, vi } from 'vitest';

import { SignedUrlCache } from '@/lib/storage/signed-url-cache';

describe('SignedUrlCache', () => {
  it('reuses the same URL instead of signing an unchanged object repeatedly', async () => {
    const signer = vi.fn(async (paths: string[]) => new Map(
      paths.map((path) => [path, `https://storage.invalid/${path}?token=stable`]),
    ));
    const cache = new SignedUrlCache(3_000_000, 60_000);

    const first = await cache.resolve(['student/submission/S-1A/image.jpg'], signer);
    const second = await cache.resolve(['student/submission/S-1A/image.jpg'], signer);

    expect(first).toEqual(second);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('refreshes a URL only when it enters the expiry safety window', async () => {
    let now = 1_000_000;
    const signer = vi.fn(async (paths: string[]) => new Map(
      paths.map((path) => [path, `https://storage.invalid/${path}?at=${now}`]),
    ));
    const cache = new SignedUrlCache(100_000, 10_000, () => now);

    await cache.resolve(['answer.jpg'], signer);
    now += 89_999;
    await cache.resolve(['answer.jpg'], signer);
    now += 2;
    await cache.resolve(['answer.jpg'], signer);

    expect(signer).toHaveBeenCalledTimes(2);
  });

  it('coalesces simultaneous requests for the same path batch', async () => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signer = vi.fn(async (paths: string[]) => {
      await waiting;
      return new Map(paths.map((path) => [path, `https://storage.invalid/${path}`]));
    });
    const cache = new SignedUrlCache(100_000, 10_000);

    const first = cache.resolve(['a.jpg', 'b.jpg'], signer);
    const second = cache.resolve(['b.jpg', 'a.jpg'], signer);
    release?.();
    await Promise.all([first, second]);

    expect(signer).toHaveBeenCalledTimes(1);
  });
});
