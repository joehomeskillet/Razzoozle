import defaultLogo from "@razzia/web/assets/logo.svg"
import GithubIcon from "@razzia/web/components/GithubIcon"
import { useThemeStore } from "@razzia/web/features/theme/store"
import type { PropsWithChildren } from "react"

// `plain` forces the purple brand gradient and skips the themed photo wallpaper
// — used by the manager console (/manager/config) which wants a clean solid
// background, while login/lobby/submit/share keep the photo.
const Background = ({
  children,
  plain = false,
}: PropsWithChildren<{ plain?: boolean }>) => {
  const { theme } = useThemeStore()
  const authBg = theme.backgrounds.auth
  const appTitle = theme.appTitle?.trim()

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center">
      <div className="fixed inset-0 overflow-hidden">
        {authBg && !plain ? (
          <img
            src={authBg}
            alt="background"
            className="pointer-events-none absolute h-full w-full object-cover select-none"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: "var(--bg-scrim)" }}
        />
      </div>

      {/* Brand above the login: a custom uploaded logo wins; otherwise show the
          themed appTitle as text (e.g. "Südhang Kahoot"); fall back to the
          bundled logo only when neither is set. */}
      {theme.logo ? (
        <img
          src={theme.logo}
          className="z-10 mb-10 h-16"
          alt={appTitle ?? "logo"}
        />
      ) : appTitle ? (
        <h1 className="z-10 mb-10 text-center text-4xl font-extrabold tracking-tight text-white drop-shadow-lg md:text-5xl">
          {appTitle}
        </h1>
      ) : (
        <img src={defaultLogo} className="z-10 mb-10 h-16" alt="logo" />
      )}
      {children}

      {theme.showBranding && (
        <a
          href="https://github.com/Ralex91/Razzia"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 text-sm font-semibold text-white/50 transition-colors hover:text-white/80"
        >
          <GithubIcon size={14} />
          {/* oxlint-disable-next-line no-undef */}
          Razzia - v{__APP_VERSION__}
        </a>
      )}
    </section>
  )
}

export default Background
