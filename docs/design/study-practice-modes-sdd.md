# Study & Practice Modes — System Design Document

**Status:** Spec (awaiting implementation WPs)  
**Date:** 2026-07-24  
**Authors:** Razzoozle Design  

---

## 1. Overview

Two complementary learning modes extend Razzoozle's offline quiz infrastructure:

- **Study Mode:** Free-paced question review with explanations. No timer, no scoring, no leaderboard. Pure learning.
- **Practice Mode:** Timed training identical to Solo, but scores are **not persisted** to the leaderboard. Feedback only.

Both leverage the existing Solo infrastructure (`/api/quizz/:id/solo`, REST check-answer flow, store-based state machine) to minimize custom code and ship fast.

---

## 2. User Stories

### Study Mode

- **US1.1** — As a learner, I want to browse through quiz questions at my own pace, seeing each question and its correct answer, so I can study without pressure.
- **US1.2** — As a learner, I want to see an explanation (solution text / hint) for each question after I view the answer, so I understand the concept.
- **US1.3** — As a learner, I want to navigate freely (next/previous question, jump to a specific question) without time constraints, so I control my learning rhythm.

### Practice Mode

- **US2.1** — As a learner preparing for a real quiz, I want to do a full timed practice run that feels exactly like Solo, so I can test my readiness.
- **US2.2** — As a learner, I want to see my practice score and feedback (correct/wrong, points), but not have it saved to a public leaderboard, so I can practice risk-free.
- **US2.3** — As a learner, I want to know my practice result is temporary and won't count against my records.

---

## 3. Requirements

### 3.1 Study Mode

| # | Requirement | Acceptance Criteria |
|---|---|---|
| SR1.1 | Load quiz questions via `/api/quizz/:id/study` (new endpoint) | Endpoint returns `{subject, questions}` matching Solo schema |
| SR1.2 | Display current question + media (images, video) in a centered card layout | Question visible, media renders correctly |
| SR1.3 | Show the **correct answer(s)** for the current question | All answer options visible; correct one(s) highlighted/marked |
| SR1.4 | Display explanation text field (`explanation` from question JSON) | Explanation renders below answers; if missing, show "No explanation available" |
| SR1.5 | Provide **Previous / Next** buttons; disable when at boundaries | Buttons work; First Q disables Prev, Last Q disables Next |
| SR1.6 | Optional: **Jump-to-question** UI (pagination or list modal) | User can navigate to any question index directly |
| SR1.7 | Show progress indicator (e.g. "Question 3 of 15") | Progress updates as user navigates |
| SR1.8 | **No timer, no scoring, no achievements** | Timer not rendered; no points shown; no achievement toasts |
| SR1.9 | Header shows quiz subject + player name (optional entry screen) | Layout mirrors Solo's SoloShell structure |
| SR1.10 | Exit / Home button returns to quiz selection screen | Navigate back without confirmation |

### 3.2 Practice Mode

| # | Requirement | Acceptance Criteria |
|---|---|---|
| SR2.1 | Route: `/quizz/:id/practice` (new page) | Page loads, state machine initializes |
| SR2.2 | Identical UX to Solo mode (timer, answer UI, cooldown) | All existing Solo components reused (SoloAnswers, Question, SoloShell) |
| SR2.3 | When submitting final score, POST to `/api/quizz/:id/practice-score` (new endpoint, **not** `/solo-score`) | Server endpoint exists; accepts same payload as `/solo-score` |
| SR2.4 | Server ignores `/practice-score` payload; returns empty leaderboard | Response: `{leaderboard: []}` or `{message: "Practice score saved (not ranked)"}` |
| SR2.5 | Client displays final score + NO leaderboard | FinishedScreen variant shows score; leaderboard section hidden or shows "Not ranked" message |
| SR2.6 | After result, user can Replay or Exit (no Leaderboard link) | Button routing preserved; Leaderboard UI removed or disabled |
| SR2.7 | All scoring logic identical to Solo (points, achievements, accuracy) | Streak badges fire same as Solo; sharpshooter (server) computed same |
| SR2.8 | Explainer: UI shows "This is a practice run — your score won't be saved" | Toast, modal, or inline message visible after finish; clear language |

