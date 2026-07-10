#!/usr/bin/env node
/**
 * e2e/fixtures/validate.mjs
 *
 * Validate quiz fixtures against schema requirements.
 * Reads both all-types-quiz.json and python-basics-q6-fix.json, validates each,
 * and reports success/failure with detailed information.
 *
 * Usage: node e2e/fixtures/validate.mjs
 */

import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

// Resolve fixtures relative to this script, not the CWD.
const __dirname = dirname(fileURLToPath(import.meta.url))

const fixtures = [
  "all-types-quiz.json",
  "python-basics-q6-fix.json",
]

const QUESTION_TYPES = [
  "choice",
  "boolean",
  "slider",
  "poll",
  "multiple-select",
  "type-answer",
  "sentence-builder",
]

let allValid = true

function validateQuestion(q, index) {
  const errors = []

  if (!q.type || !QUESTION_TYPES.includes(q.type)) {
    errors.push(`Invalid type: ${q.type}`)
  }
  if (!q.question || q.question.length < 1) {
    errors.push("Question text empty")
  }
  if (q.time == null || q.time < 5 || q.time > 120) {
    errors.push(`Invalid time: ${q.time} (must be 5-120)`)
  }
  if (q.cooldown == null || q.cooldown < 3 || q.cooldown > 15) {
    errors.push(`Invalid cooldown: ${q.cooldown} (must be 3-15)`)
  }

  // Type-specific validation
  if (q.type === "choice" || q.type === "boolean") {
    if (!q.answers || q.answers.length < 2) {
      errors.push(`Missing or insufficient answers (need >=2)`)
    }
    if (!q.solutions || q.solutions.length < 1) {
      errors.push("Missing solutions")
    }
  } else if (q.type === "slider") {
    if (q.min == null || q.max == null || q.correct == null) {
      errors.push("Slider missing min/max/correct")
    }
    if (q.min >= q.max) {
      errors.push(`Slider range invalid: min=${q.min} >= max=${q.max}`)
    }
    if (q.correct < q.min || q.correct > q.max) {
      errors.push(`Slider correct out of range: ${q.correct}`)
    }
  } else if (q.type === "poll") {
    if (!q.answers || q.answers.length < 2) {
      errors.push("Poll missing answers")
    }
    // Poll should have NO solutions
  } else if (q.type === "multiple-select") {
    if (!q.answers || q.answers.length < 2) {
      errors.push("Multiple-select missing answers")
    }
    if (!q.solutions || q.solutions.length < 2) {
      errors.push("Multiple-select needs >=2 solutions")
    }
  } else if (q.type === "type-answer") {
    if (!q.acceptedAnswers || q.acceptedAnswers.length < 1) {
      errors.push("Type-answer missing acceptedAnswers")
    }
    if (!q.matchMode || !["exact", "normalized", "fuzzy"].includes(q.matchMode)) {
      errors.push(`Invalid matchMode: ${q.matchMode}`)
    }
  } else if (q.type === "sentence-builder") {
    if (!q.chunks || q.chunks.length < 2 || q.chunks.length > 16) {
      errors.push(`Sentence-builder chunks out of range: ${q.chunks?.length} (need 2-16)`)
    }
  }

  return errors
}

fixtures.forEach((filename) => {
  const filepath = resolve(__dirname, filename)
  console.log(`\nValidating: ${filename}`)
  console.log("=".repeat(60))

  try {
    const data = JSON.parse(readFileSync(filepath, "utf-8"))

    // Check required top-level fields
    if (!data.subject || data.subject.length < 1) {
      console.log("✗ FAIL: Missing or empty subject")
      allValid = false
      return
    }

    if (!data.questions || !Array.isArray(data.questions) || data.questions.length < 1) {
      console.log("✗ FAIL: Missing or empty questions array")
      allValid = false
      return
    }

    console.log("✓ Valid JSON syntax")
    console.log(`  Subject: "${data.subject}"`)
    console.log(`  Questions: ${data.questions.length}`)

    // Validate each question
    let hasErrors = false
    data.questions.forEach((q, i) => {
      const errors = validateQuestion(q, i)
      if (errors.length > 0) {
        console.log(`  ✗ Question ${i + 1} (${q.type}): "${q.question.substring(0, 40)}${q.question.length > 40 ? "…" : ""}"`)
        errors.forEach((err) => console.log(`      - ${err}`))
        hasErrors = true
      } else {
        console.log(`  ✓ Question ${i + 1} (${q.type}): "${q.question.substring(0, 40)}${q.question.length > 40 ? "…" : ""}"`)
      }
    })

    if (!hasErrors) {
      console.log("✓ PASS")
    } else {
      console.log("✗ FAIL")
      allValid = false
    }
  } catch (error) {
    console.log("✗ FAIL (parse error)")
    console.log(`  ${error.message}`)
    allValid = false
  }
})

console.log("\n" + "=".repeat(60))
if (allValid) {
  console.log("✓ All fixtures valid")
  process.exit(0)
} else {
  console.log("✗ Some fixtures failed validation")
  process.exit(1)
}
