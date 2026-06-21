# Host Integration Contract (v1)

How an external host (e.g. the Razzoozle **Desktop** app, which serves
`@razzoozle/web` + `@razzoozle/socket` and reaches remote phones through the
standalone relay gateway) integrates with the game **without DOM-patching**.

Everything here is **additive and opt-in**. With none of these signals set, the
standalone web build (`razzoozle:3011`) behaves **exactly** as before — same
join URL, same QR, same lobby. This is the no-regression guarantee; it is frozen
by `packages/web/src/features/game/utils/joinUrl.test.ts`.

> **NON-GOAL:** the relay/rendezvous gateway stays a separate, standalone server
> (`razzloo-gateway`). The game knows nothing about relay/TLS/routing — it only
> learns to mirror an opaque join-base and expose its PIN machine-readably.

## 1. Player-facing join base

The lobby URL and the join QR are built by `buildJoinUrl()`, whose base is
resolved by `resolveJoinBase()` with this **precedence** (first hit wins):

1. `window.__RAZZ_HOST?.joinBase` — the canonical, versioned host object.
2. `window.__RAZZ_JOIN_BASE` — legacy global (kept so existing desktop injects
   work unchanged).
3. `document` root `[data-join-base]` attribute — no-JS / declarative fallback.
4. `window.location.origin` — the standalone default (unchanged behavior).

```ts
window.__RAZZ_HOST = { version: 1, joinBase: "https://play.razzoozle.xyz" }
// or, legacy:           window.__RAZZ_JOIN_BASE = "https://play.razzoozle.xyz"
// or, declarative:      <div id="root" data-join-base="https://play.razzoozle.xyz">
```

**Validation / security.** An *override* candidate is accepted only if it parses
as an absolute URL whose protocol is `https:`, or whose host is loopback /
private (so LAN/dev hosting keeps working). It is normalized to its **origin**
(scheme + host + port; any path/query/hash is stripped). Anything else
(`javascript:`, `ftp:`, garbage, a public `http:` origin) is ignored and the
resolver falls through. The fallback `window.location.origin` is **never**
restricted — that is today's behavior. The game never navigates to the base; it
only embeds it in a QR/string, so there is no open-redirect surface.

**Kills (desktop):** the `patchLobby` lobby-URL/QR rewrite, the `qr:make` IPC,
and the dead `__RAZZ_JOIN_BASE` inject (now live).

## 2. Machine-readable room PIN

The lobby PIN element carries stable attributes — no scraping needed:

```html
<p data-invite-code="123456" data-join-url="https://play.razzoozle.xyz?pin=123456"> 123456 </p>
```

**Kills (desktop):** the "largest alphanumeric `<p>`" scraping heuristic.

## 3. Branding

Use the existing theme path — **do not** DOM-patch the wordmark. Set
`theme.logo` (host config / manager `setTheme`) to a uploaded asset under
`/theme/...` or `/media/...`; the lobby renders `<img src={theme.logo}>`
natively, else falls back to the `<h1>` title.

Note: `theme.logo` is an `assetRef` (path only — no `data:` URI, no inline SVG)
and the upload pipeline accepts raster only (`png`/`jpeg`/`webp`). Inline-SVG /
`appTitleHtml` injection is intentionally **not** supported (stored-XSS). A
vector wordmark must be delivered as a rasterized asset or placed at
`/theme/*.svg` out of band.

**Kills (desktop):** the `<h1>` wordmark DOM patch.

## Not in v1

- `?name=` / username auto-skip — rejected as a public query param (name
  spoofing) and as default `localStorage` (shared-device leak). If ever needed,
  only host-gated and opt-in.
- Active lifecycle CustomEvents (`razzoozle:ready|room|teardown`) — deferred
  until a host actually needs them; the `data-*` + window object cover the
  current workarounds.

## Versioning

`window.__RAZZ_HOST.version` is the contract version (currently `1`). Bump it on
breaking changes so a host can detect capability and fall back gracefully.
