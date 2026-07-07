import { type DragEvent, useRef, useState } from "react"

export const useMediaDragDrop = (enqueueFiles: (files: File[]) => void) => {
  const [dragActive, setDragActive] = useState(false)

  // Drag-enter/leave fire per child element; a counter tracks real boundary
  // crossings so the highlight doesn't flicker over nested cards.
  const dragDepth = useRef(0)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Required so the browser treats this element as a valid drop target.
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault()
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return
    }

    dragDepth.current += 1
    setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return
    }

    dragDepth.current = Math.max(0, dragDepth.current - 1)

    if (dragDepth.current === 0) {
      setDragActive(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)

    const files = Array.from(event.dataTransfer.files ?? [])
    enqueueFiles(files)
  }

  return { dragActive, handleDragEnter, handleDragLeave, handleDragOver, handleDrop }
}
