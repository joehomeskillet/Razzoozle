# 20 — Visual Consistency Spec (rendered element matrix + binding rules)

**Date:** 2026-07-17 · **Companion audit:** [[21-visual-element-audit]] ·
**Governs:** manager console (`packages/web/src/features/manager`).
**Principle:** same-type elements must *render* identically (radius, padding,
height, type scale, icon size/position, content order, states) — sharing a
component is necessary, not sufficient. No page may override a primitive's
**internal** design values (radius/height/padding/color/icon-size) via
`className`/props/wrappers; only layout integration (margin, grid placement,
`flex-1`, `shrink-0`, width) is allowed.

## 1. Rendered element matrix (canonical geometry)

Derived from the live class strings (grep-verified) — for a token-bound system
these px are the rendered geometry. `COMPLIANT` = every instance already matches.

| Type | Primitive | Height | Radius | Padding | Icon | Order | State |
|---|---|---|---|---|---|---|---|
| Primary/secondary/ghost button | `Button` | 44 (md)/48 (lg)/36 (sm)/44² (icon) | `rounded-lg` (8) | px-4/px-6/px-3 | leading or centered, size-5 | icon→text | COMPLIANT |
| Nav item / tab | `NavItem` | 44 | `--radius-theme` | px-3 py-2.5 | leading size-5 | icon→label→count | COMPLIANT |
| List / table row | `ListRow` | 44 | `--radius-theme` | p-4 | actions size-5 | select→lead→title→actions | COMPLIANT |
| Section / admin card | `SectionCard` | content | `--radius-theme` | p-4 | chip size-5 in size-9 | chip→title→desc→actions | COMPLIANT |
| Nested sub-panel | `SubGroup` | content | **`rounded-lg`** (was xl) | p-3 | — | — | FIX (VIS-RADIUS-COMPACT) |
| Modal / dialog | Radix `Dialog` | ≤92vh | **`--radius-theme`** (was xl) | p-6 | — | title→body→footer | FIX (VIS-RADIUS-CARD) |
| Form input / date / number | `Input`/`DateInput`/`NumberInput` | 44 | `--radius-theme` | px-4 py-3 | — | — | COMPLIANT (no page override) |
| Badge / status chip | `Badge`/`StatusBadge` | inline | `rounded-full` | px-2.5 py-0.5 | leading size-3.5 | icon→text | COMPLIANT primitive; inline pills FIX |
| Filter pill | `FilterPill` | 44 | `rounded-full` | px-4 | — | label→count | COMPLIANT |
| Overflow menu item | `OverflowMenu` | 44 | `--radius-theme` | px-3 py-2 | leading size-5 | icon→label | COMPLIANT |
| Empty state | `EmptyState` | content | `--radius-theme` | px-6 py-10 | size-7 in size-14 | icon→headline→hint→action | COMPLIANT |

## 2. Binding radius rule (D9, 2 levels — the drift source)

design.md **D9**: primary surfaces (cards, dialogs, large button-surfaces) →
`rounded-[var(--radius-theme)]` (16 px); compact rows/chips/badges/nested panels
→ `rounded-lg` (8 px). **No `rounded-md`/`xl`/`2xl` in shipped manager code.**

- Cards/dialogs/inputs on `xl` (12 px) render *less* rounded than `SectionCard`
  (16 px) → the visible same-type break. Migrate → `--radius-theme`.
- Compact/nested containers on `xl`/`md` → `rounded-lg`. Nested inside a
  `--radius-theme` card, `rounded-lg` is the concentric-correct inner radius.
- **Button stays `rounded-lg` uniformly** (adjudicated — [[21-visual-element-audit]]).
- Escape hatch: a genuinely-justified off-scale radius carries an inline
  `/* token-ok: <reason> */` (e.g. image-scrim, preview-stage) and is exempt.

## 3. Badge structural rule

`Badge` owns padding/radius/type (`chipBase`); callers pass **only color/tone**
via `className`. A pill that needs a status/team/count color is
`<Badge className="<tone tokens>">`, never a hand-rolled `rounded-full px-… py-…
text-…` span. No `tone` enum prop — `className` is the tone channel by design.
Non-badge `rounded-full` (dots, switches, tracks, swatches, avatars) is exempt.

## 4. Icon placement & size canon (mostly already met)

- **Placement per type:** buttons → leading or centered (never trailing);
  nav → leading; card → fixed-left chip; row → left select/marker, right action
  cluster; badge → leading. No mixed placement within a type.
