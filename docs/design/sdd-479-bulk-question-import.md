# SDD #479: Bulk Question Import CSV/Excel

## 1. Overview
Allows quiz creators to bulk import question sets from CSV or Excel (.xlsx) files using a standardized template.

## 2. Architecture & Data Structures
- **Parser**: Client-side PapaParse (CSV) and SheetJS (XLSX) parser transforming table rows to `Question[]` objects.

## 3. UI/UX Contract
- **Quizz Editor**: "Import Questions" modal with drag-and-drop file zone, template download link, and field mapping preview table.

## 4. Verification Gate
- Vitest suite: `bulkQuestionParser.test.ts` (6 tests).
