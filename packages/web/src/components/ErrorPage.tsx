import AnimatedErrorPage from "@razzoozle/web/components/AnimatedErrorPage"
import { type ErrorVariant } from "@razzoozle/web/components/errorQuotes"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

// Best-effort extraction of an HTTP status code from a thrown error. Router /
// fetch errors carry the code under varying property names; we probe the common
// ones before giving up.
const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined
  const candidate = error as Record<string, unknown>
  for (const key of ["status", "statusCode", "httpStatus", "code"]) {
    const value = candidate[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

// 4xx → client (the request was off), 5xx → server (we broke), else generic.
const variantFromError = (error: unknown): ErrorVariant => {
  const status = extractStatus(error)
  if (status === undefined) return "generic"
  if (status >= 400 && status < 500) return "client"
  if (status >= 500 && status < 600) return "server"
  return "generic"
}

const ErrorPage = ({ error }: { error: Error }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <AnimatedErrorPage
      variant={variantFromError(error)}
      title={t("errors:route.title")}
      description={t("errors:route.description")}
      detail={error.message || undefined}
      onBack={() => navigate({ to: "/" })}
    />
  )
}

export default ErrorPage
