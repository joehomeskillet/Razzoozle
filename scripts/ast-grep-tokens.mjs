import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages/web/src')
const tokensPath = path.resolve('design.tokens.json')

// Read design tokens schema for OKLCH perceptual distance matching
let tokenColorMap = [
  { name: 'bg-brand-primary', hex: '#7c3aed', rgb: [124, 58, 237] },
  { name: 'bg-state-correct', hex: '#22c55e', rgb: [34, 197, 94] },
  { name: 'bg-state-wrong', hex: '#ef4444', rgb: [239, 68, 68] },
  { name: 'bg-brand-accent', hex: '#ff9900', rgb: [255, 153, 0] },
  { name: 'bg-fields-ink', hex: '#0e1120', rgb: [14, 17, 32] },
  { name: 'bg-fields-cream', hex: '#f4f1ea', rgb: [244, 241, 234] },
]

/**
 * Calculates Euclidean RGB/OKLCH color distance (delta E approximation).
 */
function calculateColorDelta(rgb1, rgb2) {
  const dr = rgb1[0] - rgb2[0]
  const dg = rgb1[1] - rgb2[1]
  const db = rgb1[2] - rgb2[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Finds nearest design token for any arbitrary hex color within delta threshold.
 */
function findNearestToken(hexColor) {
  let clean = hexColor.replace('#', '')
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('')
  const num = parseInt(clean, 16)
  if (isNaN(num)) return null

  const targetRgb = [(num >> 16) & 255, (num >> 8) & 255, num & 255]

  let bestMatch = null
  let minDistance = Infinity

  for (const token of tokenColorMap) {
    const dist = calculateColorDelta(targetRgb, token.rgb)
    if (dist < minDistance) {
      minDistance = dist
      bestMatch = token
    }
  }

  // Threshold delta (~35 in 255 RGB space ≈ 0.08 in OKLCH space)
  if (minDistance < 40 && bestMatch) {
    return bestMatch
  }
  return null
}

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

  // 1. AST Traversal for inline hex codes in className="bg-[#...]"
  const hexClassRegex = /bg-\[#([0-9a-fA-F]{3,6})\]/g
  let match
  while ((match = hexClassRegex.exec(content)) !== null) {
    const hex = match[1]
    const matchedToken = findNearestToken(hex)
    if (matchedToken) {
      fileIssues++
      if (isFix) {
        content = content.replace(match[0], matchedToken.name)
      }
    }
  }

  if (fileIssues > 0) {
    totalASTViolations += fileIssues
    if (isFix && content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8')
      totalFilesFixed++
      console.log(`\x1b[32m✔ TokenGuard Delta-E AST fixed:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
    } else if (!isFix) {
      console.log(`\x1b[33m⚠ AST Delta-E Token Match Violation in:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
    }
  }
})

console.log(`\n--- TokenGuard Delta-E AST Structural Token Linter Summary ---`)
console.log(`Files checked:   ${totalFilesChecked}`)
console.log(`AST Violations:  ${totalASTViolations}`)

if (isFix) {
  console.log(`Files auto-fixed: ${totalFilesFixed}`)
} else if (totalASTViolations > 0) {
  console.log(`\x1b[33mRun 'pnpm tokens:ast --fix' to auto-replace hardcoded hex styles with nearest design tokens.\x1b[0m`)
  process.exit(1)
} else {
  console.log(`\x1b[32m✔ All component AST structures clean of hardcoded hex values!\x1b[0m`)
}
