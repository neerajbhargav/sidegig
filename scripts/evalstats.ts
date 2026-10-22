// Small statistics helpers shared by the eval scripts. Seeded, so a rerun on
// the same results gives the same interval.

/** mulberry32: a seeded generator in [0, 1). */
export function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Percentile bootstrap 95% interval: resample `items` with replacement
 * `iters` times and take the 2.5th and 97.5th percentile of `stat`.
 * Resamples where `stat` is NaN (for example no positives drawn) are skipped.
 */
export function bootstrap95<T>(items: T[], stat: (sample: T[]) => number, iters = 10_000, seed = 1): [number, number] {
  const rand = seeded(seed);
  const vals: number[] = [];
  for (let i = 0; i < iters; i++) {
    const s = Array.from({ length: items.length }, () => items[Math.floor(rand() * items.length)]);
    const v = stat(s);
    if (!Number.isNaN(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  const at = (q: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(q * vals.length)))];
  return [at(0.025), at(0.975)];
}

export const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
