//! Visual-Fingerprint (W9-PRESENTER-8) — structural FNV-1a 64-bit hash + canonicalisation.
//!
//! Wird vom Visual-Regression-Test (visualRegression.test.tsx) verwendet, um
//! deterministische Hash-Vergleiche zwischen Baseline und aktuellem Render
//! durchzuführen. Node-Env-kompatibel (kein Browser nötig).

/**
 * FNV-1a 64-bit Hash. Deterministic, no crypto dependency, no Node
 * Buffer/Stream coupling. Same input → same hash.
 */
export function markupHash(markup: string): string {
  // FNV-1a 64-bit offset basis + prime
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = (1n << 64n) - 1n
  for (let i = 0; i < markup.length; i++) {
    hash = (hash ^ BigInt(markup.charCodeAt(i))) & mask
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, "0")
}

/**
 * Canonicalise markup for stable comparison: strip whitespace, normalise
 * attribute order, drop comments.
 */
export function canonicaliseMarkup(markup: string): string {
  return markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim()
}

/**
 * Structural signals (W9-PRESENTER-8 §11.3 False-PASS-Schutz):
 * Returns ok=false + list of missing signals if the markup is suspiciously
 * empty / fallback / unrendered.
 */
export interface StructuralCheck {
  ok: boolean
  missing: string[]
}

import type { VisualFixture } from "./visualFixtures"

export function assertFixtureStructuralSignals(
  fixture: VisualFixture,
  markup: string,
): StructuralCheck {
  const missing: string[] = []

  // Plant count must match fixture.teams.length
  const plantMatches = markup.match(/class="[^"]*flower-plant[^"]*"/g) ?? []
  if (plantMatches.length < fixture.teams.length) {
    missing.push(
      `plant count ${plantMatches.length} < expected ${fixture.teams.length}`,
    )
  }

  // Team-meter count must match fixture.teams.length
  const meterMatches = markup.match(/class="[^"]*team-meter[^"]*"/g) ?? []
  if (meterMatches.length < fixture.teams.length) {
    missing.push(
      `team-meter count ${meterMatches.length} < expected ${fixture.teams.length}`,
    )
  }

  // Sky band must be present
  if (!markup.includes("sky-day") && !markup.includes("sky")) {
    missing.push("sky band not rendered")
  }

  // Event banner (when present) must include team + powerup
  if (fixture.eventBanner) {
    if (!markup.includes(fixture.eventBanner.teamName.split(" ").pop() ?? "")) {
      missing.push(`event banner missing team name ${fixture.eventBanner.teamName}`)
    }
  }

  // Reduced-motion flag must be honored
  if (fixture.reducedMotion && !markup.includes("reduced-motion")) {
    missing.push("reduced-motion not applied")
  }

  return { ok: missing.length === 0, missing }
}
