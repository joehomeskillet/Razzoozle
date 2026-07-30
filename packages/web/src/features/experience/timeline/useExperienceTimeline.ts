import { useEffect, useRef, useState } from "react"

import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"

import { createTimelineSnapshot } from "./createTimelineSnapshot"
import type {
  ExperienceTimelineInput,
  ExperienceTimelineResult,
} from "./types"

type TimelineState = {
  result: ExperienceTimelineResult | null
  revision: number
}

const INITIAL_STATE: TimelineState = {
  result: null,
  revision: -1,
}

function resolveNowMs(
  input: ExperienceTimelineInput,
  clockOffsetMs: number,
): number {
  if (input.serverNow) {
    return Date.parse(input.serverNow)
  }
  return monoNow() + (clockOffsetMs || 0)
}

export function useExperienceTimeline(
  input: ExperienceTimelineInput | null,
): ExperienceTimelineResult | null {
  const clockOffsetMs = useLowLatencyStore((s) => s.offsetMs)
  const [state, setState] = useState<TimelineState>(INITIAL_STATE)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    if (!input) {
      return
    }

    const tick = () => {
      const current = inputRef.current
      if (!current) {
        return
      }

      const snapshot = createTimelineSnapshot(
        current,
        resolveNowMs(current, clockOffsetMs),
      )

      setState((prev) => {
        if (current.revision < prev.revision) {
          return prev
        }
        return {
          result: snapshot,
          revision: current.revision,
        }
      })
    }

    tick()
    const intervalId = setInterval(tick, 250)

    const onVisibilityChange = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        tick()
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange)
    }

    return () => {
      clearInterval(intervalId)
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange)
      }
    }
  }, [input, clockOffsetMs])

  return state.result
}
