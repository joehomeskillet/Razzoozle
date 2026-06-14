import defaultLogo from "@razzia/web/assets/logo.svg"
import GithubIcon from "@razzia/web/components/GithubIcon"
import { useThemeStore } from "@razzia/web/features/theme/store"
import type { PropsWithChildren } from "react"

const Background = ({ children }: PropsWithChildren) => {
  const { theme } = useThemeStore()
  const authBg = theme.backgrounds.auth
  const appTitle = theme.appTitle?.trim()

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center">
      <div className="fixed inset-0 overflow-hidden">
        {authBg ? (
          <img
            src={authBg}
            alt="background"
            className="pointer-events-none absolute h-full w-full object-cover select-none"
          />
        ) : (
          <>
            <div className="bg-primary/15 absolute top-[-70vmin] left-[-50vmin] min-h-[120vmin] min-w-[120vmin] rotate-20 rounded-4xl" />
            <div className="bg-primary/15 absolute right-[-10vmin] bottom-[-45vmin] min-h-[75vmin] min-w-[75vmin] rotate-20 rounded-4xl" />
          </>
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
