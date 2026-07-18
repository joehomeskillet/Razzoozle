# 15 — Cross-Review (Grok ↔ Codex)

**Status:** complete · **Date:** 2026-07-18 · **Resolutions:** all items adjudicated in `16-adjudication-log.md` (§A).

> Supersedes an earlier fabricated draft that predated the actual cross-review and falsely reported "no conflicts". Both lanes returned **GO-WITH-CHANGES**; the changes are the conflicts below, all resolved in 16.

## Verdicts

- **Grok (UX) reviewing Codex (arch/sec):** GO-WITH-CHANGES. Architecture sound (security model hardened, wave sequencing respects deps). 3 UX conditions before Wave 1: lock transport error semantics; explicitly map the 5-stage UX to the 2-step socket join; finalize name/PIN entry order + error messaging.
- **Codex (arch/sec) reviewing Grok (UX):** GO-WITH-CHANGES. UX technically sound. 3 blocking clarifications: freeze the `emoji_pin` wire contract; resolve already-joined-badge privacy; replace 264-emoji arrow-cycling with a picker. No architectural red flags.

## Conflicts (→ resolution in 16)

| Raised by | Conflict | Resolution (16) |
|---|---|---|
| Grok | GameTransport error semantics not frozen (socket backoff vs REST timeout) → conditional renders defeat unification | A12 — GameTransport DEFERRED to Wave 3, evidence-gated; not on class-mode path |
| Grok | 5-stage modal UX ↔ two-step socket join not mapped; name-entry model (free-text vs roster picker vs hybrid) unclear | A1/A8 — socket 2-step; roster picker from `successRoom`; name+PIN on `player:login` |
| Grok | constant-error-shape degrades "keep name after wrong PIN" affordance | A7 — non-specific message + keep BOTH fields prefilled on retry |
| Grok | Wave 1–2 hot-file overlap risks stale modal tokens | A11 — Wave 1 styling isolated; modal-wide token unification → Wave 4 |
| Codex | `PlayerLogin` struct lacks `emoji_pin`; String vs array ambiguity + VS16 | A2 — `emojiPin: string[]`, verbatim from server set, client never splits |
| Codex | already-joined badge leaks who's playing | A5 — show `alreadyJoined` bool only (grey row); minimal data; server-enforced dedup is the real control |
| Codex | 264-emoji arrow-cycle unusable on mobile | A3 — searchable picker over `EMOJI_PIN_SET` by German label |
| Codex | roster must be delivered only post-join | A8 — roster only in `game:successRoom` |
| Codex | rate-limit incomplete (only per-assignment cited) | A9 — dual throttle (per-game 5/5min + reuse 3/60s), constant shape |

## Concerns → verification WPs (folded into Wave 1 acceptance)

- Grapheme split client↔server equivalence — resolved by A2 (client copies from canonical set, never splits); still add a round-trip test.
- Roster enumeration oracle — verify handler collapses all failures to one message (A7).
- Leaderboard row ≥44px — verify before reusing its geometry for `PlayerNameSelect` (WP 1C-3).
- No `studentId`/PIN in `tracing` — grep-proof at 1A acceptance.
- Socket disconnect mid-form — spec form-state persistence + restore on reconnect (16 §B client).
- Toggle label+control combined ≥44px — Wave 4 geometry (A11), verify hit-area.
