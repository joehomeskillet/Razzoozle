import { describe, it, expect } from "vitest"
import { questionValidator } from "./quizz"

describe("questionValidator - fill-blank", () => {
  it("validates a correct fill-blank question", () => {
    const validFillBlank = {
      question: "Complete the sentence: The capital of France is ____.",
      type: "fill-blank" as const,
      segments: ["The capital of France is ", "."],
      slots: [
        {
          options: ["Paris", "London", "Berlin", "Madrid"],
          correctIndex: 0,
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(validFillBlank)
    expect(result.success).toBe(true)
  })

  it("validates a multi-slot fill-blank question", () => {
    const validMultiSlotFillBlank = {
      question: "The ____ ____ lives in the jungle.",
      type: "fill-blank" as const,
      segments: ["The ", " ", " lives in the jungle."],
      slots: [
        {
          options: ["big", "small", "fast"],
          correctIndex: 0,
        },
        {
          options: ["tiger", "lion", "elephant"],
          correctIndex: 0,
        },
      ],
      cooldown: 5,
      time: 25,
    }

    const result = questionValidator.safeParse(validMultiSlotFillBlank)
    expect(result.success).toBe(true)
  })

  it("rejects fill-blank with no slots", () => {
    const invalidFillBlank = {
      question: "Complete the sentence.",
      type: "fill-blank" as const,
      segments: ["Complete the sentence."],
      slots: [],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidFillBlank)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.fillBlankMinSlots")
    }
  })

  it("rejects fill-blank with incorrect segment count", () => {
    const invalidFillBlank = {
      question: "Complete the sentence.",
      type: "fill-blank" as const,
      segments: ["The ", " ", " lives in the jungle.", " Extra segment."], // Too many segments
      slots: [
        {
          options: ["tiger", "lion"],
          correctIndex: 0,
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidFillBlank)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.fillBlankSegmentCount")
    }
  })

  it("rejects fill-blank with invalid correctIndex", () => {
    const invalidFillBlank = {
      question: "Complete the sentence.",
      type: "fill-blank" as const,
      segments: ["The capital is ", "."],
      slots: [
        {
          options: ["Paris", "London"],
          correctIndex: 5, // Invalid index
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidFillBlank)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.slotCorrectIndex")
    }
  })
})

describe("questionValidator - matching", () => {
  it("validates a correct matching question", () => {
    const validMatching = {
      question: "Match the countries with their capitals.",
      type: "matching" as const,
      leftItems: [
        {
          label: "France",
          options: ["Paris", "London", "Berlin"],
          correctIndex: 0,
        },
        {
          label: "Germany",
          options: ["Paris", "London", "Berlin"],
          correctIndex: 2,
        },
      ],
      cooldown: 5,
      time: 30,
    }

    const result = questionValidator.safeParse(validMatching)
    expect(result.success).toBe(true)
  })

  it("rejects matching with no leftItems", () => {
    const invalidMatching = {
      question: "Match the items.",
      type: "matching" as const,
      leftItems: [],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidMatching)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.matchingMinItems")
    }
  })

  it("rejects matching with invalid correctIndex", () => {
    const invalidMatching = {
      question: "Match the items.",
      type: "matching" as const,
      leftItems: [
        {
          label: "Item 1",
          options: ["Option A", "Option B"],
          correctIndex: 5, // Invalid index
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidMatching)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.slotCorrectIndex")
    }
  })
})

describe("questionValidator - drop-pin", () => {
  it("validates a correct drop-pin question", () => {
    const validDropPin = {
      question: "Click on the capital of France.",
      type: "drop-pin" as const,
      media: {
        type: "image" as const,
        url: "/media/france-map.jpg",
      },
      hotspots: [
        {
          x: 0.2,
          y: 0.3,
          w: 0.1,
          h: 0.1,
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(validDropPin)
    expect(result.success).toBe(true)
  })

  it("validates drop-pin with multiple hotspots", () => {
    const validMultiHotspotDropPin = {
      question: "Click on all the European countries.",
      type: "drop-pin" as const,
      media: {
        type: "image" as const,
        url: "/media/world-map.jpg",
      },
      hotspots: [
        {
          x: 0.2,
          y: 0.3,
          w: 0.1,
          h: 0.1,
        },
        {
          x: 0.4,
          y: 0.5,
          w: 0.1,
          h: 0.1,
        },
      ],
      cooldown: 5,
      time: 25,
    }

    const result = questionValidator.safeParse(validMultiHotspotDropPin)
    expect(result.success).toBe(true)
  })

  it("rejects drop-pin without media", () => {
    const invalidDropPin = {
      question: "Click on the capital.",
      type: "drop-pin" as const,
      hotspots: [
        {
          x: 0.2,
          y: 0.3,
          w: 0.1,
          h: 0.1,
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidDropPin)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.dropPinMediaRequired")
    }
  })

  it("rejects drop-pin with no hotspots", () => {
    const invalidDropPin = {
      question: "Click on the capital.",
      type: "drop-pin" as const,
      media: {
        type: "image" as const,
        url: "/media/map.jpg",
      },
      hotspots: [],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidDropPin)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.dropPinMinHotspots")
    }
  })

  it("rejects drop-pin with hotspot out of bounds", () => {
    const invalidDropPin = {
      question: "Click on the capital.",
      type: "drop-pin" as const,
      media: {
        type: "image" as const,
        url: "/media/map.jpg",
      },
      hotspots: [
        {
          x: 0.9,
          y: 0.9,
          w: 0.2, // This makes it go beyond 1.0
          h: 0.2, // This makes it go beyond 1.0
        },
      ],
      cooldown: 5,
      time: 20,
    }

    const result = questionValidator.safeParse(invalidDropPin)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("errors:quizz.dropPinHotspotBounds")
    }
  })
})