### 3.3 Non-Goals (Out of Scope)

- **Self-Paced / Homework Mode:** A separate assigned quiz feature with deadlines and teacher reporting. Not this WP.
- **Shared Study Sessions:** Multiplayer / real-time study. Solo architecture is offline by design.
- **Adaptive Difficulty in Study Mode:** All questions shown in original order; no branching.
- **Study-Mode Persistence:** No recording of which questions the learner reviewed.
- **Custom Timers for Practice:** Timer behavior unchanged from Solo.

---

## 4. Data Model Changes

### New Endpoints

#### `GET /api/quizz/:id/study`

**Response:**
```json
{
  "subject": "string",
  "questions": [
    {
      "question": "string",
      "type": "choice|multi|slider|...",
      "answers": [...],
      "explanation": "string (optional, new field)",
      "media": {...},
      "time": 0,
      "cooldown": 0
    }
  ]
}
```

**Notes:**
- Schema identical to `/api/quizz/:id/solo`, plus optional `explanation` field.
- All questions shipped; no shuffling (study order is canonical).
- Timer/cooldown fields present but ignored by client.

#### `POST /api/quizz/:id/practice-score`

**Request:** Identical to `/api/quizz/:id/solo-score`  
```json
{
  "playerName": "string",
  "score": "integer",
  "answers": [
    {
      "questionIndex": "integer",
      "answerId|answerIds|answerText": "...",
      "correct": "boolean (ignored)"
    }
  ],
  "assignmentId": "string (optional)"
}
```

**Response:**
```json
{
  "leaderboard": []
}
```

**Logic:**
- Server accepts and logs the submission (optional: to a practice-audit table).
- Server does **NOT** add to the leaderboard.
- Return empty leaderboard list.

### New Question Field

**`explanation`** (String, optional)

Added to all question types. Displayed in Study mode after the correct answer(s). If absent, Study UI shows placeholder text.

---

## 5. UI Flows

### 5.1 Study Mode Wireframe

```
┌─────────────────────────────────────────┐
│  Subject: Deutsch Grammatik             │
│  Question 3 of 15                       │
├─────────────────────────────────────────┤
│                                         │
│  What is the past tense of "gehen"?    │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ A) gehen                          │ │
│  │ B) ging        ✓ CORRECT          │ │
│  │ C) gegangen                       │ │
│  │ D) geht                           │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Explanation:                           │
│  ────────────────────────────────────   │
│  The German past tense (Präteritum) of │
│  "gehen" is "ging". "Gegangen" is the   │
│  past participle.                       │
│                                         │
├─────────────────────────────────────────┤
│  [← Previous]  [Jump to...] [Next →]    │
└─────────────────────────────────────────┘
```

### 5.2 Practice Mode Wireframe

(Identical to existing Solo mode end-to-end: name screen → questions with timer → result + badges → finished with score, but no leaderboard.)

Finished screen variant:
```
┌─────────────────────────────────────────┐
│  Practice Complete!                     │
│                                         │
│  Your Score: 1250 points                │
│  Questions: 15 / 15                     │
│                                         │
│  ⚠️  This is a practice run.             │
│      Your score won't be saved.         │
│                                         │
│  [Replay]  [Exit]                       │
└─────────────────────────────────────────┘
```

---

## 6. Implementation Strategy (WP Breakdown)

**Wave 0: Backend & API**

| WP | Title | Scope | Notes |
|---|---|---|---|
| WP-S-01 | Study endpoint (`/api/quizz/:id/study`) + `explanation` field | Rust HTTP route, schema update, DB migration (add explanation to questions table, default NULL) | Solo schema reuse |
| WP-S-02 | Practice endpoint (`/api/quizz/:id/practice-score`) | Rust HTTP route (accept, log, return empty leaderboard) | Simple pass-through, no ranking |

