# 21 — Visual Element Audit (rendered consistency, three-lane synthesis)

**Date:** 2026-07-17 · **Scope:** Manager console — does the *rendered* element
actually look identical for the same type, or does it only share a component?
**Base:** `d8562d39e` (live on rust.razzoozle.xyz) · **Method:** three
independent audit lanes + deterministic grep verification of every claim
against live class strings (audit prose is never trusted on its own —
[[feedback_convergent_hallucination_deterministic_check]]).

## Lanes run

| Lane | Agent | Focus | Result |
|---|---|---|---|
| Code-cause | Codex (GPT-5.6) | *why* the pixels diverge, file:line causes | done — ~85% healthy, drift = styling **choice**, not copy-paste dup |
| Visual-rule + matrix | Grok-4.5 | rendered element matrix + binding target rules + SDD §20/§21 draft | done — 78–85% consistent, radius + a few icon-size outliers |
| Rendered-geometry | browser (playwright, 3 of 5 viewports) | measured px + screenshots | **COMPLETED on retry** — 30 baseline shots (MD5-distinct) + `getComputedStyle` measurements; found 4 divergences the source lanes missed |

The rendered-geometry lane stalled once, then completed. It **earned its keep**:
measuring real DOM proved the source lanes *wrong* on forms (both called them
"COMPLIANT"; the browser measured `Input` ≠ `DateInput`). This is the whole
point of Task 5 — shared code ≠ shared render. Its measured findings are folded
into the verified table below (`VIS-STATUSBADGE`, `VIS-FORMFIELD`, `VIS-RAWINPUT`,
`VIS-ICONSIZE-MEASURED`). Screenshots at 1280×800 / 768×1024 / 390×844 across all
10 tabs are the `baseline/` evidence; 1536×960 + 1024×768 top up with the after-set.

## Convergent verdict

Both causal lanes independently land on **~85 % rendered consistency**. The
console's shared primitives (`Button`, `NavItem`, `ListRow`, `SectionCard`,
`Badge`/`StatusBadge`, `FilterPill`, `OverflowMenu`, form inputs) render
**uniform** height (44 px / `min-h-11`), D7 focus (100 %), token-bound color
(100 %), padding hierarchy, hover/active states, and icon placement. The
residual ~15 % is **isolated and low-impact**: radius-scale drift + a handful of
config-panel icon-size outliers.

Crucially: **no inline pill exactly replicates `chipBase`** (grep-verified) — the
"8 manual badges" are *bespoke-by-choice*, not duplicated. That reframes the
badge finding from "de-duplicate copy-paste" to "unify structure onto the
primitive's documented `className`-for-tone API."

## Verified finding table (grep-confirmed file:line, verdict adjudicated)

