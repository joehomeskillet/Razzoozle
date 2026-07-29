import fs from 'fs'
import path from 'path'

const isFix = process.argv.includes('--fix')
const srcDir = path.resolve('packages')

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return
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

let filesChecked = 0
let refactorTargetsFound = 0
let filesRefactored = 0

const startTime = Date.now()

walkDir(srcDir, (filePath) => {
  filesChecked++
  const code = fs.readFileSync(filePath, 'utf-8')

  // Check for deprecated token names across workspace packages
  if (code.includes("var(--accent-primary)")) {
    refactorTargetsFound++
    if (isFix) {
      const updatedCode = code.replace(/var\(--accent-primary\)/g, "var(--brand-primary)")
      fs.writeFileSync(filePath, updatedCode, 'utf-8')
      filesRefactored++
      console.log(`\x1b[32m✔ Refactored:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
    } else {
      console.log(`\x1b[33m⚠ Refactor Target:\x1b[0m ${path.relative(process.cwd(), filePath)}`)
    }
  }
})

const duration = Date.now() - startTime

console.log(`\n🔄 --- Token Deprecation Batch Replacer ---`)
console.log(`Workspace Files Scanned: ${filesChecked}`)
console.log(`Deprecated Tokens Found: ${refactorTargetsFound}`)
console.log(`Execution Time:          ${duration} ms`)

if (isFix) {
  console.log(`Files Updated:           ${filesRefactored}`)
} else if (refactorTargetsFound === 0) {
  console.log(`\x1b[32m✔ All workspace packages clean: no deprecated tokens detected!\x1b[0m`)
}
