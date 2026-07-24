import fs from 'fs'
import path from 'path'

// Parse CLI arguments
const args = process.argv.slice(2)
let name = ''
let domain = 'console'

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--name' || arg === '-n') {
    name = args[++i]
  } else if (arg === '--domain' || arg === '-d' || arg === '--type' || arg === '-t') {
    domain = (args[++i] || 'console').toLowerCase()
  } else if (!arg.startsWith('-') && !name) {
    name = arg
  }
}

if (!name) {
  console.error('Usage: pnpm g:component <Name> [--domain console|question|display|player]')
  console.error('Shortcuts: pnpm g:console <Name>, pnpm g:question <Name>, pnpm g:display <Name>, pnpm g:player <Name>')
  process.exit(1)
}

const PascalName = name.charAt(0).toUpperCase() + name.slice(1)

const domainConfig = {
  console: {
    dir: 'packages/web/src/features/manager/components/console',
    template: `import type { ReactNode } from "react"
import StatusBadge from "@/components/StatusBadge"

export interface ${PascalName}Props {
  title: string
  description?: string
  status?: "online" | "offline" | "pending"
  actions?: ReactNode
  children?: ReactNode
}

/**
 * ${PascalName} — 100% Token-compliant Admin Console component.
 * Scaffolded via \`pnpm g:console ${PascalName}\`.
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
`,
    test: `import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ${PascalName} } from "../${PascalName}"

describe("${PascalName} (Console)", () => {
  it("renders title and status badge with token styling", () => {
    render(<${PascalName} title="Admin Panel" status="online" />)
    expect(screen.getByText("Admin Panel")).toBeDefined()
    expect(screen.getByText("online")).toBeDefined()
  })
})
`
  },

  question: {
    dir: 'packages/web/src/features/game/components/answers',
    template: `import type { ReactNode } from "react"

export interface ${PascalName}Props {
  label: string
  index?: 0 | 1 | 2 | 3
  isCorrect?: boolean
  isRevealed?: boolean
  onSelect?: () => void
}

/**
 * ${PascalName} — 100% Token-compliant Question/Answer Tile component.
 * Scaffolded via \`pnpm g:question ${PascalName}\`.
 */
export function ${PascalName}({
  label,
  index = 0,
  isCorrect,
  isRevealed = false,
  onSelect,
}: ${PascalName}Props) {
  const answerColorClasses = [
    "bg-answer-1",
    "bg-answer-2",
    "bg-answer-3",
    "bg-answer-4",
  ]
  const bgClass = isRevealed
    ? isCorrect
      ? "bg-state-correct text-white"
      : "bg-state-wrong text-white"
    : \`\${answerColorClasses[index]} text-answer-text\`

  return (
    <button
      type="button"
      onClick={onSelect}
      className={\`flex min-h-16 w-full items-center justify-between rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-5 py-4 font-bold transition-transform active:scale-[0.98] \${bgClass}\`}
    >
      <span className="text-lg">{label}</span>
    </button>
  )
}

export default ${PascalName}
`,
    test: `import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ${PascalName} } from "../${PascalName}"

describe("${PascalName} (Question/Answer)", () => {
  it("renders answer label cleanly with theme tokens", () => {
    render(<${PascalName} label="Sample Answer Option" index={0} />)
    expect(screen.getByText("Sample Answer Option")).toBeDefined()
  })
})
`
  },

  display: {
    dir: 'packages/web/src/features/game/components/display',
    template: `import type { ReactNode } from "react"

export interface ${PascalName}Props {
  title: string
  subtitle?: string
  children?: ReactNode
}

/**
 * ${PascalName} — Kiosk Beamer/TV Display component (fullscreen 16:9 stage).
 * Scaffolded via \`pnpm g:display ${PascalName}\`.
 */
export function ${PascalName}({ title, subtitle, children }: ${PascalName}Props) {
  return (
    <div className="display-stage flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-[6vh] font-extrabold tracking-tight text-ink">{title}</h1>
      {subtitle && (
        <p className="mt-4 text-[3vh] font-medium text-ink-subtle">{subtitle}</p>
      )}
      <div className="mt-8 w-full max-w-4xl">{children}</div>
    </div>
  )
}

export default ${PascalName}
`,
    test: `import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ${PascalName} } from "../${PascalName}"

describe("${PascalName} (Display/Kiosk)", () => {
  it("renders kiosk stage presentation title", () => {
    render(<${PascalName} title="Beamer Stage Title" />)
    expect(screen.getByText("Beamer Stage Title")).toBeDefined()
  })
})
`
  },

  player: {
    dir: 'packages/web/src/features/game/components/player',
    template: `import type { ReactNode } from "react"

export interface ${PascalName}Props {
  title: string
  children?: ReactNode
}

/**
 * ${PascalName} — Mobile Phone Player Client component (Portrait Viewports).
 * Scaffolded via \`pnpm g:player ${PascalName}\`.
 */
export function ${PascalName}({ title, children }: ${PascalName}Props) {
  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 p-4">
      <header className="w-full text-center">
        <h2 className="text-xl font-bold text-ink">{title}</h2>
      </header>
      <main className="w-full flex-1">{children}</main>
    </div>
  )
}

export default ${PascalName}
`,
    test: `import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ${PascalName} } from "../${PascalName}"

describe("${PascalName} (Player Client)", () => {
  it("renders player component header", () => {
    render(<${PascalName} title="Player Screen" />)
    expect(screen.getByText("Player Screen")).toBeDefined()
  })
})
`
  }
}

const config = domainConfig[domain] || domainConfig.console
const targetDir = path.resolve(config.dir)
const compFile = path.join(targetDir, `${PascalName}.tsx`)
const testDir = path.join(targetDir, '__tests__')
const testFile = path.join(testDir, `${PascalName}.test.tsx`)

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
}

if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true })
}

fs.writeFileSync(compFile, config.template, 'utf-8')
fs.writeFileSync(testFile, config.test, 'utf-8')

console.log(`\x1b[32m✔ Scaffolded [${domain.toUpperCase()}] component:\x1b[0m ${compFile}`)
console.log(`\x1b[32m✔ Scaffolded Vitest test file:\x1b[0m ${testFile}`)
