# License Gate: Resolved (Spine-Free Decision)

**Status:** ✓ RESOLVED (2026-07-30)  
**Decision:** Animation implemented via procedural puppet-rig + GSAP tweening; no Spine Runtime  
**Impact:** WP-01 Architektur-Gate — now clear to proceed

---

## Summary

User decision (2026-07-30) resolved the licensing complexity: **No Spine Runtime.** Animation for Flower Battle presenter implemented via:

- **PixiJS 8** (rendering) — MIT license
- **GSAP** (tweening engine) — MIT Community License (free tier, unrestricted)
- **Procedural puppet-rig** (plant rigging) — procedural code, no external tools

This eliminates all external animation runtime licensing overhead and editor dependencies.

---

## License Status by Component

### PixiJS 8
- **License:** MIT
- **Runtime Fee:** $0
- **Distribution:** Include MIT notice (see `licenses/pixijs-license.txt`)
- **Status:** ✓ No blocker

### GSAP (Tweening Engine)
- **Library:** gsap (^3.12.0)
- **License:** Dual-licensed; **Community version: MIT** (free, unrestricted)
- **Runtime Fee:** $0 for MIT Community version
- **Paid Tier:** Not required (advanced plugins like DrawSVG available only in paid tier; not needed for plant animations)
- **Distribution:** Include MIT notice (link: https://github.com/greensock/GSAP)
- **Status:** ✓ No blocker

### Procedural Puppet-Rig
- **Implementation:** TypeScript/JavaScript code (Container hierarchy + tweens)
- **License:** Part of Razzoozle codebase
- **External Dependency:** None (procedural, no editor license needed)
- **Status:** ✓ No blocker

### Plant Art Assets
- **Ownership:** Razzoozle publisher / art team
- **License:** TBD by publisher
- **Requirement:** Original work or properly licensed source material
- **Status:** ✓ No blocker (organizational decision, not licensing gate)

---

## Removed Licensing Questions

The following questions from the original license gate are **no longer applicable** due to the Spine-free decision:

- ❌ **"Should we purchase a Spine Editor license?"** (Removed: no Spine)
- ❌ **"Do we have Spine Editor licensing acquired?"** (Removed: no Spine)
- ❌ **"Does the Spine Runtime License permit our use case?"** (Removed: no Spine Runtime)

---

## Artifact Inventory

### Third-Party Notices
- **File:** `THIRD_PARTY_NOTICES.md`
- **Content:** Master document listing PixiJS + GSAP + other open-source dependencies
- **Status:** ✓ Updated to reflect Spine-free decision

### Runtime Licenses
- **File:** `licenses/pixijs-license.txt` (MIT)
- **Status:** ✓ Present
- **File:** `licenses/gsap-license-note.txt` (MIT, link to community version)
- **Status:** ✓ Reference file

### No Spine License Files
- `licenses/spine-runtimes-license.txt` — **Not needed** (Spine-free)
- Status: ✓ Removed from distribution

---

## Distribution & Attribution

### Required in Production Build
1. ✓ PixiJS MIT notice (include in THIRD_PARTY_NOTICES.md)
2. ✓ GSAP MIT notice (include in THIRD_PARTY_NOTICES.md)
3. ✓ No Spine Runtime notice (not applicable)

### Visibility in App
- Place THIRD_PARTY_NOTICES.md in one of:
  - `/about/licenses` route
  - Game credits screen
  - Website footer

### CI/CD Gate
Add to `pnpm verify`:
```bash
# Check that THIRD_PARTY_NOTICES.md exists and is up-to-date
test -f THIRD_PARTY_NOTICES.md || exit 1
```

---

## Next Steps

1. ✓ ADR-013 updated to reflect procedural puppet + GSAP
2. ✓ Spine license files removed
3. ✓ THIRD_PARTY_NOTICES.md updated
4. ✓ Frontend stack inventory updated (GSAP ↔ Spine)
5. ✓ SDD addendum added (marking §2.1 + §6 superseded)
6. Commit all changes to WP-01 branch

---

## References

- **ADR-013:** `docs/adr/013-pixi-spine-hybrid-presenter.md` (procedural puppet + GSAP)
- **SDD:** `docs/design/flower-battle-pixi-spine-sdd.md` (addendum block notes license gate resolution)
- **GSAP License:** https://github.com/greensock/GSAP (MIT Community version)
- **PixiJS License:** https://github.com/pixijs/pixijs (MIT)

