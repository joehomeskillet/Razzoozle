import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"

// Display kiosk shell.
//
// NOTE on the file name: the work-package spec calls this `display/__root.tsx`,
// but TanStack Router supports exactly ONE root route per app (the existing
// `src/pages/__root.tsx`, which mounts the SocketProvider + theme). A second
// `__root.tsx` cannot be a root and — with this project's `routeToken: "layout"`
// config — would be generated as a plain `/display/__root` route, which is not
// what we want. The correct primitive for "a chrome-stripping wrapper around a
// subtree of routes" here is a pathless layout route, hence `layout.tsx`. It is
// picked up automatically by the TanStack Router Vite plugin (no hand-edit of
// the generated route tree).
//
// This layout exists purely to apply kiosk presentation rules for a Raspberry
// Pi wired to a beamer/TV: fullscreen, no scroll, large type, centered. It adds
// NO navbar, NO back button and NO language switcher — the phone is the
// controller, the big screen is a pure display "satellite".

const DisplayLayout = () => {
  // Lock the document into a fixed, non-scrolling, overscroll-free viewport for
  // the whole time a display route is mounted. Restored on unmount so normal
  // app routes keep their usual scrolling behaviour.
  useEffect(() => {
    const { documentElement: html, body } = document
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
      cursor: body.style.cursor,
    }

    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    // Hide the mouse cursor on the kiosk — there is no pointer interaction.
    body.style.cursor = "none"

    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.overscrollBehavior = prev.overscroll
      body.style.cursor = prev.cursor
    }
  }, [])

  return (
    <div className="display-kiosk relative h-dvh w-dvw overflow-hidden bg-black text-white select-none">
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute("/display")({
  component: DisplayLayout,
})
