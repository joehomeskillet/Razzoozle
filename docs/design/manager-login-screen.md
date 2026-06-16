# Design spec — Manager login screen that matches the manager console

**Slug:** `manager-login-screen` · **Route:** `/(auth)/manager` · **Date:** 2026-06-16

## Problem

The manager login (`/manager` → `/(auth)/manager`) currently renders a generic
white player-style card (`ManagerPassword.tsx`: bare `<Card max-w-80>` + one
password `<Input>` + `<Button>`). It is visually indistinguishable from the
player join card and carries **no manager identity**, so it does not feel like
the entrance to the manager console.

The manager console (`/manager/config`, via `ConsoleShell.tsx`) has a distinct
look the login should echo:
- Full-viewport **diagonal violet gradient** (`linear-gradient(135deg,
  var(--color-secondary), var(--color-primary))`) + black scrim.
- A floating frame: `rounded-2xl bg-gray-50 shadow-lg`.
- A branded **header band**: `bg-gradient-to-r from-[var(--accent-tint)] to-white`,
  `border-b border-gray-200`, holding brand + section title (gray-900 / gray-700).
- Entry motion: `initial {opacity:0, y:16}` → `animate {opacity:1, y:0}`,
  `transition {duration:0.32, ease:"easeOut"}`, gated on `useReducedMotion()`.

## Goal

Redesign **only** `packages/web/src/features/manager/components/ManagerPassword.tsx`
so the login panel reads as a sibling of the console: a small console-style
card with the accent-tinted header band, a lock/shield icon + "Manager" title,
and the password form below — sitting on the existing `Background` (which
already paints the violet gradient/themed wallpaper + the app logo above +
`LanguageSwitcher` top-right via the `(auth)` layout).

## What changes

### `ManagerPassword.tsx` (rewrite the markup, keep the contract)
- Keep the component contract **unchanged**: `Props { onSubmit: (password: string) => void }`,
  the `useState` password, `handleSubmit` (preventDefault → onSubmit), and the
  `useEvent(EVENTS.MANAGER.ERROR_MESSAGE, …)` toast. The page
  (`(auth)/manager/index.tsx`) and its socket auth logic are **NOT touched**.
- Replace the `<Card>` wrapper with a console-matching panel:
  - Outer: `motion.div` with the ConsoleShell entry motion above (reduced-motion
    gated → opacity-only). `className="z-10 w-full max-w-sm overflow-hidden
    rounded-2xl bg-gray-50 shadow-lg"`.
  - **Header band** (mirror ConsoleShell's header): `flex items-center gap-3
    border-b border-gray-200 px-5 py-4 bg-gradient-to-r from-[var(--accent-tint)]
    to-white`. Inside: an icon chip — a `size-10` rounded-xl tinted square
    (`bg-[var(--accent-tint)]` or `var(--color-primary)/10`) holding a lucide
    `Lock` (or `ShieldCheck`) icon in `text-[var(--color-primary)]` — then a
    text column: `t("manager:auth.title")` (gray-900, font-bold, text-lg) over
    `t("manager:auth.subtitle")` (gray-500, text-sm).
  - **Body**: `p-5` form. Keep the `sr-only` label
    (`t("manager:aria.passwordLabel")`). Reuse the shared `<Input>` (full width,
    `type=password`, `autoComplete="current-password"`, autoFocus,
    `placeholder={t("manager:passwordPlaceholder")}`). Reuse the shared
    `<Button>` (variant primary, `type=submit`, `className="mt-4 w-full"`,
    `t("common:submit")`).
- Imports: `motion`, `useReducedMotion` from `motion/react`; `Lock` from
  `lucide-react`; keep `Input`, `Button` (DROP the now-unused `Card` import).

### i18n — add two keys, fill ALL 6 locales (de/en/es/fr/it/zh)
Add under the `manager` namespace an `auth` object:
```jsonc
"auth": {
  "title": "…",      // "Manager" / identity headline
  "subtitle": "…"    // one short line, e.g. "Melde dich an, um das Spiel zu verwalten."
}
```
- **de** tone: warm, "du", **no exclamation marks** (brand rule). e.g.
  `title: "Manager"`, `subtitle: "Melde dich an, um dein Spiel zu verwalten."`
- Provide natural translations for en/es/fr/it/zh (not literal). Match each
  locale's existing tone. Do **not** disturb the existing `manager:auth.timeout`
  default-value usage in the page (no key needed there).

## Constraints / non-goals

- **Do NOT** touch: the `(auth)/manager/index.tsx` page, `(auth)/layout.tsx`,
  `Background.tsx`, the player login, the socket/auth flow, the console.
- The backdrop stays the shared `Background` (violet gradient/photo + logo). The
  plain-gradient-only backdrop for the manager route is an explicit **non-goal**
  (would touch the shared `(auth)` layout) — note it as a follow-up, don't do it.
- Reuse the shared `Input`/`Button` atoms — no new UI primitives, no new deps.
- TypeScript strict, no `any`. `motion/react` (not framer-motion). `@razzoozle/web/…` aliases.
- Gate: `pnpm -r run types && oxlint && pnpm --filter web run build`.
