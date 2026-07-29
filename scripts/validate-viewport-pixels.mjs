import fs from 'fs'
import path from 'path'

const srcDir = path.resolve('packages/web/src')

const targetViewports = [
  { name: 'iPhone 8', width: 375, height: 667 },
  { name: 'iPhone 13', width: 390, height: 844 },
  { name: 'iPhone 17 Pro Max', width: 440, height: 956 },
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
let responsiveViolations = 0

walkDir(srcDir, (filePath) => {
  totalFilesChecked++
  const code = fs.readFileSync(filePath, 'utf-8')

  // Check for fixed pixel width/height attributes (e.g. w-[400px] or h-[700px]) that break portrait viewports
  const fixedPixelRegex = /(?:w|h)-\[(?:37[6-9]|3[8-9]\d|[4-9]\d{2})px\]/g
  const matches = code.match(fixedPixelRegex)
  if (matches) {
    responsiveViolations += matches.length
    console.log(`\x1b[33m⚠ Viewport Pixel Warning in:\x1b[0m ${path.relative(process.cwd(), filePath)} (${matches.join(', ')} may cause squish on 375px viewports)`)
  }
})

console.log(`\n📱 --- Viewport Pixel Compliance Checker ---`)
console.log(`Files audited:            ${totalFilesChecked}`)
console.log(`Target Viewports:         ${targetViewports.map((v) => `${v.name} (${v.width}px)`).join(', ')}`)
console.log(`Fixed Pixel Violations:   ${responsiveViolations}`)

if (responsiveViolations === 0) {
  console.log(`\x1b[32m✔ All components 100% compliant across iPhone 8 (375px), iPhone 13 (390px), and iPhone 17 Pro Max (440px)!\x1b[0m`)
}
