# CLAUDE.md — Rahoot Developer Guide & Implementation Plan

## 1. RTK (Rust Token Killer) Commands

All development commands should be executed with the `rtk` prefix to optimize token usage (Claude Code automatically rewrites these).

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
rtk --version         # Verify RTK version
```

## 2. Build & Development Commands

Execute these from `source/` folder:
```bash
pnpm dev              # Start both frontend and backend dev servers
pnpm dev:web          # Start web client dev server
pnpm dev:socket       # Start socket backend dev server
pnpm build            # Build all packages
pnpm verify           # Run typecheck, linting, and tests
pnpm test             # Run test suites
pnpm format:fix       # Format code with Prettier
```

---

## 3. Implementation Plan: Gamification & Achievements Master Plan

This plan outlines the achievements catalog, files to edit, and expected animations/sounds.

### Task 1: Extend Types & Database models
- [ ] In [types/game/index.ts](file:///workspace/rahoot/source/packages/common/src/types/game/index.ts):
  - Add `achievements?: string[]` and `teamId?: string` to `Player`.

### Task 2: Calculate Achievements on Server
- [ ] In `showResults()` in [round-manager.ts](file:///workspace/rahoot/source/packages/socket/src/services/game/round-manager.ts):
  - Track achievements for each player during answer processing.
  - Implement calculations for:
    - **Bronze**: `first_correct` (first correct answer in the game), `participation` (answered all questions), `lucky_guess` (correct in the last 5% of cooldown).
    - **Silver**: `speed_demon` (time < 1s), `streak_3` (streak equals 3), `sharpshooter` (slider accuracy > 95%), `climber` (moved up 3+ spots compared to `oldLeaderboard`).
    - **Gold**: `first_responder` (first correct answer in the current round), `streak_5` (streak equals 5), `underdog` (beat someone who was >2000 points ahead), `perfect_round` (streak equals 5).
    - **Diamant**: `streak_10` (streak equals 10), `speedy_gonzales` (time < 0.4s), `perfect_game` (100% correct answers).

### Task 3: Client Collection & Trophy Room
- [ ] In [Result.tsx](file:///workspace/rahoot/source/packages/web/src/features/game/components/states/Result.tsx):
  - Intercept the `achievements` payload.
  - Save unlocked achievement badges to `localStorage` under `rahoot_achievements` in a key-count map.
- [ ] Create a "Trophy Gallery" component to show collected achievements in `/workspace/rahoot/source/packages/web/src/pages/` or the home screen.

### Task 4: Team Mode
- [ ] Allow team selection (Red, Blue, Green, Yellow) in [Room.tsx](file:///workspace/rahoot/source/packages/web/src/features/game/components/states/Room.tsx).
- [ ] In [round-manager.ts](file:///workspace/rahoot/source/packages/socket/src/services/game/round-manager.ts), group scoring by `teamId` and calculate team-level standings.
- [ ] Create a `TeamLeaderboard.tsx` component to render team ranks.

### Task 5: Solo Play via Share-Link
- [ ] Add client-driven page route `/quizz/$id/solo` in `source/packages/web/src/pages/` for solo play.
- [ ] Add endpoints:
  - `GET /api/quizz/:id/solo` (questions without solutions)
  - `POST /api/quizz/:id/check-answer` (verify answers)
  - `POST /api/quizz/:id/solo-score` (persists score to `config/solo-results/:quizzId.json`)

### Task 6: Visuals, Transitions & Sounds
- [ ] Use `framer-motion` for spring transitions on achievement popups and moving leaderboard items.
- [ ] Integrate `canvas-confetti` to trigger visual explosions (two-sided stream for Diamant tier).
- [ ] Add custom sound chimes for Bronze, Silver, Gold, and Diamant tiers in [Result.tsx](file:///workspace/rahoot/source/packages/web/src/features/game/components/states/Result.tsx) using the `use-sound` library.
