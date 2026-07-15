/**
 * AnswerSubmitPayload — Wire contract for all 7 question types (MP + Solo).
 *
 * Covers: choice, multiple-select, slider, type-answer, mathematik, wortarten, sentence-builder.
 * Field names/types are exact to the emitted payloads in Answers.tsx + SoloAnswers.tsx.
 */
export type AnswerSubmitPayload =
  | { answerKey: number }
  | { answerKey: -1; answerKeys: number[] }
  | { answerKey: -1; answerText: string }

/**
 * AnswerViewProps — Generic props for all answer view components.
 *
 * @template V The value type for this question (number, string, string[], etc.)
 */
export interface AnswerViewProps<V> {
  /** Current answer value */
  value: V
  /** Called when the user modifies the answer (local state only, no submit) */
  onChange: (v: V) => void
  /** Called when the user submits their answer */
  onSubmit: () => void
  /** Whether the input is disabled (e.g., after submission, on countdown) */
  disabled: boolean
  /** Optional result feedback (Solo mode only; inert in MP) */
  feedback?: { correct: boolean }
  /** Test ID prefix ('' for MP, 'solo-' for Solo) */
  testIdPrefix?: '' | 'solo-'
}
