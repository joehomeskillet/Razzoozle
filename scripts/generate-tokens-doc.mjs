import fs from 'fs'
import path from 'path'

const tokensPath = path.resolve('design.tokens.json')
const outputPath = path.resolve('docs/design/LIVING_DESIGN_SYSTEM.md')

if (!fs.existsSync(tokensPath)) {
  console.error('design.tokens.json not found!')
  process.exit(1)
}

const rawData = fs.readFileSync(tokensPath, 'utf-8')
const data = JSON.parse(rawData)

const toKebab = (str) =>
  str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_.]+/g, '-')
    .toLowerCase()

let markdown = `# Razzoozle Living Design System Specifications

> **Auto-generated living documentation.** Generated automatically from [\`design.tokens.json\`] (W3C DTCG Format) via \`pnpm tokens:doc\`. DO NOT EDIT DIRECTLY.

---

## Token Sets Overview

`

const metadata = data.$metadata || {}
const order = metadata.tokenSetOrder || Object.keys(data).filter((k) => !k.startsWith('$'))

for (const group of order) {
  const tokensObj = data[group]
  if (!tokensObj || typeof tokensObj !== 'object') continue

  markdown += `### Group: \`${group}\`\n\n`
  markdown += `| Token Name | CSS Custom Property | Value | Type | Description |\n`
  markdown += `|---|---|---|---|---|\n`

  for (const [key, token] of Object.entries(tokensObj)) {
    if (typeof token !== 'object' || !token.$value) continue

    const cssVar = `--${toKebab(group)}-${toKebab(key)}`
    const val = String(token.$value).replace(/\|/g, '\\|')
    const type = token.$type || 'string'
    const desc = (token.$description || '-').replace(/\|/g, '\\|')

    markdown += `| \`${group}.${key}\` | \`${cssVar}\` | \`${val}\` | \`${type}\` | ${desc} |\n`
  }

  markdown += `\n`
}

markdown += `---
*Last updated from W3C design.tokens.json on ${new Date().toISOString().split('T')[0]}.*
`

const outputDir = path.dirname(outputPath)
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

fs.writeFileSync(outputPath, markdown, 'utf-8')
console.log(`\x1b[32m✔ Living Design System documentation generated:\x1b[0m ${outputPath}`)
