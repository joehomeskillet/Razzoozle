# 06 — Implementation Plan (work-packages)

All WPs run in isolated git worktrees off `main`; orchestrator merges after gates +
cross-vendor review. Wave 1 is file-disjoint → parallel.

## Wave 1 (parallel)

### WP-A — theme `style` field removal (end-to-end) · quality lane
- **Files:** `common/validators/theme.ts`, `common/types/theme.ts` (DEFAULT_THEME),
  `web/features/theme/apply.ts`, `common/skeleton-doc.ts`, `common/skeleton-demo.ts`
- **Why single WP:** one semantic change — remove the `style` field from the theme
  contract. `Theme = z.infer<validator>`, so validator/type/apply/skeleton are coupled
  through the type; splitting creates a tsc-broken intermediate.
- **Changes:** drop `style` from validator enum + `DEFAULT_THEME`; remove the
  `dataset.themeStyle` write in `apply.ts`; in the skeleton engine, emit a **constant**
  `data-theme-style="flat"` (no `theme.style` read) and delete the glass `.panel`/`.glass`
  treatment blocks + glass doc bullet/example.
- **Back-compat:** old `theme.json` with `style:"glass"` still parses (zod strips unknown
  key) → renders flat. Skeleton keeps stable `[data-theme-style="flat"]` for author CSS.
- **Acceptance:** `pnpm --filter @razzoozle/common build` + web typecheck green; grep for
  `theme.style` / `data-theme-style="glass"` / `z.enum(["flat","glass"])` returns nothing
  in `src`; a theme.json fixture with `style:"glass"` parses without error and yields flat.
- **Tests:** add/extend a validator unit test asserting old `style:"glass"` input parses
  (field dropped). **Lane:** codex-gpt5 (contract-sensitive) + arch review. **Effort:** medium.

### WP-B — delete dead glass CSS · free/CSS lane
- **Files:** `web/src/index.css` (delete `[data-theme-style="glass"]` block ~351-483 +
  `@supports`/reduced-motion glass fallbacks; keep `.cb-blob`).
- **Acceptance:** no `data-theme-style="glass"` / `.glass-1/2/3` / `.glass-interactive`
  rules remain in `index.css`; `pnpm build:web` succeeds; visual diff of manager + a live
  game unchanged (glass never rendered). **Lane:** css-bugfixer / or-coder-free. **Effort:** low.

### WP-C — profile → header relocation · quality lane
- **Files:** `web/features/manager/components/configurations/index.tsx`,
  `web/features/manager/components/console/ConsoleShell.tsx`
- **Changes:** exclude `profile` from the nav array; add Profile `<Button variant="ghost"
  size="icon">` in `headerActions` immediately before Logout (icon + localized
  title/aria-label from `manager:tabs.profile`, `aria-current` when active); remove
  `"profile"` from `ConsoleShell` `system` `NAV_GROUPS` keys. BUILTIN_TABS keeps `profile`
  so the component still resolves when selected.
- **Acceptance:** `profile` absent from left nav (rail + drawer) at ≥920px and <920px;
  header shows Profile then Logout; clicking Profile opens ConfigProfile; Logout unchanged;
  keyboard-reachable, visible focus, `aria-label` present. **Lane:** codex-gpt5 / grok-build.
  **Effort:** medium.

### WP-D — stale glass comments · trivial lane
- **Files:** `AnswerButton.tsx`, `RoundRecapCard.tsx`, `CircularTimer.tsx` (comment text only).
- **Acceptance:** comments no longer describe a glass theme; no code change. **Lane:**
  local-quickfix. **Effort:** low. *(May fold into WP-B's worker.)*

## Split-Check
- WP-A → unteilbar (single-field removal across the `z.infer` chain; contract-sensitive → quality lane + typecheck loop)
- WP-B → 1 file (index.css)
- WP-C → profile relocation, 2 coupled files, one logical change (untrennbar)
- WP-D → trivial comments → local-quickfix
- Wave has 4 parallel workers ✓ (≥3)

## Wave 2 (conditional)
Only if the Codex/Grok audit surfaces a concrete **High/Medium** duplication or token gap
worth fixing (adjudicated in `12-adjudication-log.md`). No speculative dup work (YAGNI;
#86 already consolidated).

## Gates (per WP + integration)
`pnpm verify` · `bash scripts/check-manager-tokens.sh` (if touched) · targeted browser
before/after on header (profile move) · cross-vendor diff review (Codex + Grok) before merge.

## Rollback
Each WP is an isolated branch; revert = drop the branch pre-merge or `git revert` the merge
commit. Theme-contract change (WP-A) is additive-safe (field removal only); rollback restores
the enum with no data migration needed.
