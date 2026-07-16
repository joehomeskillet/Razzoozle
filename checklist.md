# W2-5 Checklist: Farbe-nicht-allein (Color-Only Status Indicators)

## F15-Kandidaten (WCAG 1.4.1: Status kann nicht nur durch Farbe angezeigt werden)

### HIGH-Severity F15 Items

1. **CatalogQuestionForm.tsx:189** — Label selection buttons use opacity-50 only
   - Status: unselected state indicated ONLY by opacity
   - Fix: Add ring/border for selected state instead of opacity-only dimming
   - Severity: HIGH (affects form interaction clarity)

2. **ConfigTheme.tsx:84** — Preview button hover uses only opacity change
   - Status: hover state indicated only by `hover:bg-[var(--ink)]/5`
   - Fix: Add visible outline or icon to indicate clickability
   - Severity: HIGH (lacks hover affordance)

### AUDIT ITEMS (To verify already-compliant)

3. **DisplayControl.tsx:96-99** — Paired status button
   - Status: Changes color AND icon AND text when paired
   - Verdict: ✓ COMPLIANT (icon + text + color all change)
   - Note: hover:opacity-90/active:opacity-80 might be a secondary concern

4. **DisplayStatusCard.tsx:140-150** — Online/Stale badge
   - Status: Badge text explicitly says "online" or "stale"
   - Verdict: ✓ COMPLIANT (text label accompanies color)
   - Note: Button hover on line 91 uses opacity-only (secondary issue)

5. **ResultModal Check/X-Icons** — Marked as already-compliant in SDD
   - Status: Should have form (checkmark and X shapes are distinct)
   - Verdict: ✓ COMPLIANT (form conveys state, not color alone)

## EXCLUSIONS (per task description)

- QuizzList (W3-1)
- ConsoleShell (W3-2) 
- ClassList/StudentList (W5-1/2)
- Dialogs (W5-3/4)

---

## Implementation Plan

### Fixes Required (≤150 LOC total)

1. CatalogQuestionForm.tsx:189 — Replace opacity-50 with ring/border
   - Add aria-label to clarify selection state
   - Verify i18n if new visible strings added

2. ConfigTheme.tsx:84 — Add outline or icon affordance
   - Add visible outline on hover
   - Keep aria-label descriptive

### Testing & Verification

- [ ] types check: 0 errors
- [ ] tests: 148 passing
- [ ] design-validator: PASS
- [ ] check-manager-tokens.sh: PASS
- [ ] locale-check: PASS (no new hardcoded strings)

