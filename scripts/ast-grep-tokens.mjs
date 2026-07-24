import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages/web/src')

// Map raw hex values to token utility classes / CSS variables
const hexToTokenMap = [
  { hex: /#7c3aed/gi, classTo: 'bg-brand-primary', varTo: 'var(--brand-primary)' },
  { hex: /#22c55e/gi, classTo: 'bg-state-correct', varTo: 'var(--state-correct)' },
  { hex: /#ef4444/gi, classTo: 'bg-state-wrong', varTo: 'var(--state-wrong)' },
  { hex: /#eab308/gi, classTo: 'bg-brand-accent', varTo: 'var(--brand-accent)' },
  { hex: /#0e1120/gi, classTo: 'bg-fields-ink', varTo: 'var(--fields-ink)' },
  { hex: /#f4f1ea/gi, classTo: 'bg-fields-cream', varTo: 'var(--fields-cream)' },
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
let totalASTViolations = 0
let totalFilesFixed = 0

walkDir(srcDir, (filePath) => {
  totalFilesChecked++
  let content = fs.readFileSync(filePath, 'utf-8')
  let original = content
  let fileIssues = 0

  // 1. Check arbitrary hex in className="... bg-[#7c3aed] ..."
  const arbitraryHexRegex = /className=(?:["'`])([^"'`]*)(?:["'`])/g
  let match
  while ((match = arbitraryHexRegex.exec(content)) !== null) {
    const classAttr = match[1]
    for (const { hex, classTo } of hexToTokenMap) {
      if (hex.test(classAttr)) {
        fileIssues++
      }
    }
  }

  // 2. Check inline style objects like style={{ backgroundColor: '#7c3aed' }}
  const inlineStyleRegex = /style=\{\{\s*([^}]+)\s*\}\}/g
  while ((match = inlineStyleRegex.exec(content)) !== null) {
    const styleObj = match[1]
    for (const { hex } of hexToTokenMap) {
      if (hex.test(styleObj)) {
        fileIssues++
      }
    }
  }

  if (fileIssues > 0) {
    totalASTViolations += fileIssues
    if (isFix) {
      // Auto-replace inline hex patterns
      for (const { hex, varTo } of hexToTokenMap) {
        content = content.replace(new RegExp(`'${hex.source}'`, 'gi'), `'${varTo}'`)
        content = content.replace(new RegExp(`"${hex.source}"`, 'gi'), `"${varTo}"`)
      }
      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8')
        totalFilesFixed++
        console.log(`\x1b[32m✔ Auto-fixed AST inline style tokens in:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
      }
    } else {
      console.log(`\x1b[33m⚠ AST Inline Hex Violation in:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} hardcoded hex attributes)`)
    }
  }
})

console.log(`\n--- AST Structural Token Linter Summary ---`)
console.log(`Files checked:   ${totalFilesChecked}`)
console.log(`AST Violations:  ${totalASTViolations}`)

if (isFix) {
  console.log(`Files auto-fixed: ${totalFilesFixed}`)
} else if (totalASTViolations > 0) {
  console.log(`\x1b[33mRun 'pnpm tokens:ast --fix' to auto-replace hardcoded hex styles with semantic token variables.\x1b[0m`)
  process.exit(1)
} else {
  console.log(`\x1b[32m✔ All component AST structures clean of hardcoded hex values!\x1b[0m`)
}
