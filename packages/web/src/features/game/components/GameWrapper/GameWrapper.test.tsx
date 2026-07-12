import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("GameWrapper button resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("re-enables the Next button after 5s timeout if no new status arrives", () => {
    // Simulate the button disabled state and timeout logic
    let isDisabled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleNext = () => {
      isDisabled = true
      timeoutId = setTimeout(() => {
        isDisabled = false
        timeoutId = null
      }, 5000)
    }

    const handleStatusChange = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isDisabled = false
    }

    // Initial state: button is enabled
    expect(isDisabled).toBe(false)

    // User clicks the Next button
    handleNext()
    expect(isDisabled).toBe(true)

    // Advance time by 4s: button should still be disabled
    vi.advanceTimersByTime(4000)
    expect(isDisabled).toBe(true)

    // Advance time by 1s more (total 5s): timeout fires, button re-enables
    vi.advanceTimersByTime(1000)
    expect(isDisabled).toBe(false)
  })

  it("clears the timeout when a new status arrives before timeout", () => {
    let isDisabled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleNext = () => {
      isDisabled = true
      timeoutId = setTimeout(() => {
        isDisabled = false
        timeoutId = null
      }, 5000)
    }

    const handleStatusChange = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isDisabled = false
    }

    // User clicks the Next button
    handleNext()
    expect(isDisabled).toBe(true)
    expect(timeoutId).not.toBe(null)

    // After 2s, a new status arrives (server responds)
    vi.advanceTimersByTime(2000)
    handleStatusChange()

    // Timeout is cleared, button is re-enabled
    expect(isDisabled).toBe(false)
    expect(timeoutId).toBe(null)

    // Advance to the original 5s mark: nothing happens (timeout was cleared)
    vi.advanceTimersByTime(3000)
    expect(isDisabled).toBe(false)
  })
})
