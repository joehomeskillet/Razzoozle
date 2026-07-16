import { createContext, useContext } from "react"

/**
 * Provides the currently active console tab key so components can react
 * to navigation (e.g., refresh stale data when becoming visible).
 * Throws if used outside ActiveConsoleTabProvider (fail-fast).
 */
const ActiveConsoleTabContext = createContext<string | undefined>(undefined)

export const useActiveConsoleTab = (): string => {
  const context = useContext(ActiveConsoleTabContext)
  if (context === undefined) {
    throw new Error(
      "useActiveConsoleTab must be used within ActiveConsoleTabProvider"
    )
  }
  return context
}

export const ActiveConsoleTabProvider = ({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) => (
  <ActiveConsoleTabContext.Provider value={value}>
    {children}
  </ActiveConsoleTabContext.Provider>
)
