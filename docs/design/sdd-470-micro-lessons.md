# SDD #470: Micro-Lessons Fragetyp

## 1. Overview
Combines short instructional content (video, audio, formatted rich text slides) with immediate inline check-for-understanding questions.

## 2. Architecture & Data Structures
- **Question Type**: `"micro-lesson"`
- **Options Payload**: `slides: Array<{ type: 'text'|'video'|'image'; content: string; checkQuestion?: Question }>`

## 3. UI/UX Contract
- **Player / Display Interface**: Carousel slide viewer with progress bar, next/back navigation controls, and embedded quiz tiles.
- **Design Tokens**: Standard surface tokens `bg-surface-1`, `bg-surface-2`, `text-ink`.

## 4. Socket Protocol
- Host controls slide progression in Live mode (`manager:nextLessonSlide`).
- Self-paced mode allows independent slide navigation.

## 5. Verification Gate
- Vitest suite: `MicroLessonViewer.test.tsx` (6 tests).
- Token compliance: `pnpm tokens:validate` clean.
