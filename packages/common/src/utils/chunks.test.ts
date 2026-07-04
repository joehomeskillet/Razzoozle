import { describe, it, expect } from "vitest"
import { autoGenerateChunks, shuffleChunksWithGuard } from "./chunks"
import { questionValidator } from "../validators/quizz"

describe("autoGenerateChunks", () => {
  it("splits short sentence word-by-word (5 words or fewer)", () => {
    const sentence = "The quick brown fox"
    const chunks = autoGenerateChunks(sentence)
    expect(chunks).toEqual(["The", "quick", "brown", "fox"])
  })

  it("joins result with space reproduces word sequence", () => {
    const sentence = "The quick brown fox jumps over lazy dog"
    const chunks = autoGenerateChunks(sentence)
    const rejoined = chunks.join(" ")
    expect(rejoined).toBe(sentence)
  })

  it("handles long sentence with multi-word phrases", () => {
    const sentence =
      "The quick brown fox jumps over the lazy dog which was sleeping"
    const chunks = autoGenerateChunks(sentence)
    const rejoined = chunks.join(" ")
    expect(rejoined).toBe(sentence)
    expect(chunks.length).toBeGreaterThan(0)
  })

  it("returns empty array for empty string", () => {
    const chunks = autoGenerateChunks("")
    expect(chunks).toEqual([])
  })

  it("handles sentence with exactly 5 words", () => {
    const sentence = "One two three four five"
    const chunks = autoGenerateChunks(sentence)
    expect(chunks.length).toBe(5)
    expect(chunks.join(" ")).toBe(sentence)
  })

  it("handles sentence with 6 words (triggers phrase splitting)", () => {
    const sentence = "One two three four five six"
    const chunks = autoGenerateChunks(sentence)
    expect(chunks.join(" ")).toBe(sentence)
  })
})

describe("shuffleChunksWithGuard", () => {
  it("returns a permutation of input", () => {
    const chunks = ["a", "b", "c", "d", "e", "f"]
    const shuffled = shuffleChunksWithGuard(chunks)
    expect(shuffled.length).toBe(chunks.length)
    expect(shuffled.sort()).toEqual(chunks.sort())
  })

  it("returns different order from input for 6 distinct elements across 50 runs", () => {
    const chunks = ["a", "b", "c", "d", "e", "f"]
    let differentCount = 0

    for (let i = 0; i < 50; i++) {
      const shuffled = shuffleChunksWithGuard(chunks)
      const isEqual = chunks.every((val, idx) => val === shuffled[idx])
      if (!isEqual) {
        differentCount++
      }
    }

    expect(differentCount).toBeGreaterThan(0)
  })

  it("handles 2-element array", () => {
    const chunks = ["a", "b"]
    const shuffled = shuffleChunksWithGuard(chunks)
    expect(shuffled.length).toBe(2)
    expect(shuffled.sort()).toEqual(chunks.sort())
  })

  it("handles identical elements (returns unchanged when unavoidable)", () => {
    const chunks = ["a", "a", "a", "a"]
    const shuffled = shuffleChunksWithGuard(chunks)
    expect(shuffled).toEqual(chunks)
  })

  it("retries shuffle up to 10 times to avoid input order", () => {
    const chunks = ["unique_a", "unique_b", "unique_c", "unique_d"]
    const shuffled = shuffleChunksWithGuard(chunks)
    const isEqual = chunks.every((val, idx) => val === shuffled[idx])
    expect(isEqual).toBe(false)
  })
})

describe("questionValidator with sentence-builder type", () => {
  it("validates sentence-builder question with valid chunks", () => {
    const question = {
      question: "Assemble the sentence",
      type: "sentence-builder",
      chunks: ["Hello", "world"],
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(true)
  })

  it("fails when chunks is missing for sentence-builder", () => {
    const question = {
      question: "Assemble the sentence",
      type: "sentence-builder",
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(false)
  })

  it("fails when chunks has only 1 element for sentence-builder", () => {
    const question = {
      question: "Assemble the sentence",
      type: "sentence-builder",
      chunks: ["OnlyOne"],
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(false)
  })

  it("validates sentence-builder question with multiple chunks", () => {
    const question = {
      question: "Build a sentence",
      type: "sentence-builder",
      chunks: ["The", "quick", "brown", "fox"],
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(true)
  })

  it("still validates existing choice-type fixture", () => {
    const question = {
      question: "What is 2+2?",
      type: "choice",
      answers: ["4", "5"],
      solutions: [0],
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(true)
  })

  it("sentence-builder does not require answers/solutions", () => {
    const question = {
      question: "Assemble the sentence",
      type: "sentence-builder",
      chunks: ["Hello", "world"],
      cooldown: 5,
      time: 15,
    }

    const result = questionValidator.safeParse(question)
    expect(result.success).toBe(true)
    expect(result.data?.answers).toBeUndefined()
    expect(result.data?.solutions).toBeUndefined()
  })
})
