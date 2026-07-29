# Release Tags Baseline

**Date:** 2026-07-29
**Gitea Repository:** git.joelduss.xyz/agent-claude/Razzoozle
**GitHub Mirror:** github.com/joehomeskillet/Razzoozle

## Executive Summary

Razzoozle maintains 14 tags on Gitea and 15 tags on GitHub. Tags follow a mixed versioning scheme (some with `v` prefix, some without). **Critical finding:** Significant commit divergence exists between platforms on version tags (v1.2.0, v2.0.0, v3.0.0), and GitHub contains an additional tag (v1.0.0) not present on Gitea. This divergence indicates a mirror-sync issue that requires investigation.

---

## Complete Tag Inventory

### Gitea Tags (14 total)

Generated via: `git tag -l --format='%(refname:short) %(objectname:short) %(creatordate:short)'`

| Tag | Commit (short) | Date | Notes |
|-----|---------|------|-------|
| 0.1.0 | 8f73241f3 | 2025-09-28 | Oldest stable release |
| 1.0.0 | 91cc35656 | 2025-10-29 | First 1.x release |
| 1.0.1 | cf4ef8674 | 2025-12-06 | Patch release |
| 1.0.2 | be8300f77 | 2025-12-14 | Patch release |
| 1.1.0 | c40b16966 | 2026-01-31 | Minor release |
| 1.2.0 | d5f58d965 | 2026-03-14 | Minor release |
| 2.0.0 | 133e1cc21 | 2026-04-22 | Major release |
| 2.0.1 | ab4e9e8db | 2026-04-23 | Patch release |
| 2.0.2 | ba7317815 | 2026-04-29 | Patch release |
| 3.0.0 | f07a8ed0b | 2026-05-09 | Latest major release (non-prefixed) |
| v1.1.0 | 958bdfb5a | 2026-06-19 | `v`-prefixed 1.1.0 (duplicate-ish) |
| v1.2.0 | bdea31a0a | 2026-06-19 | `v`-prefixed 1.2.0 (duplicate-ish, DIVERGENT COMMIT) |
| v2.0.0 | 12eaace4e | 2026-07-09 | `v`-prefixed 2.0.0 (DIVERGENT COMMIT) |
| v3.0.0 | 7219bb535 | 2026-07-23 | Latest major release (`v`-prefixed, DIVERGENT COMMIT) |

---

### GitHub Tags (15 total)

Generated via: `gh api repos/joehomeskillet/Razzoozle/tags --paginate`

| Tag | Commit (short) | Notes |
|-----|---------|-------|
| 0.1.0 | 8f73241f | Matches Gitea (same commit) |
| 1.0.0 | 91cc3565 | Matches Gitea (same commit) |
| 1.0.1 | cf4ef867 | Matches Gitea (same commit) |
| 1.0.2 | be8300f7 | Matches Gitea (same commit) |
| 1.1.0 | c40b1696 | Matches Gitea (same commit) |
| 1.2.0 | d5f58d96 | Matches Gitea (same commit) |
| 2.0.0 | 133e1cc2 | Matches Gitea (same commit) |
| 2.0.1 | ab4e9e8d | Matches Gitea (same commit) |
| 2.0.2 | ba731781 | Matches Gitea (same commit) |
| 3.0.0 | f07a8ed0 | Matches Gitea (same commit) |
| v1.0.0 | 9090da63 | **NOT on Gitea — DIVERGENT** |
| v1.1.0 | 958bdfb5 | Matches Gitea (same commit) |
| v1.2.0 | 00614169 | **DIVERGENT from Gitea (bdea31a0a)** |
| v2.0.0 | 08a0bc43 | **DIVERGENT from Gitea (12eaace4e)** |
| v3.0.0 | 4aee879c | **DIVERGENT from Gitea (7219bb535)** |

---

## Divergence Analysis

### Non-Prefixed Tags (0.1.0–3.0.0)

**Status:** ✓ Synchronized  
All non-prefixed release tags match between Gitea and GitHub (same commit hashes). These appear to be the canonical releases and are properly mirrored.

### Prefixed Tags (v1.x, v2.x, v3.x)

**Status:** ✗ Divergent

#### v1.1.0
- **Gitea:** 958bdfb5a (2026-06-19)
- **GitHub:** 958bdfb5 (same commit, shortened)
- **Assessment:** ✓ Synchronized

#### v1.2.0
- **Gitea:** bdea31a0a (2026-06-19)
- **GitHub:** 00614169 (DIFFERENT)
- **Assessment:** ✗ **CRITICAL DIVERGENCE** — Different commit objects

#### v2.0.0
- **Gitea:** 12eaace4e (2026-07-09)
- **GitHub:** 08a0bc43 (DIFFERENT)
- **Assessment:** ✗ **CRITICAL DIVERGENCE** — Different commit objects

