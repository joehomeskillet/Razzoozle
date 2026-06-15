# Rahoot Backlog — Master Design + Implementation Plan

_Consolidated 2026-06-15 from multi-agent analysis (autoplay, centering, rewards judge-panel, bonus-scoring, markdown, content, solo-flow). Branch: `feat/manager-achievements-footer-parity`. Deploy = push `HEAD:main` + `source/scripts/deploy.sh` (CD timer stays stopped during work)._

## ✅ Deployed live this session
footer uniformity · solo-link button (Play tab) · B3/B7/B9 console polish · equal-size media cards + info dialog · play-screen spacing · **autoplay-after-pause fix + play-screen centering/edge-padding** (`93bc7e3`).

---

## Wave R — Rewards-screen unification + dismiss  _(the "2 Ebenen" / image)_  · risk: med
**Problem:** result screen draws rewards in 2 languages — bonus pills (3 different bg tokens) + a separate `AchievementPopup` overlay that is `pointer-events-none` (un-tappable, no dismiss).
**Design:** one `RewardStack` of identical `RewardRow` atoms (same `bg-black/40` surface, `--radius-theme`, ring, ~56px height; differ ONLY by a 4px left accent stripe + icon + trailing value/badge). Achievements become rows (retire the overlay → inline + tappable). Score pill stays as the anchor (retune radius only). Order: achievements first (highest tier), then streak, double, first-correct. Per-row auto-dismiss + swipe/tap/Esc close. Titles stay **white** (contrast fix — don't use `TIER_TEXT` silver=slate-900).
**Files:** NEW `RewardRow.tsx`, `RewardStack.tsx`; add `TIER_ACCENT` to `achievements.ts`; `Result.tsx` (retune pill radius, delete bonus-pill div 171-195, replace `<AchievementPopup>` 197-200 with `<RewardStack>`); retire `AchievementPopup.tsx`. Reuse `AchievementMedal`, `TIER_INDEX/LABEL`, existing chime/confetti side-effects.
**i18n:** `game:streak.streakTitle/streakValue`, `game:reward.dismiss` (×6 locales). **No server change.**

## Wave B — Achievement bonus points (scoring)  · risk: low
`common/achievements.ts`: `bonus:number` on `MergedAchievement` + `TIER_BONUS_DEFAULT` (UI only) + `BONUS_MAX=5000` + `clamp(override?.bonus ?? 0,…)` (default **0** → existing scoring tests stay green). `validators/achievements.ts`: `bonus` optional. `round-manager.ts`: `achievementBonus(id)` + 2nd-pass loop after detection (≈1077) adding bonus to `row.points/lastPoints`, re-sort by points, add `bonusPoints` to SHOW_RESULT. `status.ts`: `bonusPoints?:number`. `ConfigAchievements.tsx`: numeric input mirroring threshold. **i18n:** `manager:achievementsConfig.bonus/bonusHint`, `game:reward.bonusPoints`. Ties into Wave R (bonus shows in the reward rows).

## Wave S — Solo-flow redesign  _(the playthrough doc)_  · risk: med
`solo.tsx` (NameScreen glassmorphism, phase fly-in via AnimatePresence keyed on `currentIndex` NOT phase [keeps SoloAnswers mounted across answering→result], FinishedScreen hero count-up + medal pills + `/trophies` link), `SoloAnswers.tsx` (staggered answers, hover scale/glow, green/red glow + floating +points + chime + center confetti on result), `SoloLeaderboard.tsx` (medal gradients gold/silver/bronze, isMe pulse, pill CTAs). Extractions (reuse, no new lib): `AnimatedPoints.tsx` (lift from `Leaderboard.tsx:32-47`), `utils/confetti.ts` (`fireTierConfetti` + `fireCenterSalvo`, lifted from `Result.tsx:42-80`). Sounds map to existing SFX (correct→RESULTS/GOLD, wrong→BOUMP; ticking dropped — no asset). All animations gated on `useReducedMotion`. **Host stays as-is** (proven timed path). **i18n:** `game:solo.trophies/replay` (×6). Solo result has NO achievement data today → no collision with Wave R; the shared `utils/confetti.ts` is the bridge.

## Wave M — Markdown in question/answer text  · risk: low
Deps: `react-markdown@^9` + `remark-gfm@^4`. NEW `components/Markdown.tsx` (restricted inline: strong/em/del/a/code/br; NO headings/img/lists/blockquote; links new-tab+stopPropagation). Swap text nodes in `Question/Answers/SoloAnswers/Responses/ResultModalAnswers`; live preview under inputs in `QuestionEditorTitle/Answers` (/submit inherits). `vite.config` chunk + `package.json`. No data-model change (md rendered from existing string fields). Keep short accepted-answer chips plain.

## Wave C — Content (data-only)  · risk: low
Strip trailing `" – "` from quiz title in `config/quizz/sudhang-pe-htRQzMrm.json` + `config/state/registry.json` (in-flight game). `config/` is the live mounted volume → no rebuild needed. `q04.webp` "Welcome Clinci" baked-in typo → owner decision (regenerate via image pipeline vs leave).

---

## Recommended execution order
**C** (instant data fix) → **R + B** (rewards unify + bonus, together so bonus shows in the rows) → **S** (solo, reuses confetti util from R) → **M** (markdown, broad + deps). Each wave: implement (override) → gate (types+oxlint+web/socket tests+build) → adversarial review → commit → deploy → Playwright-verify.

## Open decisions (defaults in **bold**, override anytime)
- **Content title:** strip to "Südhang Personalfest 2027" — _or_ add a subtitle after the dash (your text)? **q04 image:** leave the typo for now.
- **Confetti:** light center salvo (~40 particles) per correct answer (not reserved for high-points). 
- **Bonus defaults:** bronze 50 / silver 100 / gold 200 / diamant 400; cap 5000; re-sort rank after bonus.
- **Rewards:** achievements-first order; per-tier dismiss timers (bonus 4s / gold 6s / diamant 7s, hover-paused).
- **Markdown:** keep `remark-gfm` (autolinks + strikethrough); implicit editor preview (no label → no extra i18n).
- **Solo→RewardRow unification:** follow-up WP (solo lacks achievement data today).
