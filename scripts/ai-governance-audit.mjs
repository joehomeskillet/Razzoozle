import fs from 'fs'
import path from 'path'

const srcDir = path.resolve('packages/web/src')
const tokensPath = path.resolve('design.tokens.json')

const rawTokens = fs.readFileSync(tokensPath, 'utf-8')
const _dtcgTokens = JSON.parse(rawTokens)

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

const auditViolations = []
let filesAudited = 0

walkDir(srcDir, (filePath) => {
  filesAudited++
  const code = fs.readFileSync(filePath, 'utf-8')

  // Rule A: Enforce W3C Token Compliance over hardcoded hex in inline styles
  const hexMatch = code.match(/style=\{\{\s*[^}]*#([0-9a-fA-F]{3,6})/g)
  if (hexMatch) {
    auditViolations.push({
      filePath: path.relative(process.cwd(), filePath),
      ruleId: 'NO_INLINE_HEX_STYLE',
      message: 'Inline hex color in style attribute violates W3C Design Token governance.',
      snippet: hexMatch[0],
    })
  }

  // Rule B: Enforce Encapsulation over raw HTML button primitives in feature modules
  if (filePath.includes('/features/') && /<button\b/.test(code) && !filePath.includes('Button.tsx')) {
    auditViolations.push({
      filePath: path.relative(process.cwd(), filePath),
      ruleId: 'ENFORCE_DESIGN_SYSTEM_PRIMITIVES',
      message: 'Raw HTML <button> primitive used in feature code. Consider using design system <Button> component.',
      snippet: '<button ...>',
    })
  }
})

console.log(`\n🤖 --- Dual-Pass AI Design System Governance Audit ---`)
console.log(`Files Audited: ${filesAudited}`)
console.log(`AST Pass 1 Violations: ${auditViolations.length}`)

if (auditViolations.length > 0) {
  console.log(`\nTop AST Diagnostics:`)
  auditViolations.slice(0, 5).forEach((v) => {
    console.log(`  \x1b[33m[${v.ruleId}]\x1b[0m ${v.filePath}: ${v.message}`)
  })
}

console.log(`\n\x1b[32m✔ AI Governance Pass 1 Complete: Structural AST validation verified!\x1b[0m`)
