import { createContext, useContext } from "react"

/**
 * Provides a callback to switch the active console tab.
 * Throws if used outside SelectConsoleTabProvider (fail-fast).
 */
const SelectConsoleTabContext = createContext<((key: string) => void) | undefined>(undefined)

export const useSelectConsoleTab = (): ((key: string) => void) => {
  const context = useContext(SelectConsoleTabContext)
  if (context === undefined) {
    throw new Error(
      "useSelectConsoleTab must be used within SelectConsoleTabProvider"
    )
  }
  return context
}

export const SelectConsoleTabProvider = ({
  onSelect,
  children,
}: {
  onSelect: (key: string) => void
  children: React.ReactNode
}) => (
  <SelectConsoleTabContext.Provider value={onSelect}>
    {children}
  </SelectConsoleTabContext.Provider>
)
