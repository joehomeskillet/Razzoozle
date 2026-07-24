import fs from 'fs'
import path from 'path'

// Parse CLI arguments
const args = process.argv.slice(2)
let name = ''
let type = 'panel'

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--name' || arg === '-n') {
    name = args[++i]
  } else if (arg === '--type' || arg === '-t') {
    type = args[++i] || 'panel'
  } else if (!arg.startsWith('-') && !name) {
    name = arg
  }
}

if (!name) {
  console.error('Usage: pnpm g:console <ComponentName> [--type panel|table|form]')
  process.exit(1)
}

// Sanitize component name (PascalCase)
const PascalName = name.charAt(0).toUpperCase() + name.slice(1)
const targetDir = path.resolve('packages/web/src/features/manager/components/console')
const compFile = path.join(targetDir, `${PascalName}.tsx`)
const testDir = path.join(targetDir, '__tests__')
const testFile = path.join(testDir, `${PascalName}.test.tsx`)

if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true })
}

// Generate TSX template based on design token contracts
const tsxContent = `import type { ReactNode } from "react"
import StatusBadge from "@/components/StatusBadge"

export interface ${PascalName}Props {
  title: string
  description?: string
  status?: "online" | "offline" | "pending"
  actions?: ReactNode
  children?: ReactNode
}

/**
 * ${PascalName} — 100% Design Token compliant Admin Console ${type} component.
 * Scaffolded automatically via \`pnpm g:console\`.
 */
export function ${PascalName}({
  title,
  description,
  status = "online",
  actions,
  children,
}: ${PascalName}Props) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-5 shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {status && <StatusBadge status={status} />}
          </div>
          {description && (
            <p className="text-sm text-ink-subtle">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      <div className="mt-4 text-sm text-ink-medium">
        {children || <p className="italic text-ink-faint">No content provided.</p>}
      </div>
    </section>
  )
}

export default ${PascalName}
`

// Generate Vitest test template
const testContent = `import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ${PascalName} } from "../${PascalName}"

describe("${PascalName}", () => {
  it("renders title and description with design token styling", () => {
    render(
      <${PascalName}
        title="Test Panel"
        description="Design token automated test description"
      />
    )

    expect(screen.getByText("Test Panel")).toBeDefined()
    expect(screen.getByText("Design token automated test description")).toBeDefined()
  })

  it("renders status badge cleanly", () => {
    render(<${PascalName} title="Active Node" status="online" />)
    expect(screen.getByText("online")).toBeDefined()
  })
})
`

fs.writeFileSync(compFile, tsxContent, 'utf-8')
fs.writeFileSync(testFile, testContent, 'utf-8')

console.log(`\x1b[32m✔ Scaffolded 100% token-compliant component:\x1b[0m ${compFile}`)
console.log(`\x1b[32m✔ Scaffolded Vitest test file:\x1b[0m ${testFile}`)
