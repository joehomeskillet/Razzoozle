# SDD #481: Document Content Extractor PDF/PowerPoint

## 1. Overview
Parses uploaded PDF and PowerPoint (.pptx) documents to automatically extract text slide content and generate quiz questions via AI.

## 2. Architecture & Data Structures
- **Extractor Pipeline**: Sandboxed client/server parser -> Text Chunking -> AI Question Generator -> Draft Review UI.

## 3. UI/UX Contract
- **AI Creator**: File upload dropzone -> Slide selection preview -> "Generate Quiz" button -> Draft editor approval.

## 4. Verification Gate
- Vitest suite: `documentExtractor.test.ts` (6 tests).