#### v3.0.0
- **Gitea:** 7219bb535 (2026-07-23)
- **GitHub:** 4aee879c (DIFFERENT)
- **Assessment:** ✗ **CRITICAL DIVERGENCE** — Different commit objects

### Duplicate Tag on GitHub Only

#### v1.0.0
- **Gitea:** Does not exist
- **GitHub:** 9090da63 (exists)
- **Assessment:** ✗ **Extra tag on GitHub** — No corresponding tag on Gitea with this name

---

## Root Cause Investigation

### Hypothesis 1: Mirror Filter Issue
The GitHub mirror uses `_ghmirror` filter to strip Gitea-specific files (.gitea/workflows, etc.). If this filter was applied retroactively to tags or if mirror sync was interrupted, tag commits could diverge.

**Evidence:** Non-prefixed tags sync perfectly; `v`-prefixed tags diverge. This suggests a later tagging strategy that was not properly mirrored.

### Hypothesis 2: GitHub-Native Tags
The divergent `v` tags and the orphan v1.0.0 may have been created directly on GitHub (not from Gitea), creating an out-of-band tag set.

**Evidence:**
- v1.1.0 on GitHub DOES match Gitea (argues against pure GitHub-native origin)
- v1.2.0, v2.0.0, v3.0.0 diverge at the commit level (argues for independent creation)

### Hypothesis 3: Rebase or Force-Push on Gitea
If the Gitea main branch was rebased or force-pushed after tags were created on GitHub, tag commits could become orphans or diverge (commit SHAs would change).

**Evidence:**
- Would explain why recent tags (v2.0.0 from 2026-07-09, v3.0.0 from 2026-07-23) are affected
- Older non-prefixed tags remain in sync, suggesting a point-in-time when divergence began

---

## Recommendations

1. **Do Not Delete Tags** (as per task instructions)
   - Tag deletion creates reflog-cleanup burden and may hide historical sync issues
   - Orphaned tags should remain visible for audit purposes

2. **Investigate Divergence Timeline**
   - Query commit ancestors for v1.2.0, v2.0.0, v3.0.0 on both platforms
   - Determine if GitHub tags point to reachable commits on Gitea (e.g., side branches, history depth difference)

3. **Document Mirror Sync Behavior**
   - Clarify whether _ghmirror filter should apply to tags (currently it appears to affect branches only)
   - Establish whether v-prefixed tags are intentional (separate namespace from non-prefixed releases)

4. **Audit v1.0.0 on GitHub**
   - Check if this tag was created manually on GitHub or via a separate workflow
   - If orphaned, consider it a mirror artifact (do not replicate to Gitea)

5. **Continuous Monitoring**
   - Add a health check script that compares tag checksums across platforms weekly
   - Alert on new divergence or orphaned tags

---

## Record Status

- **Collected:** 2026-07-29 19:30 UTC+2
- **Gitea Query:** `git tag -l --format=...` + Gitea API tags endpoint
- **GitHub Query:** `gh api repos/joehomeskillet/Razzoozle/tags --paginate`
- **Verification:** All 14 Gitea tags and 15 GitHub tags confirmed via native tooling
- **No Tags Deleted:** All findings are observational only

---

## Appendix: Full Commit Details

### Gitea (Long Form)

```
git tag -l --format='%(refname:short) %(objectname:short) %(creatordate:short)'

0.1.0 8f73241f3 2025-09-28
1.0.0 91cc35656 2025-10-29
1.0.1 cf4ef8674 2025-12-06
1.0.2 be8300f77 2025-12-14
1.1.0 c40b16966 2026-01-31
1.2.0 d5f58d965 2026-03-14
2.0.0 133e1cc21 2026-04-22
2.0.1 ab4e9e8db 2026-04-23
2.0.2 ba7317815 2026-04-29
3.0.0 f07a8ed0b 2026-05-09
v1.1.0 958bdfb5a 2026-06-19
v1.2.0 bdea31a0a 2026-06-19
v2.0.0 12eaace4e 2026-07-09
v3.0.0 7219bb535 2026-07-23
```

### GitHub (Long Form)

```
gh api repos/joehomeskillet/Razzoozle/tags --paginate | jq -r '.[] | "\(.name) \(.commit.sha[0:8])"'

0.1.0 8f73241f
1.0.0 91cc3565
1.0.1 cf4ef867
1.0.2 be8300f7
1.1.0 c40b1696
1.2.0 d5f58d96
2.0.0 133e1cc2
2.0.1 ab4e9e8d
2.0.2 ba731781
3.0.0 f07a8ed0
v1.0.0 9090da63
v1.1.0 958bdfb5
v1.2.0 00614169
v2.0.0 08a0bc43
v3.0.0 4aee879c
```
