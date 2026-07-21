import Background from "@razzoozle/web/components/Background"
import LanguageSwitcher from "@razzoozle/web/components/LanguageSwitcher"
import Loader from "@razzoozle/web/components/Loader"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { z } from "zod"

const searchSchema = z.object({
  pin: z.coerce.string().optional(),
  // Post-login return path. Set by the `/manager/config` auth guard when a
  // logged-out deep-link is hit, so login can send the manager back to the
  // intended tab instead of the bare dashboard.
  redirect: z.string().optional(),
})

const AuthLayout = () => {
  const { isConnected } = useSocket()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isManagerAuth = pathname === "/manager"
  // Pre-game ENTRY (PIN-join + username) is the cream front-of-house field.
  // The manager auth keeps the dark brand gradient (plain), so only the player
  // auth gets `field="cream"`.
  const field = isManagerAuth ? undefined : "cream"

  if (!isConnected) {
    return (
      <Background plain={isManagerAuth} field={field}>
        <Loader className="h-23" />
        <h2 className="mt-2 text-center text-2xl font-bold md:text-3xl">
          {t("common:loading")}
        </h2>
      </Background>
    )
  }

  return (
    <Background plain={isManagerAuth} field={field}>
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Outlet />
    </Background>
  )
}

export const Route = createFileRoute("/(auth)")({
  component: AuthLayout,
  validateSearch: searchSchema,
})
