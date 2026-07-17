# 01 — Current State (architecture, route inventory, surface maps)

## Architecture (relevant slice)

- Monorepo (pnpm): `packages/common` (types/validators/skeleton engine), `packages/web`
  (React + Vite + Tailwind v4 + TanStack Router), `packages/mcp`. Rust backend serves.
- **Manager console** = `packages/web/src/features/manager/components/console/ConsoleShell.tsx`
  (branded header band + left nav rail ≥920px / Radix Drawer < 920px) driven by
  `configurations/index.tsx` (`BUILTIN_TABS` registry + `ConsoleBody`).
- **Console is theme-independent** (`ConsoleShell.tsx:300-303`): `.console-shell` pins fixed
  brand tokens so an active player theme never recolors the admin console. It is already
  Cream-only. #86 (2026-07-16) shipped it token-clean + CI-hard (design.md §8·B).

## Route / section inventory (nav IA — D12 groups, `ConsoleShell.tsx` `NAV_GROUPS`)

| Group | Section key | Component | Gate |
|---|---|---|---|
| operations | play | ConfigSelectQuizz | — |
| operations | running | (running games) | — |
| operations | results | ConfigResults | — |
| operations | achievements | (achievements) | — |
| content | quizz | ConfigManageQuizz | — |
| content | catalog | ConfigCatalog | — |
| content | media | ConfigMedia | — |
| content | submissions | ConfigSubmissions | — |
| school | klassen | ConfigKlassen | klassenEnabled |
| school | schueler | ConfigSchueler | klassenEnabled |
| school | labels | (labels) | — |
| **system** | design | (theme cockpit) | — |
| **system** | gamemode | ConfigGameMode | — |
| **system** | ki | (AI) | — |
| **system** | satellite | (satellite) | — |
| **system** | users | ConfigUsers | admin |
| **system** | **profile** | **ConfigProfile** | — ← **relocates to header** |
| **system** | dev | ConfigDev | devMode |

> Full component paths + per-tab state (loading/empty/error) matrix: to be completed by
> the Codex primary audit (`10-codex-primary-review.md`). This pass changes only the
> `profile` section's *entry point*, not its content.

## Surface map A — Glass (deep removal target)

| # | Site | Nature | Action |
|---|---|---|---|
| A1 | `web/src/index.css:351-483` | 62-line `[data-theme-style="glass"]` block; **zero live consumers** | delete block |
| A2 | `common/validators/theme.ts:34` | `style: z.enum(["flat","glass"]).default("flat")` | remove field (zod strips old `style:"glass"` → back-compat) |
| A3 | `common/types/theme.ts:35` | `style:"flat"` in `DEFAULT_THEME` (type = `z.infer` of validator) | remove line |
| A4 | `web/src/features/theme/apply.ts:62-66` | `document.documentElement.dataset.themeStyle="flat"` | remove write once CSS gone |
| A5 | `common/skeleton-doc.ts` (78, 83, 199, 299) | emits `[data-theme-style]="${theme.style}"` + glass example/bullet | emit constant `flat`; drop glass docs |
| A6 | `common/skeleton-demo.ts` (293-321) | glass `.panel`/`.glass` treatment + `data-theme-style="${theme.style}"` | drop glass blocks; emit constant `flat` |
| A7 | game comments: `AnswerButton.tsx:18`, `RoundRecapCard.tsx:4`, `CircularTimer.tsx:25,49` | stale "glass" mentions in comments only | update comments |

**Non-targets (keep):** `.cb-blob { filter: blur(64px) }` (index.css:122 — animated background
blob, not glass); the per-game skeleton theme engine; `flat` as the sole emitted style.

**Back-compat contract:** old persisted `theme.json` with `style:"glass"` still parses
(zod strips the now-unknown key) and renders flat. Skeleton output keeps a stable
`data-theme-style="flat"` so any author CSS gating on `[data-theme-style="flat"]` survives.

## Surface map B — Profile relocation

| Site | Current | Target |
|---|---|---|
| `ConsoleShell.tsx:100` | `system` group `keys` includes `"profile"` | remove `"profile"` |
| `configurations/index.tsx` nav array | maps all `allowedTabs` incl. profile into rail | exclude `profile` from the nav array |
| `configurations/index.tsx` headerActions | `<LanguageSwitcher/>` + Logout `<Button>` | insert Profile `<Button variant="ghost" size="icon">` **before** Logout |
| BUILTIN_TABS | `profile` tab present | **keep** (component still resolves when active) |

Header Profile button requirements: `User`/`UserCircle` lucide icon, `title` + `aria-label`
= `manager:tabs.profile` ("Mein Profil", localized in all 6 locales), visible focus ring,
active state (`aria-current`) when the profile section is active, reuses the existing
`Button` primitive (identical height/icon size to Logout). Logout stays functionally untouched.
