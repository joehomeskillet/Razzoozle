# Contract Freeze — fill-blank + matching (Wave 0)

**Branch:** `wp/sdd-fill-blank-matching`  
**Immutable for W1–W5.** Type changes after this commit invalidate downstream WPs.

## Wire types

| Field | Type | Used by |
|-------|------|---------|
| `type` | `"fill-blank"` \| `"matching"` | QUESTION_TYPES + Rust `QuestionType` |
| `segments` | `string[]` | fill-blank only; **len === slots.length + 1** |
| `slots` | `Slot[]` | fill-blank; `Slot = { options: string[], correctIndex: number }` |
| `leftItems` | `MatchingItem[]` | matching; `{ label, options, correctIndex }` |

## Answer transport

`answerText = JSON.stringify(selectedIndices: number[])`  
- fill-blank: one index per slot (same order as `slots`)  
- matching: one index per `leftItems` row  
- Index match: `selected[i] === correctIndex[i]` → +1 slot  
- Partial credit base: `correct_slots / total_slots` (0..1), then existing speed/streak/bonus in scoring.rs

## Defaults (editors, W3)

- fill-blank: 1 slot, `segments: ["", ""]`, `slots: [{ options: ["", ""], correctIndex: 0 }]`  
- matching: 1 pair, `leftItems: [{ label: "", options: ["", ""], correctIndex: 0 }]`

## i18n (skeleton already in W0)

- `quizz:type.fillBlank` / `fillBlankDesc` / `matching` / `matchingDesc`  
- `quizz:fillBlank.*` / `quizz:matching.*`  
- `game:fillBlank.*` / `game:matching.*`  
- `errors:quizz.fillBlankMinSlots` / `fillBlankSegmentCount` / `matchingMinItems` / `slotCorrectIndex`

## Non-goals

No freitext slots, no drag-drop matching, no nested `payload` union (flat Question fields, same as sequencing).
