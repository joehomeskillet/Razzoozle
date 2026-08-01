import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import clsx from "clsx"

/**
 * AF-15 mode only (reason strings live on TabDef). AF03 host contract #1009.
 */
export type ActionFooterPolicyMode = "required" | "optional" | "none"

/**
 * Shell-local portal host API (Master-WP §3.3 / AF03).
 * Tabs keep state; ActionFooter portals into `target` (AF04).
 */
export interface ConsoleActionFooterHost {
  /** DOM node inside `.console-shell` for createPortal. Null until mounted. */
  target: HTMLElement | null
  /**
   * Register exactly one footer instance for the active tab.
   * Returns a cleanup that MUST run on unmount (removes the instance).
   * A second distinct instanceId is a hard error in development/test.
   */
  register: (instanceId: string) => () => void
  /** Live registration count — host is invisible when 0. */
  registrationCount: number
  /** Callback ref for the host `<footer>` (must sit inside `.console-shell`). */
  setTarget: (node: HTMLElement | null) => void
}

export interface ActionFooterRegistry {
  readonly count: number
  register: (instanceId: string) => () => void
  assertPolicy: (policy: ActionFooterPolicyMode | undefined) => void
  subscribe: (listener: () => void) => () => void
}

const isStrictMode = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV) || import.meta.env?.MODE === "test"
  } catch {
    return process.env.NODE_ENV !== "production"
  }
}

/**
 * Pure registry (unit-testable without DOM). Used by the React provider.
 */
/**
 * AF04 sets this to `"error"` once ActionFooter registers via the portal host.
 * Until then required+empty only warns so sticky call-sites keep working.
 */
export let REQUIRED_FOOTER_ENFORCEMENT: "warn" | "error" = "warn"

export function setRequiredFooterEnforcement(mode: "warn" | "error"): void {
  REQUIRED_FOOTER_ENFORCEMENT = mode
}

export function createActionFooterRegistry(
  options: { strict?: boolean; onError?: (message: string) => void } = {},
): ActionFooterRegistry {
  const strict = options.strict ?? isStrictMode()
  const ids = new Set<string>()
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const fail = (message: string) => {
    options.onError?.(message)
    if (strict) {
      throw new Error(message)
    }
  }

  return {
    get count() {
      return ids.size
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    register(instanceId: string) {
      if (!instanceId) {
        fail("ConsoleActionFooter: register() requires a non-empty instanceId")
      }
      if (ids.size > 0 && !ids.has(instanceId)) {
        fail(
          `ConsoleActionFooter: only one footer may register per tab (active=${[...ids].join(",")}, new=${instanceId})`,
        )
      }
      ids.add(instanceId)
      notify()
      return () => {
        ids.delete(instanceId)
        notify()
      }
    },
    assertPolicy(policy) {
      // required+empty: WARN until AF04 portals ActionFooter into the host.
      // Hard-fail would crash every required tab while footers still mount
      // as sticky tabpanel children. AF04 flips REQUIRED_FOOTER_ENFORCEMENT.
      if (policy === "required" && ids.size === 0) {
        const message =
          'ConsoleActionFooter: policy "required" but no footer is registered'
        if (REQUIRED_FOOTER_ENFORCEMENT === "error") {
          fail(message)
        } else {
          options.onError?.(message)
          if (typeof console !== "undefined") {
            console.warn(`[AF03] ${message}`)
          }
        }
      }
      if (policy === "none" && ids.size > 0) {
        fail('ConsoleActionFooter: policy "none" but a footer is registered')
      }
    },
  }
}

const ActionFooterHostContext = createContext<ConsoleActionFooterHost | null>(
  null,
)

export interface ActionFooterHostProviderProps {
  children: ReactNode
  /** Active tab key — re-validates policy when the tab changes. */
  activeKey: string
  /** AF-15 policy for the active tab (from TabDef.actionFooter). */
  footerPolicy?: ActionFooterPolicyMode
  /** Override strictness (tests). Default: DEV or vitest. */
  strict?: boolean
}

/**
 * Provides the shell-local ActionFooter portal host API.
 * Place {@link ActionFooterHostSlot} as a direct child of `.console-shell`
 * (sibling of BodyGrid) so tokens and full-width band stay correct.
 */
export function ActionFooterHostProvider({
  children,
  activeKey,
  footerPolicy,
  strict,
}: ActionFooterHostProviderProps) {
  const registryRef = useRef<ActionFooterRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = createActionFooterRegistry({ strict })
  }
  const registry = registryRef.current

  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [registrationCount, setRegistrationCount] = useState(0)

  useEffect(() => {
    return registry.subscribe(() => {
      setRegistrationCount(registry.count)
    })
  }, [registry])

  // After tab change / registration updates, re-check policy (AF-16).
  // `window` is absent under node SSR tests — skip there.
  useEffect(() => {
    if (typeof window === "undefined") return
    const id = window.setTimeout(() => {
      try {
        registry.assertPolicy(footerPolicy)
      } catch {
        // strict registry already threw; non-strict only onError'd
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [activeKey, footerPolicy, registry, registrationCount])

  const register = useCallback(
    (instanceId: string) => registry.register(instanceId),
    [registry],
  )

  const value = useMemo<ConsoleActionFooterHost>(
    () => ({
      target,
      register,
      registrationCount,
      setTarget,
    }),
    [target, register, registrationCount],
  )

  return (
    <ActionFooterHostContext.Provider value={value}>
      {children}
    </ActionFooterHostContext.Provider>
  )
}

/**
 * Visible shell footer band. Mount as last child of `.console-shell`
 * (sibling of BodyGrid — NOT inside the tabpanel). AF-02 / AF-03.
 *
 * Hidden with no height when `registrationCount === 0` (AF-14).
 * No sticky / fixed / negative margins (AF-17).
 */
export function ActionFooterHostSlot({ className }: { className?: string }) {
  const host = useActionFooterHost()
  const { t } = useTranslation("manager")
  const visible = host.registrationCount > 0

  return (
    <footer
      ref={host.setTarget}
      data-testid="console-action-footer-host"
      data-registered={host.registrationCount}
      aria-label={t("aria.actionFooter", {
        defaultValue: "Page actions",
      })}
      hidden={!visible}
      className={clsx(
        "shrink-0 border-t border-[var(--line)] bg-[var(--surface)]",
        "shadow-[var(--shadow-flat)]",
        "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6",
        !visible && "border-0 p-0 shadow-none",
        className,
      )}
    />
  )
}

/**
 * Hook for ActionFooter (AF04) and tests.
 * Throws outside the provider (fail-fast, same as other console contexts).
 */
export function useActionFooterHost(): ConsoleActionFooterHost {
  const ctx = useContext(ActionFooterHostContext)
  if (!ctx) {
    throw new Error(
      "useActionFooterHost must be used within ActionFooterHostProvider (ConsoleShell)",
    )
  }
  return ctx
}

/** Optional variant — returns null when outside the shell (non-console pages). */
export function useActionFooterHostOptional(): ConsoleActionFooterHost | null {
  return useContext(ActionFooterHostContext)
}
