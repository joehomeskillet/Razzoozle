import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ExperienceDisplay } from "../ExperienceDisplay"

describe("ExperienceDisplay (Display/Kiosk)", () => {
  it("renders phase name and progress counters", () => {
    const mockData = {
      mode: "pyramidClimb",
      phase: "question",
      answered: 3,
      total: 10,
    }
    render(<ExperienceDisplay data={mockData} />)
    expect(screen.getByText("question")).toBeDefined()
    expect(screen.getByText(/3/)).toBeDefined()
    expect(screen.getByText(/10/)).toBeDefined()
  })
})
