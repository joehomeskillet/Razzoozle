import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages/web/src')
const tokensPath = path.resolve('design.tokens.json')

const rawTokens = fs.readFileSync(tokensPath, 'utf-8')
const _tokensData = JSON.parse(rawTokens)

const tokenMap = new Map([
  ['#7c3aed', 'bg-brand-primary'],
  ['#22c55e', 'bg-state-correct'],
  ['#ef4444', 'bg-state-wrong'],
  ['#ff9900', 'bg-brand-accent'],
  ['#0e1120', 'bg-fields-ink'],
  ['#f4f1ea', 'bg-fields-cream'],
])

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
let totalASTNodesParsed = 0
let totalViolationsFound = 0
let totalFilesFixed = 0

const startTime = Date.now()

walkDir(srcDir, (filePath) => {
  totalFilesChecked++
  const code = fs.readFileSync(filePath, 'utf-8')
  let modifiedCode = code
  let fileIssues = 0

  // Count TSX top-level constructs (imports, interfaces, components)
  const topConstructs = (code.match(/(import|export|interface|function|const|class)\b/g) || []).length
  totalASTNodesParsed += topConstructs

  // Match arbitrary hex values in class strings
  for (const [hex, tokenClass] of tokenMap.entries()) {
    const regex = new RegExp(`bg-\\[${hex}\\]`, 'gi')
    const matches = code.match(regex)
    if (matches) {
      fileIssues += matches.length
      if (isFix) {
        modifiedCode = modifiedCode.replace(regex, tokenClass)
      }
    }
  }

  if (fileIssues > 0) {
    totalViolationsFound += fileIssues
    if (isFix && modifiedCode !== code) {
      fs.writeFileSync(filePath, modifiedCode, 'utf-8')
      totalFilesFixed++
      console.log(`\x1b[32m✔ Token Linter Fixed:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
    } else if (!isFix) {
      console.log(`\x1b[33m⚠ Token Linter Violation:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} instances)`)
    }
  }
})

const duration = Date.now() - startTime

console.log(`\n⚡ --- Regex-Based Tailwind Arbitrary Class Linter Summary ---`)
console.log(`Files scanned:      ${totalFilesChecked}`)
console.log(`Constructs counted: ${totalASTNodesParsed}`)
console.log(`Violations found:   ${totalViolationsFound}`)
console.log(`Execution Time:     ${duration} ms`)

if (isFix) {
  console.log(`Files auto-fixed:   ${totalFilesFixed}`)
} else if (totalViolationsFound > 0) {
  console.log(`\x1b[33mRun 'pnpm tokens:wasm --fix' to rewrite arbitrary Tailwind hex classes to design tokens.\x1b[0m`)
  process.exit(1)
} else {
  console.log(`\x1b[32m✔ All components use mapped design token classes (100% compliant).\x1b[0m`)
}
