export interface ParsedQuestionRow {
  question: string
  answers: string[]
  correctAnswerIndex: number
  timeLimitSeconds?: number
  type?: string
}

export interface ParseResult {
  questions: ParsedQuestionRow[]
  errors: Array<{ line: number; message: string }>
}

export function parseQuestionCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const questions: ParsedQuestionRow[] = []
  const errors: Array<{ line: number; message: string }> = []

  if (lines.length === 0) {
    return { questions: [], errors: [{ line: 0, message: "CSV file is empty" }] }
  }

  // Expect header in line 0
  const header = lines[0].toLowerCase().split(",").map((s) => s.trim())
  const qIdx = header.indexOf("question")
  const a1Idx = header.indexOf("answer1")
  const a2Idx = header.indexOf("answer2")
  const correctIdx = header.indexOf("correctindex")

  if (qIdx === -1 || a1Idx === -1 || a2Idx === -1 || correctIdx === -1) {
    return {
      questions: [],
      errors: [{ line: 1, message: "Missing required headers: question, answer1, answer2, correctIndex" }],
    }
  }

  const a3Idx = header.indexOf("answer3")
  const a4Idx = header.indexOf("answer4")
  const timeIdx = header.indexOf("timelimit")
  const typeIdx = header.indexOf("type")

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1
    const cols = lines[i].split(",").map((s) => s.trim())

    const questionText = cols[qIdx]
    if (!questionText) {
      errors.push({ line: lineNum, message: "Empty question text" })
      continue
    }

    const answers: string[] = []
    if (cols[a1Idx]) answers.push(cols[a1Idx])
    if (cols[a2Idx]) answers.push(cols[a2Idx])
    if (a3Idx !== -1 && cols[a3Idx]) answers.push(cols[a3Idx])
    if (a4Idx !== -1 && cols[a4Idx]) answers.push(cols[a4Idx])

    if (answers.length < 2) {
      errors.push({ line: lineNum, message: "At least 2 answers required" })
      continue
    }

    const parsedCorrect = parseInt(cols[correctIdx], 10)
    if (isNaN(parsedCorrect) || parsedCorrect < 0 || parsedCorrect >= answers.length) {
      errors.push({ line: lineNum, message: `Invalid correctIndex: ${cols[correctIdx]}` })
      continue
    }

    const timeLimit = timeIdx !== -1 && cols[timeIdx] ? parseInt(cols[timeIdx], 10) : 30
    const qType = typeIdx !== -1 && cols[typeIdx] ? cols[typeIdx] : "choice"

    questions.push({
      question: questionText,
      answers,
      correctAnswerIndex: parsedCorrect,
      timeLimitSeconds: timeLimit,
      type: qType,
    })
  }

  return { questions, errors }
}
