# SDD #478: Results Export PNG/PDF

## 1. Overview
Generates high-resolution downloadable PNG summary cards and PDF reports of game results directly in the browser.

## 2. UI/UX Contract
- **Results Screen**: "Download Summary (PNG)" and "Download Report (PDF)" buttons in ActionFooter.
- **Render Engine**: Canvas-based html2canvas / jsPDF client exporter.

## 3. Verification Gate
- Vitest suite: `resultsExporter.test.ts` (6 tests).
