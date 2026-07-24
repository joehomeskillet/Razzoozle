import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages/web/src')

// Mappings from arbitrary [var(--...)] syntax to clean Tailwind v4 token utilities
const tokenReplacements = [
  { from: /bg-\[var\(--status-online-bg\)\]/g, to: 'bg-status-online-bg' },
  { from: /text-\[var\(--status-online-text\)\]/g, to: 'text-status-online-text' },
  { from: /bg-\[var\(--status-offline-bg\)\]/g, to: 'bg-status-offline-bg' },
  { from: /text-\[var\(--status-offline-text\)\]/g, to: 'text-status-offline-text' },
  { from: /bg-\[var\(--status-pending-bg\)\]/g, to: 'bg-status-pending-bg' },
  { from: /text-\[var\(--status-pending-text\)\]/g, to: 'text-status-pending-text' },
  { from: /bg-\[var\(--answer-1\)\]/g, to: 'bg-answer-1' },
  { from: /bg-\[var\(--answer-2\)\]/g, to: 'bg-answer-2' },
  { from: /bg-\[var\(--answer-3\)\]/g, to: 'bg-answer-3' },
  { from: /bg-\[var\(--answer-4\)\]/g, to: 'bg-answer-4' },
  { from: /text-\[var\(--answer-text\)\]/g, to: 'text-answer-text' },
  { from: /text-\[var\(--accent-contrast\)\]/g, to: 'text-accent-contrast' },
  { from: /bg-\[var\(--accent-tint\)\]/g, to: 'bg-accent-tint' },
  { from: /bg-\[var\(--color-field-cream\)\]/g, to: 'bg-color-field-cream' },
  { from: /text-\[var\(--color-field-ink\)\]/g, to: 'text-color-field-ink' },
]

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '__tests__') {
        walkDir(filePath, callback)
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      callback(filePath)
    }
  }
}

let totalFilesChecked = 0
let totalIssuesFound = 0
let totalFilesFixed = 0

walkDir(srcDir, (filePath) => {
  totalFilesChecked++
  let content = fs.readFileSync(filePath, 'utf-8')
  let original = content
  let fileIssues = 0

  for (const { from, to } of tokenReplacements) {
    const matches = content.match(from)
    if (matches) {
      fileIssues += matches.length
      if (isFix) {
        content = content.replace(from, to)
      }
    }
  }

  if (fileIssues > 0) {
    totalIssuesFound += fileIssues
    if (isFix && content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8')
      totalFilesFixed++
      console.log(`\x1b[32m✔ Auto-fixed design tokens in:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} tokens simplified)`)
    } else if (!isFix) {
      console.log(`\x1b[33m⚠ Unmapped arbitrary token usage in:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} instances)`)
    }
  }
})

console.log(`\n--- Design Tokens Linter Summary ---`)
console.log(`Files checked: ${totalFilesChecked}`)
console.log(`Issues found:  ${totalIssuesFound}`)

if (isFix) {
  console.log(`Files auto-fixed: ${totalFilesFixed}`)
} else if (totalIssuesFound > 0) {
  console.log(`\x1b[33mRun 'pnpm tokens:fix' to auto-replace arbitrary var() classes with mapped Tailwind v4 token utilities.\x1b[0m`)
} else {
  console.log(`\x1b[32m✔ All component design tokens clean and compliant!\x1b[0m`)
}

if (!isFix && totalIssuesFound > 0) {
  // Exit with non-zero code in validate mode if issues exist
  process.exit(1)
}
