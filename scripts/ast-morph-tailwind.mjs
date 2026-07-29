import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages/web/src')

const styleToTailwindMap = new Map([
  [/style=\{\{\s*backgroundColor:\s*["']#7c3aed["']\s*\}\}/g, 'className="bg-brand-primary"'],
  [/style=\{\{\s*color:\s*["']#7c3aed["']\s*\}\}/g, 'className="text-brand-primary"'],
  [/style=\{\{\s*backgroundColor:\s*["']#22c55e["']\s*\}\}/g, 'className="bg-state-correct"'],
  [/style=\{\{\s*color:\s*["']#22c55e["']\s*\}\}/g, 'className="text-state-correct"'],
  [/style=\{\{\s*backgroundColor:\s*["']#ef4444["']\s*\}\}/g, 'className="bg-state-wrong"'],
  [/style=\{\{\s*color:\s*["']#ef4444["']\s*\}\}/g, 'className="text-state-wrong"'],
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
let totalMorphedStyles = 0
let totalFilesFixed = 0

const startTime = Date.now()

walkDir(srcDir, (filePath) => {
  totalFilesChecked++
  const code = fs.readFileSync(filePath, 'utf-8')
  let modifiedCode = code
  let fileIssues = 0

  for (const [styleRegex, tailwindClass] of styleToTailwindMap.entries()) {
    const matches = code.match(styleRegex)
    if (matches) {
      fileIssues += matches.length
      if (isFix) {
        modifiedCode = modifiedCode.replace(styleRegex, tailwindClass)
      }
    }
  }

  if (fileIssues > 0) {
    totalMorphedStyles += fileIssues
    if (isFix && modifiedCode !== code) {
      fs.writeFileSync(filePath, modifiedCode, 'utf-8')
      totalFilesFixed++
      console.log(`\x1b[32m✔ Inline Style Converter Fixed:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} inline styles → Tailwind classes)`)
    } else if (!isFix) {
      console.log(`\x1b[33m⚠ Inline Style Violation:\x1b[0m ${path.relative(process.cwd(), filePath)} (${fileIssues} inline styles)`)
    }
  }
})

const duration = Date.now() - startTime

console.log(`\n⚡ --- Regex-Based Inline Style to Tailwind Converter Summary ---`)
console.log(`Files scanned:       ${totalFilesChecked}`)
console.log(`Inline styles found: ${totalMorphedStyles}`)
console.log(`Execution Time:      ${duration} ms`)

if (isFix) {
  console.log(`Files auto-fixed:    ${totalFilesFixed}`)
} else if (totalMorphedStyles > 0) {
  console.log(`\x1b[33mRun 'pnpm tokens:morph --fix' to convert inline style objects to Tailwind v4 classes.\x1b[0m`)
  process.exit(1)
} else {
  console.log(`\x1b[32m✔ All components use Tailwind classes (100% compliant).\x1b[0m`)
}
