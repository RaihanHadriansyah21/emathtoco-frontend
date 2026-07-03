export type SignPaths = (
  paths: string[],
) => Promise<Map<string, string>>;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

export class SignedUrlCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pendingBatches = new Map<
    string,
    Promise<Map<string, string>>
  >();

  constructor(
    private readonly ttlMs: number,
    private readonly safetyWindowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(path: string): string | null {
    const entry = this.entries.get(path);
    if (!entry) return null;
    if (entry.expiresAt - this.now() <= this.safetyWindowMs) {
      this.entries.delete(path);
      return null;
    }
    return entry.url;
  }

  set(path: string, url: string): void {
    this.entries.set(path, {
      url,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  invalidate(path: string): void {
    this.entries.delete(path);
  }

  clear(): void {
    this.entries.clear();
    this.pendingBatches.clear();
  }

  async resolve(paths: string[], signPaths: SignPaths): Promise<Map<string, string>> {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    const resolved = new Map<string, string>();
    const missing: string[] = [];

    for (const path of uniquePaths) {
      const cached = this.get(path);
      if (cached) {
        resolved.set(path, cached);
      } else {
        missing.push(path);
      }
    }

    if (missing.length === 0) return resolved;

    const batchKey = [...missing].sort().join('\n');
    let pending = this.pendingBatches.get(batchKey);
    if (!pending) {
      pending = signPaths(missing).then((signed) => {
        for (const path of missing) {
          const url = signed.get(path);
          if (url) this.set(path, url);
        }
        return signed;
      });
      this.pendingBatches.set(batchKey, pending);
    }

    try {
      const signed = await pending;
      for (const path of missing) {
        const url = signed.get(path);
        if (url) resolved.set(path, url);
      }
      return resolved;
    } finally {
      this.pendingBatches.delete(batchKey);
    }
  }
}
