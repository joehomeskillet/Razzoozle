import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const { t } = useTranslation()

  const handleSelect = (id: string) => () => {
    if (selected === id) {
      setSelected(null)
    } else {
      setSelected(id)
    }
  }

  const handleSubmit = () => {
    if (!selected) {
      return
    }

    socket.emit(EVENTS.GAME.CREATE, selected)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {quizzList.length > 0 && (
        <Button
          className="mb-4 shrink-0"
          onClick={handleSubmit}
          disabled={!selected}
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          {t("manager:quizz.startGame")}
        </Button>
      )}
      <div
        role="radiogroup"
        aria-label={t("manager:quizz.startGame")}
        className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5"
      >
        {quizzList.map((quizz) => (
          <button
            key={quizz.id}
            type="button"
            role="radio"
            aria-checked={selected === quizz.id}
            className={clsx(
              "flex w-full items-center justify-between rounded-md p-3 outline outline-gray-300",
              "focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2",
              selected === quizz.id && "outline-primary outline-2",
            )}
            onClick={handleSelect(quizz.id)}
          >
            {quizz.subject}

            <div
              className={clsx(
                "size-5 rounded p-0.5 outline outline-offset-3 outline-gray-300",
                selected === quizz.id && "bg-primary border-primary/80",
              )}
            >
              {selected === quizz.id && (
                <Check className="size-full stroke-4 text-white" />
              )}
            </div>
          </button>
        ))}
        {!quizzList.length && (
          <div className="my-8 flex flex-col items-center gap-3 text-center text-gray-500">
            <div>
              <p>{t("manager:quizz.notFound")}</p>
              <p className="text-sm">{t("manager:quizz.pleaseCreate")}</p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/manager/quizz" })}
            >
              {t("manager:quizz.create")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfigSelectQuizz
