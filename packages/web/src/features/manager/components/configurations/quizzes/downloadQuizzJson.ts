import type { QuizzWithId } from "@razzoozle/common/types/game"

// Serialize a quiz to a pretty-printed JSON file and trigger a client-side
// download via a transient object-URL anchor (mirrors downloadResultCsv). The
// `id` field is stripped so the exported shape matches quizzValidator, letting
// export -> import round-trip cleanly.
export const downloadQuizzJson = (quizz: QuizzWithId) => {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  const { id: _id, ...exportable } = quizz
  const json = JSON.stringify(exportable, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug(quizz.subject) || "quiz"}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
