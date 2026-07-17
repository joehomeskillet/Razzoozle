# 16 — Modularization Plan + Cross-Review + Decisions

**Date:** 2026-07-17 · Incremental waves, each independently testable/reviewable/reversible (no big-bang).

## Cross-review (Codex ↔ Grok — orthogonal, converge; my adjudication)

Both audits agree on the surface. Conflicts/cautions I adjudicated:

| # | Point | Grok | Codex | **Decision** |
|---|---|---|---|---|
| A | Focus formula (D7) | Input.tsx + ~8 files use border-only → outline | icon-button focus dup | **Accept.** Fix Input.tsx primitive (fixes all consumers) + the raw drift sites. Highest-value, zero visual regression. |
| B | **Radius unification** (rounded-lg→radius-theme) | wants 16px on primary surfaces | — | **Partial-accept, CAUTION.** Do NOT blanket-change Button/Input default radius — that recolors the whole app incl. game surfaces. Only: eliminate non-spec `rounded-md`/`rounded-xl` in the MANAGER (→ radius-theme or rounded-lg per D9), and set input/select fields to radius-theme. Button default stays; validate visually. Low priority. |
| C | Select primitive impl | native or Radix | native (simpler, no dep) | **Native `<select>` wrapper.** Brief: no new UI lib unless necessary. |
| D | Status tokens | hardcoded → `--status-*` | STATUS_COLOR_MAP const | **Accept.** Central StatusBadge using `--status-*` tokens (verified to exist). |
| E | Hook consolidation | — | `useCrudManager<T>` (6 hooks) | **Accept but LAST + test-guarded** (behavior risk). After primitives+buttons land. |
| F | New primitives | — | 5 new (Checkbox/Radio/Select/Date/Number) | **Accept.** Highest ROI, zero UI risk, file-disjoint. |

No High/Critical conflict. Both approve the phased plan.

## Waves (risk-ordered; each: WPs → gate → deploy → verify)

### Wave 1 — Primitive suite (LOW risk, HIGH ROI) — new files, file-disjoint
- WP-1a `components/Checkbox.tsx` · WP-1b `components/Radio.tsx` (+RadioGroup) · WP-1c `components/Select.tsx` (native) · WP-1d `components/DateInput.tsx` · WP-1e `components/NumberInput.tsx`
- WP-1f **fix `Input.tsx` focus formula** → D7 outline (also fixes all Input consumers)
- Each: token-bound (design.md), D7 focus, 44px, disabled/error states, unit test. Barrel `components/ui/index.ts` (or `components/`) export.
- Gate: `pnpm verify` + a render/behaviour test per primitive.

### Wave 2 — Adoption: buttons + focus-drift + status (LOW-MED)
- Migrate the 17 raw `<button>` → `Button size="icon" variant="ghost"` / action variants (exclude ListRow body + NavItem tab).
- Fix focus-drift sites (ConfigUsers close ×2, select :627, ConfigKlassen input, SelectableRow missing `outline-2`, ConsoleShell drawer).
- Central `StatusBadge` (`--status-*`); migrate BackendPanel/DisplayStatusCard hardcoded status colors.
- Gate: verify + browser-qa on ConsoleShell nav (critical path) + a config page.

### Wave 3 — Adoption: form-control migration (MED)
- Migrate raw inputs/selects → Wave-1 primitives (checkbox ×8, radio ×4, date ×4, number ×2, select ×6, text ×4). Per-domain WPs.
- Gate: verify + browser-qa per migrated page (form submit still works).

### Wave 4 — Composed/pattern adoption (MED)
- FilterPill adoption (ConfigCatalog/Submissions/QuizzList), ListRow adoption (QuizzList/StudentList), extend+adopt PageHeader, Badge non-users → chipBase, EmptyState non-users.
- Radius normalization (per Decision B). Gate: verify + design-validator + browser-qa.

### Wave 5 — Hook consolidation (MED, test-guarded)
- Extract `useCrudManager<T>`; refactor the 6 managers to thin wrappers. Behaviour-preserving.
- Gate: verify + existing manager functional/e2e tests green + browser-qa CRUD flows.

## Per-wave rules
File-disjoint WPs, free-pool-first, worktree isolation, orchestrator merges + gates. design.md is the constraint (tokens only, no hex, no glass, no backdrop-filter). `check-manager-tokens.sh` + `pnpm verify` + design-validator + browser-qa are the gates. Cross-vendor review before merge. No new dependency.

## Rollback
Each WP = isolated branch; primitives are additive (Wave 1 has zero migration risk). Migrations revert per-file.
