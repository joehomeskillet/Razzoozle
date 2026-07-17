# 22 — Visual Consistency Report (Abschlussbericht)

**Date:** 2026-07-18 · **Base:** `d8562d39e` → **Head/Live:** `bcd00dd4d`
(health-gated CD `DEPLOY OK`, SPA rebuilt+synced, healthz 200) · **Result:** SHIPPED.
Companion: [[20-visual-consistency-spec]] (spec), [[21-visual-element-audit]] (audit).

## Goal

Make same-type manager elements *render* identically (radius/padding/height/type/
icon/order/state), not merely share a component; forbid `className` overrides of a
primitive's internal design values. Cream-only, no glass.

## Audit (3 lanes) → verdict

Codex (code-cause) + Grok (visual-rule matrix) + browser (measured geometry, 5-vp
plan / 3-vp captured). Verdict: **~85 % already consistent** post-modularization;
residual drift = radius-scale + a few internal-value overrides + (browser-only)
`Input` primitive divergence. Every finding grep-verified against live class
strings before action. The browser lane earned its keep — it measured
`Input` ≠ `DateInput` and the two-`StatusBadge` split that both source lanes had
called "COMPLIANT".

## Shipped (2 waves, each gated)

**Wave 1** (`2cde3a5ac`, local-coder-ov — cloud lanes were stalling on stream-idle):
- Radius → design.md **D9** 2-level: cards/dialog/input `rounded-xl`→`--radius-theme`
  (ResultModal, SubmissionCard, SubmitLinkCard, ConfigKlassen Input override dropped);
  nested/compact/chips `rounded-xl/md`→`rounded-lg` (SubGroup, ConfigMedia toolbar,
  MediaCard, ThemeTemplatesCard, ResultModalTable chips).
- `ResultModalTable` toggle: `size="sm"`+`min-h-11/px-2 py-1` internal override → `size="md"`.
- `components/StatusBadge` own `rounded-lg` base → `chipBase` pill — unifies the Dev/
  BackendPanel status badge with the rest of the Badge family.

**Wave 2** (`e5f00a55a`, grok-build + antigravity-agy):
- 4 bespoke inline pills → `Badge` primitive (ConfigGameMode team, ClassList owner,
  QuestionPreview accepted-answers, DisplayStatusCard status): structure via `chipBase`,
  color/layout via `className` (Badge uses `clsx`, so only non-conflicting utils passed).
- `ConfigAchievements/BadgeRow` raw `<input>` → `Input variant="sm"` (off-brand gray
  border → `--border-hairline`; Wave-3 miss).
- `ResultModalAnswers` image-thumb + empty-slot `rounded-md`→`rounded-lg`; `StudentList`
  add/remove icons `size-3`→`size-4`.

## Adjudicated non-changes (recorded, not skipped)

- **Button `rounded-lg` kept** — every Button already renders identically; D9
  "large buttons" = surfaces, not the `lg` size token. Changing = app-wide churn, zero
  consistency payoff. (Rejected Codex VIS-RADIUS-1; Grok concurs.)
- **No Badge `tone` enum** — `className` is the tone channel by design; a prop enum is
  the prop-soup the host rules forbid.
- **`Input` primitive reconciliation DEFERRED (accepted-open)** — `Input` (8px/18px) vs
  `DateInput`/`NumberInput`/`Select` (16px/16px) is a real divergence, but `Input` has 48
  callsites incl. the player-facing join/submit screens. Out of manager scope + needs
  game-context browser test → recommend a dedicated follow-up (spec §6b).

## Gate

`pnpm verify` GREEN at both waves — types pass, **171 tests** (150 web + 21 common),
oxlint only pre-existing warnings in untouched files. `check-manager-tokens.sh` = 0.
D9 radius gate: no unexplained off-scale radius remains in manager.

## Evidence (rendered before/after)

Captured live at 3 viewports × 10 manager tabs (1280×800, 768×1024, 390×844) →
`artifacts/manager-visual-consistency/{baseline,target,diff,contact-sheets}/`
(on-disk deliverable; gitignored — 18 MB of reproducible PNGs don't belong in the code repo).
Per-tab changed-pixel fraction (AE / total), desktop:

| Large (intended change) | AE% | Noise (unchanged, cross-session AA) | AE% |
|---|---|---|---|
| **dev** (StatusBadge→pill) | 14.4 | quizz | 2.1 |
| **achievements** (raw input→Input) | 8.3 | catalog | 2.2 |
| **media** (toolbar/card radius) | 3.1 (12 @768) | users | 2.5 |
| klassen/submissions/schueler/results (pill+radius) | 2.4–2.5 | — | — |

Visual spot-checks (contact sheets, before|after) confirmed the render:
- **dev** — status badge is now a compact `rounded-full` pill (was squared `rounded-lg`). ✓
- **achievements** — name/desc inputs now carry the `--border-hairline` brand border. ✓
- **quizz** (control, untouched) — pixel-identical; the 2 % is pure AA/font noise, **no regression**. ✓

Live console: only the 2 pre-existing 404s (`/theme/skeleton.js`, `/api/openapi.json`) — no new errors.

## Reviews

- Every worker diff hand-read by the orchestrator before merge (caught + excluded a
  `.wp-port` worktree artifact from all 3 branches).
- Cross-vendor endreview (sonnet-worker, read-only, in-harness — codex lane stalled on
  the session-wide cloud outage) of `d8562d39e..bcd00dd4d`: **VERDICT: CLEAN**. Checked all
  5 categories — no Badge `className`/`chipBase` conflicts, no dropped child/key/aria/
  handler on any `span→Badge` swap (`key={team}`/`key={a}` correctly moved), `input→Input`
  props all preserved + `inputCls` removed cleanly, all 13 radius edits map to the correct
  D9 bucket, `assignTriggerClass` import still resolves. Independently corroborated the
  `Input`-primitive deferral (ConfigKlassen search now uses `Input`'s shared `rounded-lg`
  default like ~30 other consumers → removes a stray override, not adds one).

## Verdict

**SHIPPED + live + rendered-verified.** The manager console's same-type elements now
render uniformly (radius D9 2-level, one Badge/StatusBadge pill family, no internal-value
overrides, form controls on the brand primitive). One cross-cutting divergence (`Input`
primitive) is documented for a tested follow-up.
