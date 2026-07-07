import { EVENTS } from "@razzoozle/common/constants"
import type { MediaCategory } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { type ChangeEvent, useCallback, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// 8 MiB cap mirrors the theme-background upload ceiling (ConfigTheme.tsx).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

// Categories the manager may upload into. AI-generated and theme-managed
// buckets are populated by other flows, so a manual upload defaults to the
// neutral "generated" library bucket only when nothing else is selected.
const UPLOAD_CATEGORY: MediaCategory = "generated"

export const useMediaUpload = (requestMedia: () => void) => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)

  // Pending upload queue. The backend acks one upload at a time via
  // UPLOAD_SUCCESS / ERROR, so we drain the queue serially: shift the next file,
  // read it, emit, and pull again on the next ack. A ref holds the live queue so
  // the event callbacks always see the current tail without re-subscribing.
  const queueRef = useRef<File[]>([])
  // Mirror of `uploading` so the enqueue logic reads the live value without a
  // stale closure (state updates are async; the ref is set synchronously).
  const uploadingRef = useRef(false)
  // Holds the latest pumpQueue so sendFile's async FileReader callbacks can
  // advance the queue without a circular useCallback dependency.
  const pumpQueueRef = useRef<() => boolean>(() => false)

  // Single source of truth for flipping the uploading flag so the ref and the
  // state never drift apart.
  const setUploadingFlag = useCallback((value: boolean) => {
    uploadingRef.current = value
    setUploading(value)
  }, [])

  const sendFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        socket.emit(EVENTS.MEDIA.UPLOAD, {
          filename: file.name,
          dataUrl: reader.result as string,
          category: UPLOAD_CATEGORY,
        })
      }
      reader.onerror = () => {
        toast.error(t("manager:media.uploadFailed"))
        // Surface the error but keep draining: advance to the next queued file
        // (or settle to idle) just like onload does on success.
        pumpQueueRef.current()
      }
      reader.readAsDataURL(file)
    },
    [socket, t],
  )

  // Pull the next valid file off the queue (skipping oversized ones with a
  // toast) and start its upload. Returns false when the queue is drained.
  const pumpQueue = useCallback(() => {
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()

      if (!next) {
        continue
      }

      if (next.size > MAX_UPLOAD_BYTES) {
        toast.error(t("manager:media.tooLarge"))

        continue
      }

      setUploadingFlag(true)
      sendFile(next)

      return true
    }

    setUploadingFlag(false)

    return false
  }, [sendFile, setUploadingFlag, t])

  // Keep the ref pointed at the latest pumpQueue identity.
  pumpQueueRef.current = pumpQueue

  // Validate + enqueue a batch (file picker or drop), then kick the pump if idle.
  const enqueueFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((file) => {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(t("manager:media.tooLarge"))

          return false
        }

        return true
      })

      if (accepted.length === 0) {
        return
      }

      // Read the live uploading value via the ref so a batch enqueued right
      // after a previous one can't see a stale `false` and double-pump.
      const wasIdle = queueRef.current.length === 0 && !uploadingRef.current
      queueRef.current.push(...accepted)

      if (wasIdle) {
        pumpQueue()
      }
    },
    [pumpQueue, t],
  )

  useEvent(
    EVENTS.MEDIA.UPLOAD_SUCCESS,
    useCallback(() => {
      toast.success(t("manager:media.uploaded"))
      requestMedia()
      // Advance to the next queued file (or settle to idle).
      pumpQueue()
    }, [pumpQueue, requestMedia, t]),
  )

  useEvent(
    EVENTS.MEDIA.ERROR,
    useCallback(
      (message: string) => {
        toast.error(t(message, { defaultValue: message }))
        // Skip the failed item and keep draining the rest of the batch.
        pumpQueue()
      },
      [pumpQueue, t],
    ),
  )

  const openFilePicker = () => fileInputRef.current?.click()

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Allow re-selecting the same file(s) after an error/completion.
    event.target.value = ""

    enqueueFiles(files)
  }

  return { enqueueFiles, fileInputRef, handleUpload, openFilePicker, uploading }
}
