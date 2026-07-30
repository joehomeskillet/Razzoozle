import { isUnscoredQuestionType } from "@razzoozle/common/constants"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import { DefaultQuestionTypeDisplay } from "@razzoozle/web/features/game/components/displays/DefaultQuestionTypeDisplay"
import {
  resolveDisplay,
  type QuestionTypeDisplay,
} from "@razzoozle/web/features/game/components/displays/questionTypeDisplays"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { answerLabel } from "@razzoozle/web/features/game/utils/answers"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { useEffect, useState } from "react"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

// resolveDisplay's fallback must satisfy `QuestionTypeDisplay`
// ((props: ResponsesDisplayProps) => ReactNode), but DefaultQuestionTypeDisplay
// requires the narrower `type: QuestionTypeKey`. This adapter bridges the two
// without touching either contract — both are frozen (registry scaffold /
// fertige Vorgabe-Darstellung, see MUI-02d scope).
const defaultDisplay: QuestionTypeDisplay = (props) => (
  <DefaultQuestionTypeDisplay type={props.type as QuestionTypeKey} />
)

const Responses = ({
  data: {
    question,
    answers,
    responses,
    solutions,
    type,
    correct,
    correctAnswer,
    unit,
    averageGuess,
    textResponses,
    acceptedAnswers,
    matchMode,
    correctChunks,
    correctOrder,
    items,
    media,
    correctOptions,
    correctMatches,
    correctHotspotIndex,
  },
}: Props) => {
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const isSentenceBuilder = type === "sentence-builder"
  const isMathematik = type === "mathematik"
  const isWortarten = type === "wortarten"
  const isSequencing = type === "sequencing"
  // Wire strings are kebab-case (server `question_type_wire`, serde-renamed to
  // the `type` field on SHOW_RESPONSES).
  const isFillBlank = type === "fill-blank"
  const isMatching = type === "matching"
  const isDropPin = type === "drop-pin"
  const isWordCloud = type === "word-cloud"
  const isBrainstorm = type === "brainstorm"
  const answerList = answers ?? []
  const solutionList = solutions ?? []
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const muted = useSoundStore((s) => s.muted)

  const resultsUrl = useSoundUrl("results")
  const musicUrl = useSoundUrl("answersMusic")
  const [sfxResults] = useSound(resultsUrl, {
    volume: 0.2,
    soundEnabled: !muted,
  })

  const [playMusic, { stop: stopMusic }] = useSound(musicUrl, {
    volume: 0.2,
    soundEnabled: !muted,
    onplay: () => {
      setIsMusicPlaying(true)
    },
    onend: () => {
      setIsMusicPlaying(false)
    },
  })

  useEffect(() => {
    stopMusic()
    sfxResults()
  }, [responses, playMusic, stopMusic, sfxResults])

  useEffect(() => {
    if (!isMusicPlaying) {
      playMusic()
    }
  }, [isMusicPlaying, playMusic])

  useEffect(() => {
    stopMusic()
  }, [playMusic, stopMusic])

  return (
    <div
      data-testid="responses-view"
      className="flex h-full flex-1 flex-col justify-between"
    >
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-[color:var(--game-fg)] drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,5.5vh,6rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        {resolveDisplay(type, defaultDisplay)({
          question,
          responses,
          solutions,
          answers,
          media,
          type,
          correct,
          correctAnswer,
          unit,
          averageGuess,
          textResponses,
          acceptedAnswers,
          matchMode,
          correctChunks,
          correctOrder,
          items,
          correctOptions,
          correctMatches,
          correctHotspotIndex,
        })}
      </div>

      {!isSlider &&
        !isTypeAnswer &&
        !isSentenceBuilder &&
        !isSequencing &&
        !isMathematik &&
        !isWortarten &&
        !isFillBlank &&
        !isMatching &&
        !isDropPin &&
        !isWordCloud &&
        !isBrainstorm && (
          <div>
            <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {answerList.map((answer, key) => (
                <AnswerButton
                  key={key}
                  colorIndex={key}
                  label={answerLabel(key)}
                  correct={
                    isUnscoredQuestionType(type)
                      ? undefined
                      : solutionList.includes(key)
                  }
                >
                  <Markdown>{answer}</Markdown>
                </AnswerButton>
              ))}
            </div>
          </div>
        )}
    </div>
  )
}

export default Responses
