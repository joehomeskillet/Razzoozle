import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const args = process.argv.slice(2)
let inputFile = ''
let simulate = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' || args[i] === '-i') {
    inputFile = args[++i]
  } else if (args[i] === '--simulate' || args[i] === '-s') {
    simulate = true
  }
}

const tokensPath = path.resolve('design.tokens.json')

console.log(`\x1b[36m🎨 Figma / W3C DTCG Token Sync Engine\x1b[0m`)

if (inputFile && fs.existsSync(inputFile)) {
  console.log(`Reading Figma token payload from: ${inputFile}`)
  const rawInput = fs.readFileSync(inputFile, 'utf-8')
  try {
    const figmaTokens = JSON.parse(rawInput)
    console.log(`✔ Parsed ${Object.keys(figmaTokens).length} token sets from Figma payload.`)

    if (!simulate) {
      // Merge/update design.tokens.json
      const currentTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'))
      const updatedTokens = { ...currentTokens, ...figmaTokens }
      fs.writeFileSync(tokensPath, JSON.stringify(updatedTokens, null, 2), 'utf-8')
      console.log(`✔ Updated W3C master file: ${tokensPath}`)
    } else {
      console.log(`[Simulate Mode] Skipping disk write to design.tokens.json.`)
    }
  } catch (err) {
    console.error(`Error parsing Figma payload: ${err.message}`)
    process.exit(1)
  }
} else {
  console.log(`No external Figma payload provided. Running sync & build on existing W3C master tokens...`)
}

if (!simulate) {
  console.log(`\x1b[36m⚡ Rebuilding CSS, TypeScript types, and Living Design System spec...\x1b[0m`)
  execSync('node scripts/build-tokens.mjs', { stdio: 'inherit' })
  execSync('node scripts/lint-design-tokens.mjs --fix', { stdio: 'inherit' })
  console.log(`\x1b[32m✔ Bi-directional Figma / W3C Token Sync complete!\x1b[0m`)
}
