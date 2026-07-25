import { describe, expect, it } from "vitest"
import { parseQuestionCsv } from "./csvQuestionParser"

describe("csvQuestionParser Utility (Issue #479 / SDD #479)", () => {
  const validCsv = `question,answer1,answer2,answer3,answer4,correctIndex,timeLimit,type
Was ist HTML?,Hypertext,Prototyp,Design,Datenbank,0,20,choice
Wie viel ist 2+2?,3,4,,,1,15,choice`

  it("parses valid CSV lines correctly", () => {
    const res = parseQuestionCsv(validCsv)

    expect(res.errors).toHaveLength(0)
    expect(res.questions).toHaveLength(2)
    expect(res.questions[0].question).toBe("Was ist HTML?")
    expect(res.questions[0].answers).toEqual(["Hypertext", "Prototyp", "Design", "Datenbank"])
    expect(res.questions[0].correctAnswerIndex).toBe(0)
  })

  it("reports error on missing required headers", () => {
    const invalidHeaderCsv = `title,optionA,optionB\nFoo,Bar,Baz`
    const res = parseQuestionCsv(invalidHeaderCsv)

    expect(res.questions).toHaveLength(0)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].message).toContain("Missing required headers")
  })

  it("reports error for invalid correctIndex range", () => {
    const badIndexCsv = `question,answer1,answer2,correctIndex\nTest?,A,B,5`
    const res = parseQuestionCsv(badIndexCsv)

    expect(res.questions).toHaveLength(0)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].message).toContain("Invalid correctIndex")
  })

  it("reports error for lines with fewer than 2 answers", () => {
    const singleAnsCsv = `question,answer1,answer2,correctIndex\nTest?,A,,0`
    const res = parseQuestionCsv(singleAnsCsv)

    expect(res.questions).toHaveLength(0)
    expect(res.errors[0].message).toContain("At least 2 answers required")
  })

  it("handles empty CSV input gracefully", () => {
    const res = parseQuestionCsv("")

    expect(res.questions).toHaveLength(0)
    expect(res.errors[0].message).toBe("CSV file is empty")
  })

  it("exports parseQuestionCsv function component", () => {
    expect(typeof parseQuestionCsv).toBe("function")
  })
})