**Wave 1: Frontend (Reuse Solo)**

| WP | Title | Scope | Notes |
|---|---|---|---|
| WP-S-03 | Study Mode page (`/quizz/$id/study`) + StudyStore | New Zustand store (load, next/prev, set index), new Route file | ~200 LOC, mirrors solo.ts structure |
| WP-S-04 | Study UI components (StudyShell, AnswerDisplay, ExplanationCard, Navigation) | New TSX files + styling | ~300 LOC total |
| WP-S-05 | Practice Mode page (`/quizz/$id/practice`) + PracticeStore | Thin wrapper: fork solo.ts, replace `/solo-score` with `/practice-score` | ~50 LOC delta |
| WP-S-06 | FinishedScreen variant for Practice | Conditionally hide leaderboard; add "not ranked" message | ~30 LOC |

**Wave 2: Testing & Polish**

| WP | Title | Scope | Notes |
|---|---|---|---|
| WP-S-07 | E2E: Study mode navigation, explanation render, edge cases | Stagehand test suite | Full flow test |
| WP-S-08 | E2E: Practice mode (timer, scoring, no leaderboard) | Stagehand test suite | Verify redirect, empty leaderboard |

---

## 7. Open Decisions

| # | Decision | Impact | Recommendation |
|---|---|---|---|
| D1 | **Study entry point:** Does user select "Study" from quiz card (new button), or direct URL? | UX discovery | Recommend: Quiz card has "Study" + "Practice" + "Solo" buttons (3-way split) |
| D2 | **Explanation field:** Store in DB or inline in quiz JSON? | Schema design | Recommend: Add to `questions` table (DB), nullable, not shown to Solo players |
| D3 | **Practice branding:** Visible badge / warning, or subtle messaging? | Copy/UX clarity | Recommend: Inline "Practice Mode" label in header + finish-screen warning; no alarm/badge |
| D4 | **Study jumper UI:** Pagination dots, numbered list modal, or slider? | Component design | Recommend: Simple numbered list modal (<50 questions) or pagination dots if >50 |
| D5 | **Practice leaderboard fallback:** Show message or just empty? | Finish-screen copy | Recommend: "Your practice score won't be saved to the leaderboard" + [Replay] / [Solo] call-to-action |

---

## 8. Acceptance Criteria

- ✓ Both modes load quiz questions without error
- ✓ Study mode: timer hidden, no scoring UI, explanation visible
- ✓ Practice mode: identical to Solo except leaderboard empty
- ✓ New endpoints tested (curl, Stagehand)
- ✓ No regressions in existing Solo path
- ✓ Locale strings for new UI (Study, Practice, "Not ranked", explanations) ×6 langs
- ✓ E2E: Full play-through Study + Practice, UI matches wireframes

---

## 9. Design Rationale

### Why Reuse Solo?

- Solo is stateless, offline, REST-based. Study/Practice inherit this.
- Reduces custom state machine logic and transport logic.
- Proven UX for timed answer feedback, achievements, etc.

### Why Separate Endpoints?

- `/practice-score` acts as a "staging" layer: same payload format, but server ignores ranking.
- Allows future audit/analytics (practice submissions logged but not ranked).
- Clear separation prevents accidental leaderboard pollution.

### Why Not Combine Study + Practice?

- Study (async, self-paced) and Practice (timed, scored) have incompatible UX requirements.
- Keeping them separate reduces feature flag complexity.
- Each has a clear purpose: Study = learning, Practice = rehearsal.

---

## 10. Appendix: Glossary

| Term | Definition |
|---|---|
| Solo | Timed offline quiz with leaderboard ranking; existing feature |
| Study | Untimed, explanation-rich quiz review; new feature |
| Practice | Timed, scored training run; leaderboard hidden; new feature |
| Leaderboard | Ranked player scores; only in Solo and multiplayer modes |
| Explanation | Solution text field for each question; shown in Study mode |
| Self-Paced | Assigned quiz with deadline (future, not this WP) |

