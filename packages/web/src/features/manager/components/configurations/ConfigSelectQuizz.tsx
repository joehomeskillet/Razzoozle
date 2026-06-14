import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import {
  EmptyState,
  SelectableRow,
} from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import { ListChecks, Play } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const list = useMemo(
    () => quizzList.filter((q) => !q.archived),
    [quizzList],
  )

  useEffect(() => {
    if (selected && !list.some((q) => q.id === selected)) {
      setSelected(null)
    }
  }, [list, selected])

  const handleSelect = (id: string) => () =>
    setSelected((current) => (current === id ? null : id))

  const handleSubmit = () => {
    if (!selected) {
      return
    }

    socket.emit(EVENTS.GAME.CREATE, selected)
  }

  if (list.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState
          icon={ListChecks}
          headline={t("manager:quizz.notFound")}
          hint={t("manager:quizz.pleaseCreate")}
          action={{
            label: t("manager:quizz.create"),
            onClick: () => {
              void navigate({ to: "/manager/quizz" })
            },
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <motion.div
        role="radiogroup"
        aria-label={t("manager:quizz.startGame")}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-0.5"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
        }
      >
        {list.map((quizz, index) => (
          <motion.div
            key={quizz.id}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 0.28,
                    ease: "easeOut",
                    delay: Math.min(index, 8) * 0.04,
                  }
            }
          >
            <SelectableRow
              title={quizz.subject}
              selected={selected === quizz.id}
              onClick={handleSelect(quizz.id)}
            />
          </motion.div>
        ))}
      </motion.div>

      <div className="shrink-0 pt-4">
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-xl"
          onClick={handleSubmit}
          disabled={!selected}
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          <Play className="size-5" aria-hidden strokeWidth={2.5} />
          <span>{t("manager:quizz.startGame")}</span>
        </Button>
      </div>
    </div>
  )
}

export default ConfigSelectQuizz
