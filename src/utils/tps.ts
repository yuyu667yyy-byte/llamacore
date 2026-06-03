/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

// ── Tokens-per-second meter ────────────────────────────────────────────────────
// A small streaming throughput tracker shared by the chat view and the workflow
// engine so both report the same numbers the same way.
//
// `live` is a windowed rate (smoothed over `windowMs`) suitable for a ticking
// readout. `avg` is total tokens over the *generation* span — measured from the
// first token to the last, so prompt-processing latency before the first token
// doesn't drag the number down (this matches llama.cpp's `predicted_per_second`).
// `peak` is the highest `live` rate observed during the run.

export interface TpsStats {
  tokens: number
  live: number // recent windowed rate, tok/s
  avg: number // tokens / generation span, tok/s
  peak: number // highest live rate seen, tok/s
  elapsedMs: number // generation span (first token → last token)
}

const EMPTY: TpsStats = { tokens: 0, live: 0, avg: 0, peak: 0, elapsedMs: 0 }

export class TpsMeter {
  private firstMs: number | null = null
  private lastMs = 0
  private tokens = 0
  private peak = 0
  private live = 0
  private window: Array<{ t: number; n: number }> = []
  private readonly windowMs: number

  constructor(windowMs = 1000) {
    this.windowMs = windowMs
  }

  reset(): void {
    this.firstMs = null
    this.lastMs = 0
    this.tokens = 0
    this.peak = 0
    this.live = 0
    this.window = []
  }

  // Record `n` newly generated tokens at time `now`, returning the latest stats.
  add(n = 1, now: number = Date.now()): TpsStats {
    if (n <= 0) return this.snapshot(now)
    if (this.firstMs === null) this.firstMs = now
    this.lastMs = now
    this.tokens += n

    this.window.push({ t: now, n })
    const cutoff = now - this.windowMs
    while (this.window.length > 1 && this.window[0].t < cutoff) this.window.shift()

    // Rate over the window, excluding the oldest sample's tokens so we measure
    // what arrived *across* the interval rather than dividing by ~0 on the first
    // tick (which would spike the rate spuriously).
    const span = now - this.window[0].t
    if (span >= 200) {
      const winTokens = this.window.reduce((s, x) => s + x.n, 0) - this.window[0].n
      this.live = (winTokens / span) * 1000
      if (this.live > this.peak) this.peak = this.live
    }
    return this.snapshot(now)
  }

  snapshot(_now: number = Date.now()): TpsStats {
    if (this.firstMs === null) return { ...EMPTY }
    const genMs = Math.max(0, this.lastMs - this.firstMs)
    const avg = genMs > 0 ? (this.tokens / genMs) * 1000 : 0
    return { tokens: this.tokens, live: this.live, avg, peak: this.peak, elapsedMs: genMs }
  }
}

// Format a rate for display: one decimal under 100, whole numbers above.
export function fmtTps(v: number): string {
  if (!isFinite(v) || v <= 0) return '0'
  return v >= 100 ? Math.round(v).toString() : v.toFixed(1)
}
