import AnimatedErrorPage from "@razzia/web/components/AnimatedErrorPage"
import { type ErrorVariant } from "@razzia/web/components/errorQuotes"
import i18n from "i18next"
import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
  // Which animated variant to show when something blows up. Defaults to the
  // calm "generic" bug; pass "server" for paths where a 5xx feel is apt.
  variant?: ErrorVariant
}

type State = {
  error: Error | null
}

// Top-level safety net for NON-router render errors. The router already has its
// own errorComponent (-> ErrorPage) for route render failures; this class
// component catches anything that slips past it (e.g. a render throw inside a
// provider subtree) so the user sees the animated error page instead of a
// white screen.
//
// Must be a class — getDerivedStateFromError / componentDidCatch have no hooks
// equivalent. Text is resolved via the i18next singleton (not the useTranslation
// hook, which is unavailable in a class) with inline defaultValues so the page
// reads correctly even before a namespace loads.
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Dev-only: surface the component stack to the console. In production we
    // stay quiet (the animated page + collapsible detail is the user signal),
    // so normal use adds 0 console errors.
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] uncaught render error:", error, info)
    }
  }

  private handleReset = () => {
    // Clear the boundary, then hard-navigate home. The full navigation gives a
    // clean tree even if app state was corrupted by the error.
    this.setState({ error: null })
    window.location.assign("/")
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      const t = i18n.t.bind(i18n)
      return (
        <AnimatedErrorPage
          variant={this.props.variant ?? "generic"}
          title={t("errors:route.title", {
            defaultValue: "Etwas ist schiefgelaufen",
          })}
          description={t("errors:route.description", {
            defaultValue:
              "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.",
          })}
          detail={error.message || undefined}
          onBack={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
