import Button from "@razzoozle/web/components/Button"
import type { TFunction } from "i18next"
import { CheckCircle2 } from "lucide-react"
import { motion } from "motion/react"

interface SubmitSuccessCardProps {
  reducedMotion: boolean | null
  t: TFunction
  handleReset: () => void
}

const SubmitSuccessCard = ({
  reducedMotion,
  t,
  handleReset,
}: SubmitSuccessCardProps) => {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.28, ease: "easeOut" }
      }
      className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-3xl bg-white p-8 text-center shadow-2xl"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={
          reducedMotion
            ? undefined
            : { duration: 0.28, ease: "easeOut", delay: 0.08 }
        }
        className="flex size-16 items-center justify-center rounded-full bg-green-100 text-green-600"
      >
        <CheckCircle2 className="size-10" strokeWidth={2.5} />
      </motion.div>
      <h2 className="text-2xl font-bold text-gray-800">
        {t("submit:success.title")}
      </h2>
      <p className="text-sm leading-6 text-gray-600">
        {t("submit:success.body")}
      </p>
      <Button
        onClick={handleReset}
        className="min-h-11 w-full rounded-xl"
        size="md"
      >
        {t("submit:success.again")}
      </Button>
    </motion.div>
  )
}

export default SubmitSuccessCard
