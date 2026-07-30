import { vi } from "vitest"
import React from "react"

// Global mock for lucide-react icons used in tests
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    ChevronDown: ({ className }: { className?: string }) =>
      React.createElement("div", { "data-testid": "chevron-down", className }),
  }
})