| ID | Site(s) | Rendered defect | Verdict |
|---|---|---|---|
| **VIS-RADIUS-CARD** | `ResultModal/index.tsx:38`, `submissions/SubmissionCard.tsx:91`, `submissions/SubmitLinkCard.tsx:18,46` | card/dialog uses `rounded-xl` (12 px) vs `SectionCard` `--radius-theme` (16 px) → same-type cards visibly differ | **FIX** → `rounded-[var(--radius-theme)]` (D9-mandated) |
| **VIS-RADIUS-COMPACT** | `console/SubGroup.tsx:17` (xl), `ConfigMedia/ConfigMedia.tsx:265` (xl toolbar), `ConfigMedia/MediaCard.tsx:76` (md), `theme/ThemeTemplatesCard.tsx:104` (md) | nested/compact containers outside the 2-level scale | **FIX** → `rounded-lg` (compact tier, concentric-correct when nested) |
| **VIS-OVERRIDE-INPUT** | `klassen/ConfigKlassen.tsx:119` | `rounded-xl` on an `<Input>` overrides the primitive's own `--radius-theme` | **FIX** → delete override (primitive owns radius) |
| **VIS-OVERRIDE-BUTTON** | `ResultModal/ResultModalTable.tsx:35` | `size="sm"` + `className="px-2 py-1 min-h-11 …"` re-heights/re-pads the primitive (sm `h-9` → forced 44 px) | **FIX** → `size="md"` (native 44 px, drop internal override) |
| **VIS-CHIP-RADIUS** | `ResultModalTable.tsx:91,102,119,126` | data-table chips `rounded-md` (6 px) outside the scale | **FIX** → `rounded-lg` (D9 "chips"); internally consistent set, low-risk 6→8 px |
| **VIS-BADGE-STRUCT** | `ConfigGameMode.tsx:298` (team), `submissions/QuestionPreview.tsx:91` (status-token pill), `DisplayStatusCard.tsx:142` (status pill), `klassen/ClassList.tsx:231` (meta/count pill) | bespoke pills with drifting padding/type (`px-3 py-1 text-sm` vs `px-2.5 py-0.5 text-xs`) instead of `Badge` structure | **FIX** → `<Badge className="<tone>">` (unify structure, preserve color) |
| **VIS-ICONSIZE** | `ConfigMedia` upload icons (size-5 vs size-4), `ai/TextProviderSection` (size-4/5), `DisplayControl`/`DisplayStatusCard` monitor icon (size-4 vs size-5) | same-context icons differ by one step | **ACCEPT (document)** — ~3 sites, context-justified, no primitive affected; canon in §20 for future |
| **VIS-STATUSBADGE** *(browser-measured)* | `components/StatusBadge.tsx` (Dev/BackendPanel) rendered `rounded-lg` 28px/14px/16px-icon vs the `chipBase` pill (rounded-full 20px/12px) used everywhere else — two status-badge impls, two looks | **FIX (Wave 1)** → StatusBadge base rebuilt on chipBase pill (`rounded-full px-2.5 py-0.5 text-xs gap-1.5`) |
| **VIS-RAWINPUT** *(browser-measured)* | `ConfigAchievements/BadgeRow.tsx:110,119` raw `<input>` — 34px, hardcoded gray `rgb(229,231,235)` not `--border-hairline`, local `inputCls` | **FIX (Wave 2)** → migrate to `Input variant="sm"` (Wave-3 miss); note: they *do* carry `aria-label` (browser overstated "no label") |
| **VIS-ICONSIZE-MEASURED** *(browser-measured)* | `schueler/StudentList.tsx:136,156` action icons render 12px (`size-3`) inside 44px buttons — smallest outlier vs the 20px row-action norm | **FIX (Wave 2)** → `size-4` (16px), safe bump; full 20px would crowd the compact add/remove control |
| **VIS-FORMFIELD** *(browser-measured)* | `Input.tsx` renders `rounded-lg`/`text-lg`/`p-2`/`border-2` (8px/18px) but `DateInput`/`NumberInput`/`Select` render `--radius-theme`/`px-4 py-3`/`border` (16px/16px) — same type, three primitives, different geometry; static lanes both wrongly called forms "COMPLIANT" | **DEFER (accepted-open)** — see NON-changes |

## Adjudicated NON-changes (recorded, not silently skipped)

- **Button base `rounded-lg` stays.** Codex VIS-RADIUS-1 wanted `--radius-theme`.
  Rejected: every `Button` already renders identical `rounded-lg` (the Task-5
  same-type goal is *met*); D9's "large buttons → radius-theme" reads as large
  button-*surfaces*, and the `lg` size is still a compact control. Changing it is
  an app-wide aesthetic change with **zero consistency payoff** and a real
  regression surface. Grok concurs ("OK per D9"). → keep uniform.
- **No `Badge` `tone` enum prop.** Badge already exposes `className` for tone by
  design ("callers layer color/tone on top — never redefine padding/radius/type").
  A `tone` enum = prop-soup abstraction the host rules forbid; the `className`
  path already unifies structure. → migrate to `<Badge className>`, no new prop.
- **NavItem count badge (`:100`) and ResultModalTable toggle-switch (`:48,54`)
  stay.** Not badges — a nav-internal tabular count and a `role=switch` control.
  Forcing `Badge` would break their distinct, correct semantics.
- **Slider tracks/thumbs, status *dots* (`size-2`), color swatch, active-dot,
  avatar touch-target, preview-stage (`token-ok`) stay.** `rounded-full` ≠ badge.
- **`useCrudManager` / gap-spacing standardization** — out of scope (documented
  in [[19-modularization-report]] as YAGNI / deferred).

## Sign-off

Matrix (§20) + Grok target rules + Codex causes + this cross-lane synthesis are
complete and mutually reconciled; the one lane conflict (Button radius) is
adjudicated above. **Approved to implement** the FIX rows as WP-A/B/C (§20 §5).
No code changed before this sign-off.
