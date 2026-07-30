import { describe, it, expect } from "vitest"
import {
  TYPE_META,
  TYPE_META_BY_ID,
  TYPE_CATEGORIES,
  type QuestionTypeKey,
} from "./questionTypeMeta"
import { QUESTION_TYPES } from "@razzoozle/common/constants"

describe("questionTypeMeta", () => {
  it("TYPE_META contains exactly 18 entries", () => {
    // 17 canonical types + vokabelliste pseudo type
    expect(TYPE_META.length).toBe(18)
  })

  it("every QUESTION_TYPES entry has a TYPE_META entry", () => {
    const typeIds = new Set(TYPE_META.map((m) => m.id))
    for (const questionType of QUESTION_TYPES) {
      expect(typeIds.has(questionType)).toBe(true)
    }
  })

  it("vokabelliste pseudo type is in TYPE_META", () => {
    const typeIds = new Set(TYPE_META.map((m) => m.id))
    expect(typeIds.has("vokabelliste")).toBe(true)
  })

  it("TYPE_META contains no unknown IDs", () => {
    const knownTypes = new Set([...QUESTION_TYPES, "vokabelliste"] as const)
    for (const meta of TYPE_META) {
      expect(knownTypes.has(meta.id as QuestionTypeKey)).toBe(true)
    }
  })

  it("TYPE_META_BY_ID is derived correctly from TYPE_META", () => {
    expect(Object.keys(TYPE_META_BY_ID).length).toBe(TYPE_META.length)
    for (const meta of TYPE_META) {
      expect(TYPE_META_BY_ID[meta.id]).toEqual(meta)
    }
  })

  it("all TYPE_META entries have required fields", () => {
    for (const meta of TYPE_META) {
      expect(meta.id).toBeDefined()
      expect(meta.icon).toBeDefined()
      expect(meta.labelKey).toBeDefined()
      expect(meta.descKey).toBeDefined()
      expect(meta.category).toBeDefined()
    }
  })

  it("requiresKlassen is set only for mathematik, wortarten, vokabelliste", () => {
    const requiresKlassenIds = new Set(
      TYPE_META.filter((m) => m.requiresKlassen).map((m) => m.id),
    )
    expect(requiresKlassenIds).toEqual(
      new Set(["mathematik", "wortarten", "vokabelliste"]),
    )
  })

  it("isPseudoType is set only for vokabelliste", () => {
    const pseudoTypes = TYPE_META.filter((m) => m.isPseudoType)
    expect(pseudoTypes.length).toBe(1)
    expect(pseudoTypes[0]?.id).toBe("vokabelliste")
  })

  it("TYPE_CATEGORIES contains exactly 5 categories", () => {
    expect(TYPE_CATEGORIES.length).toBe(5)
  })

  it("TYPE_CATEGORIES has correct order: basic, survey, numeric, text, arrangement", () => {
    expect(TYPE_CATEGORIES.map((c) => c.id)).toEqual([
      "basic",
      "survey",
      "numeric",
      "text",
      "arrangement",
    ])
  })

  it("all TYPE_META categories are in TYPE_CATEGORIES", () => {
    const categoryIds = new Set(TYPE_CATEGORIES.map((c) => c.id))
    const typeCategoryIds = new Set(TYPE_META.map((m) => m.category))
    for (const categoryId of typeCategoryIds) {
      expect(categoryIds.has(categoryId)).toBe(true)
    }
  })

  it("category distribution matches design spec", () => {
    const categoryDistribution: Record<string, string[]> = {}
    for (const meta of TYPE_META) {
      if (!categoryDistribution[meta.category]) {
        categoryDistribution[meta.category] = []
      }
      categoryDistribution[meta.category]!.push(meta.id)
    }

    expect(categoryDistribution.basic).toContain("choice")
    expect(categoryDistribution.basic).toContain("boolean")
    expect(categoryDistribution.basic).toContain("multiple-select")

    expect(categoryDistribution.survey).toContain("poll")
    expect(categoryDistribution.survey).toContain("word-cloud")
    expect(categoryDistribution.survey).toContain("brainstorm")
    expect(categoryDistribution.survey).toContain("confidence")
    expect(categoryDistribution.survey).toContain("micro-lesson")

    expect(categoryDistribution.numeric).toContain("slider")
    expect(categoryDistribution.numeric).toContain("mathematik")

    expect(categoryDistribution.text).toContain("type-answer")
    expect(categoryDistribution.text).toContain("fill-blank")
    expect(categoryDistribution.text).toContain("sentence-builder")
    expect(categoryDistribution.text).toContain("wortarten")
    expect(categoryDistribution.text).toContain("vokabelliste")

    expect(categoryDistribution.arrangement).toContain("sequencing")
    expect(categoryDistribution.arrangement).toContain("matching")
    expect(categoryDistribution.arrangement).toContain("drop-pin")
  })
})
