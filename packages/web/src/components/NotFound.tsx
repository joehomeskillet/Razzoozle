import AnimatedErrorPage from "@razzia/web/components/AnimatedErrorPage"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

const NotFound = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <AnimatedErrorPage
      variant="notFound"
      title={t("errors:notFound.title")}
      description={t("errors:notFound.description")}
      onBack={() => navigate({ to: "/" })}
    />
  )
}

export default NotFound