- **Size tiers:** `size-4` (16) inline/form-hint · `size-5` (20) nav/row/card/menu
  (dominant) · `size-3.5` (14) badge icon · `size-7` (28) empty-state. Same-context
  icons use one tier. The ~3 config-panel outliers (§21 VIS-ICONSIZE) are
  documented-accept; new code follows the tiers.
- **Content order per type:** frozen in §1 matrix; no reordering without a
  documented exception.

## 5. Implementation work-packages (one wave, file-disjoint)

**Split-Check:** WP-A → 1 worker (mechanical radius, ~9 files, all one-line
swaps, thematically identical → not split further). WP-B → 1 worker (single file
`ResultModalTable.tsx`, override + chips). WP-C → 1 worker (badge migration,
4 files, touches JSX structure). 3 parallel workers, disjoint file sets.

- **WP-A — radius D9 normalization.** `ResultModal/index.tsx:38`,
  `SubmissionCard.tsx:91`, `SubmitLinkCard.tsx:18,46`,
  `ConfigMedia.tsx:265`→`rounded-lg`, `SubGroup.tsx:17`→`rounded-lg`,
  `MediaCard.tsx:76`→`rounded-lg`, `ThemeTemplatesCard.tsx:104`→`rounded-lg`,
  `ConfigKlassen.tsx:119` delete `rounded-xl`. Card/dialog → `--radius-theme`.
  *Accept:* `pnpm verify` green; no `rounded-md/xl` left in these files (grep).
- **WP-B — `ResultModalTable.tsx` internal-override + chips.** `:35` →
  `size="md"`, drop `px-2 py-1 min-h-11`; chips `:91,102,119,126` `rounded-md`
  →`rounded-lg`. *Accept:* Button renders 44 px with no size override; toggle
  still works (role=switch); `pnpm verify` green.
- **WP-C — badge structural unification.** `ConfigGameMode.tsx:298` (team),
  `QuestionPreview.tsx:91` (status-token), `DisplayStatusCard.tsx:142` (status),
  `ClassList.tsx:231` (meta) → `<Badge className="<existing tone tokens>">`.
  *Accept:* every migrated pill renders `chipBase` structure (px-2.5 py-0.5
  text-xs rounded-full) with color preserved; `pnpm verify` green; visually
  reads correctly at 3 viewports (browser check).

Each worker in its own worktree; orchestrator merges + gates + deploys per wave.

## 6. Gate addition

Extend `scripts/check-manager-tokens.sh`:
```
# D9: no off-scale radius in shipped manager code (token-ok escape allowed)
grep -rn 'rounded-\(md\|xl\|2xl\)' packages/web/src/features/manager --include=*.tsx \
  | grep -v 'token-ok:' && fail "RADIUS_OFF_SCALE — use --radius-theme or rounded-lg (D9)"
```
Run in the wave gate alongside `pnpm verify` + `check-locales.sh`.

## 6b. Deferred — `Input` primitive form-field reconciliation (accepted-open)

The browser lane measured a genuine same-type divergence the source lanes missed:
`Input.tsx` renders `rounded-lg`/`text-lg`/`p-2`/`border-2` (8px, 18px) while its
sibling form primitives `DateInput`/`NumberInput`/`Select` render
`--radius-theme`/`px-4 py-3`/`border` (16px, 16px) — and design.md **D-Input**
spec is `px-4 py-3 rounded-[var(--radius-theme)] border` (the siblings follow it;
`Input` violates it).

**Not fixed in this task, on purpose.** `Input` has **48 callsites across game +
submission + quizz + manager**, including the player-facing join screen
(`features/game/components/join/Username.tsx`) and `SubmitPage`. Reconciling it to
spec is the right change but (a) exceeds Task-5's manager-console scope, (b) is
player-facing, and (c) carries a font-size judgment (`text-lg` may be a deliberate
big-tap-target choice for PIN/name entry, not specified by D-Input). It therefore
warrants its **own change with join/submit browser verification**, not an
autonomous restyle buried in a manager wave. **Recommendation:** a follow-up WP
aligns `Input` radius+padding+border to D-Input (keep or decide `text-lg`
separately), verified on join + submit + manager at all viewports.

## 7. Evidence

Before/after screenshots at 5 viewports (1536×960, 1280×800, 1024×768,
768×1024, 390×844) across all 10 manager tabs → `artifacts/manager-visual-consistency/`
(`baseline/` 30 shots survived the failed audit lane; top up + `target/` after
merge; `diff/` + `contact-sheets/` for the final report).
