import fs from 'fs'
import path from 'path'

const DESIGN_GOVERNANCE_BANNER = `
<!-- UNIFIED DESIGN SYSTEM GOVERNANCE RULES (AUTO-SYNCED) -->
# MANDATORY UI & DESIGN SYSTEM GOVERNANCE RULES FOR ALL AI AGENTS

1. **NEVER Hand-Write UI Components From Scratch**:
   - ALWAYS use CLI domain generators:
     - \`pnpm g:console <Name>\`   -> Scaffold Admin Console component + Vitest test
     - \`pnpm g:menu <Name>\`      -> Scaffold Admin Menu/Nav component + Vitest test
     - \`pnpm g:question <Name>\`  -> Scaffold Quiz/Answer Tile component + Vitest test
     - \`pnpm g:display <Name>\`   -> Scaffold Kiosk Display stage component + Vitest test
     - \`pnpm g:player <Name>\`    -> Scaffold Mobile Phone Client component + Vitest test

2. **NO Hardcoded Hex Colors or Arbitrary Unmapped Class Syntax**:
   - Hardcoded hex styles (e.g. \`#7c3aed\`, \`#22c55e\`) or unmapped arbitrary classes (e.g. \`bg-[#7c3aed]\`) are STRICTLY FORBIDDEN.
   - ALWAYS use mapped Tailwind v4 semantic utility classes (\`bg-brand-primary\`, \`bg-answer-1\`, \`bg-surface-2\`, \`text-ink\`, \`bg-status-online-bg\`).
   - For JS/Canvas/Confetti dynamic color references, ALWAYS use \`getThemeTokenCssVar()\` from \`@razzoozle/common/theme-tokens\`.

3. **Mandatory CLI Verification Chain**:
   - Before completing any UI task, ALWAYS run:
     - \`pnpm tokens:validate\`   (Check for unmapped arbitrary token usages)
     - \`pnpm tokens:hex-lint\`   (Regex-based hardcoded hex color validator)
     - \`pnpm tokens:wasm\`       (High-speed SWC/AST token codemod transformer)
     - \`pnpm tokens:morph\`      (Zero-runtime Tailwind v4 compiler)
     - \`pnpm tokens:neural\`     (Viewport auditor for 375px / 390px / 440px)
     - \`pnpm tokens:ai-audit\`   (Dual-Pass AI Design System Governance Audit)
     - \`pnpm tokens:daemon\`     (Autonomous monorepo refactoring daemon)
<!-- END UNIFIED DESIGN GOVERNANCE RULES -->
`

const agentFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.clinerules',
  'CODEX.md',
  '.windsurfrules',
  '.claude/state/GROK_START_PROMPT.md',
  '.claude/state/HANDOFF_grok.md',
]

let filesUpdated = 0

for (const relPath of agentFiles) {
  const fullPath = path.resolve(relPath)
  if (!fs.existsSync(fullPath)) continue

  let content = fs.readFileSync(fullPath, 'utf-8')

  if (content.includes('<!-- UNIFIED DESIGN SYSTEM GOVERNANCE RULES (AUTO-SYNCED) -->')) {
    content = content.replace(
      /<!-- UNIFIED DESIGN SYSTEM GOVERNANCE RULES \(AUTO-SYNCED\) -->[\s\S]*<!-- END UNIFIED DESIGN GOVERNANCE RULES -->/,
      DESIGN_GOVERNANCE_BANNER.trim()
    )
  } else {
    content = content + '\n\n' + DESIGN_GOVERNANCE_BANNER.trim()
  }

  fs.writeFileSync(fullPath, content, 'utf-8')
  filesUpdated++
  console.log(`\x1b[32m✔ Synced Unified Design Governance Rules to:\x1b[0m ${relPath}`)
}

console.log(`\n\x1b[36m⚡ Successfully synchronized design governance across ${filesUpdated} AI agent rule files!\x1b[0m`)
