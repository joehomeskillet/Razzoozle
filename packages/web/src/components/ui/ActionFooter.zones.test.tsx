// AF05 #1011 — typed ActionFooter zones + primitives (node env, SSR markup).

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import ActionFooter, {
  ActionFooterActions,
  ActionFooterControls,
  ActionFooterField,
  ActionFooterOptionsDisclosure,
  ActionFooterSummary,
} from "./ActionFooter"

describe("ActionFooter zones (AF05)", () => {
  it("renders named zones with primary after secondary in DOM", () => {
    const html = renderToStaticMarkup(
      <ActionFooter
        context={<ActionFooterSummary title="Quiz A" meta="5 questions" />}
        controls={
          <ActionFooterControls>
            <ActionFooterField label="Mode">
              <select>
                <option>Classic</option>
              </select>
            </ActionFooterField>
          </ActionFooterControls>
        }
        secondaryActions={<button type="button">Copy</button>}
        primaryAction={<button type="button">Start</button>}
      />,
    )

    expect(html).toContain('data-layout="zones"')
    expect(html).toContain('data-testid="action-footer-summary"')
    expect(html).toContain("Quiz A")
    expect(html).toContain("5 questions")
    expect(html).toContain('data-testid="action-footer-field"')
    expect(html).toContain("Mode")
    expect(html).toContain('data-testid="action-footer-secondary"')
    expect(html).toContain('data-testid="action-footer-primary"')

    const secondaryIdx = html.indexOf('data-testid="action-footer-secondary"')
    const primaryIdx = html.indexOf('data-testid="action-footer-primary"')
    expect(secondaryIdx).toBeGreaterThan(-1)
    expect(primaryIdx).toBeGreaterThan(secondaryIdx)
    expect(html.indexOf(">Copy</button>")).toBeLessThan(
      html.indexOf(">Start</button>"),
    )
  })

  it("legacy children-only path still works", () => {
    const html = renderToStaticMarkup(
      <ActionFooter>
        <button type="button">Save</button>
      </ActionFooter>,
    )
    expect(html).toContain('data-layout="legacy-children"')
    expect(html).toContain("Save")
  })

  it("legacy children coexist with zones", () => {
    const html = renderToStaticMarkup(
      <ActionFooter primaryAction={<button type="button">Go</button>}>
        <button type="button">Extra</button>
      </ActionFooter>,
    )
    expect(html).toContain('data-testid="action-footer-legacy-children"')
    expect(html).toContain("Extra")
    expect(html).toContain("Go")
  })

  it("mobile controls use disclosure markup", () => {
    const html = renderToStaticMarkup(
      <ActionFooter
        controls={<span>Cap</span>}
        mobileOptionsLabel="Start options"
        mobileChangedCount={2}
        primaryAction={<button type="button">Start</button>}
      />,
    )
    expect(html).toContain('data-testid="action-footer-options-disclosure"')
    expect(html).toContain("Start options")
    expect(html).toContain('data-testid="action-footer-options-changed"')
    expect(html).toContain(">2<")
  })

  it("ActionFooterActions enforces primary last via markup order", () => {
    const html = renderToStaticMarkup(
      <ActionFooterActions
        secondary={<button type="button">Sec</button>}
        primary={<button type="button">Pri</button>}
      />,
    )
    expect(html.indexOf(">Sec</button>")).toBeLessThan(html.indexOf(">Pri</button>"))
  })

  it("ActionFooterField exposes an accessible label", () => {
    const html = renderToStaticMarkup(
      <ActionFooterField label="Team mode">
        <input type="checkbox" />
      </ActionFooterField>,
    )
    expect(html).toContain("Team mode")
    expect(html).toMatch(/role="group"/)
  })

  it("OptionsDisclosure is a details/summary landmark", () => {
    const html = renderToStaticMarkup(
      <ActionFooterOptionsDisclosure label="More">
        <span>fields</span>
      </ActionFooterOptionsDisclosure>,
    )
    expect(html).toMatch(/<details/)
    expect(html).toMatch(/<summary/)
    expect(html).toContain("More")
    expect(html).toContain("fields")
  })
})
