# Configuration

Runtime data lives in `config/` (git-ignored, seeded on first boot).

## Game settings — `config/game.json`
```jsonc
{
  "managerPassword": "PASSWORD", // CHANGE THIS — the default blocks manager access
  "teamMode": false,             // enable red/blue/green/yellow teams
  "lowLatencyMode": {            // opt-in; off = byte-identical to a normal build
    "enabled": false,
    "clockSync": true,
    "answerAck": true,
    "scoreboardBroadcastThrottleMs": 100
  }
}
```
Scoring is always **server-authoritative** (the server's receive timestamp, never client time).

## Quizzes — `config/quizz/*.json`
Build quizzes in the manager's editor (recommended) or as JSON files.
```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],   // 0-based indices; several = multi-select
      "time": 20,          // seconds to answer (5–120)
      "cooldown": 5,       // seconds before the answer is revealed (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

## Question types
- **choice** — single correct answer (`solutions: [i]`).
- **multiple-select** — several correct answers (`solutions: [i, j, …]`).
- **boolean** — true/false (`answers: ["True", "False"]`).
- **slider** — numeric guess (`min`, `max`, `correct`, `step`).
- **type-answer** — free-text, matched against accepted answers.

## AI provider
Configured in the manager **AI** tab (Off / local ComfyUI / cloud). API keys are stored server-side in `config/` and never sent to clients.
