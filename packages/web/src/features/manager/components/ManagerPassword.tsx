import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { type FormEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onSubmit: (_password: string) => void
}

const ManagerPassword = ({ onSubmit }: Props) => {
  const [password, setPassword] = useState("")
  const { t } = useTranslation()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(password)
  }

  useEvent(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
  })

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <label htmlFor="manager-password" className="sr-only">
          {t("manager:aria.passwordLabel")}
        </label>
        <Input
          id="manager-password"
          name="password"
          type="password"
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("manager:passwordPlaceholder")}
        />
        <Button className="mt-4" type="submit">
          {t("common:submit")}
        </Button>
      </form>
    </Card>
  )
}

export default ManagerPassword
