/**
 * Splits a correct sentence into word chunks in their correct order.
 * If sentence has 5 words or fewer, splits word-by-word.
 * If it has more than 5 words, splits into phrases of 2-3 words,
 * respecting natural pause marks and clause conjunction boundaries.
 * Returns chunks in CORRECT order (no shuffling).
 */
export function autoGenerateChunks(sentence: string): string[] {
  const cleanSentence = sentence.trim()

  if (!cleanSentence) {
    return []
  }

  const abbreviations = new Set([
    // English
    "mr.",
    "mrs.",
    "dr.",
    "ms.",
    "vs.",
    "e.g.",
    "i.e.",
    "etc.",
    // Spanish
    "sr.",
    "sra.",
    "srta.",
    "dra.",
    "p.ej.",
    "p.",
    "ej.",
    "ee.uu.",
    // French
    "m.",
    "mme.",
    "ex.",
    // German
    "fr.",
    "hr.",
    "z.b.",
    "d.h.",
    "u.a.",
    "bzw.",
    "ca.",
    "v.a.",
    "sog.",
    // Italian
    "sig.",
    "sig.ra",
    "dott.",
    "prof.",
    "prof.ssa",
    "es.",
    "ecc.",
  ])

  const splitBeforeWords = new Set([
    // Conjunctions
    "and",
    "but",
    "or",
    "because",
    "so",
    "although",
    "while",
    "since",
    "unless",
    "until",
    "if",
    "when",
    "yet",
    // Articles
    "a",
    "an",
    "the",
    // Demonstratives
    "this",
    "that",
    "these",
    "those",
    // Prepositions
    "in",
    "on",
    "at",
    "to",
    "for",
    "with",
    "by",
    "from",
    "about",
    "of",
    "into",
    "onto",
    "through",
    "during",
    "before",
    "after",
    // Quantifiers & Distributives
    "some",
    "any",
    "many",
    "few",
    "all",
    "each",
    "every",
    "both",
    "either",
    "neither",
    // Korean
    "그리고",
    "하지만",
    "그러나",
    "그렇지만",
    "그래서",
    "그러니까",
    "왜냐하면",
    "그러면",
    "그렇다면",
    "또는",
    "혹은",
    "아니면",
    "게다가",
    "이",
    "그",
    "저",
    "모든",
    "몇몇",
    "어떤",
    "각",
    "여러",
    "많은",
    // Spanish
    "y",
    "o",
    "pero",
    "porque",
    "entonces",
    "aunque",
    "si",
    "cuando",
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "este",
    "esta",
    "ese",
    "esa",
    "aquel",
    "aquella",
    "en",
    "de",
    "a",
    "para",
    "por",
    "con",
    "sin",
    "sobre",
    // French
    "et",
    "ou",
    "mais",
    "parce",
    "donc",
    "quand",
    "comme",
    "le",
    "les",
    "une",
    "ce",
    "cette",
    "ces",
    "pour",
    "par",
    "avec",
    "sans",
    "dans",
    "sur",
    // German
    "und",
    "aber",
    "oder",
    "weil",
    "dass",
    "wenn",
    "als",
    "obwohl",
    "der",
    "die",
    "das",
    "ein",
    "eine",
    "dieser",
    "diese",
    "dieses",
    "jener",
    "von",
    "zu",
    "für",
    "mit",
    "bei",
    "nach",
    "aus",
    // Italian
    "e",
    "ma",
    "perché",
    "quindi",
    "se",
    "quando",
    "il",
    "i",
    "gli",
    "le",
    "questo",
    "questa",
    "quello",
    "quella",
    "di",
    "da",
    "su",
    "tra",
    "fra",
  ])

  const words = cleanSentence.split(/\s+/u)
  let baseChunks: string[] = []

  if (words.length <= 5) {
    baseChunks = words
  } else {
    const chunks: string[] = []
    let currentChunkWords: string[] = []

    for (let idx = 0; idx < words.length; idx += 1) {
      const word = words[idx]!
      currentChunkWords.push(word)

      const nextWord = words[idx + 1]
      const lastChar = word.slice(-1)
      const isAbbreviation = abbreviations.has(word.toLowerCase())
      const isPause = /[.,;:!?""'']/u.test(lastChar) && !isAbbreviation

      const isNextSplitWord =
        nextWord &&
        splitBeforeWords.has(nextWord.toLowerCase().replace(/[^\p{L}]/gu, ""))

      const shouldSplit =
        idx === words.length - 1 ||
        isPause ||
        isNextSplitWord ||
        currentChunkWords.length >= 3

      if (shouldSplit) {
        chunks.push(currentChunkWords.join(" "))
        currentChunkWords = []
      }
    }

    // Enforce a minimum of 4 chunks for phrase-based chunking
    while (chunks.length < 4) {
      let maxWordsIndex = -1
      let maxWordsCount = 0

      for (let j = 0; j < chunks.length; j += 1) {
        const wordCount = chunks[j]!.split(/\s+/u).length

        if (wordCount > maxWordsCount) {
          maxWordsCount = wordCount
          maxWordsIndex = j
        }
      }

      if (maxWordsCount <= 1) {
        break
      }

      const chunkToSplit = chunks[maxWordsIndex]!
      const wordsInChunk = chunkToSplit.split(/\s+/u)
      const mid = Math.ceil(wordsInChunk.length / 2)
      const part1 = wordsInChunk.slice(0, mid).join(" ")
      const part2 = wordsInChunk.slice(mid).join(" ")

      chunks.splice(maxWordsIndex, 1, part1, part2)
    }

    baseChunks = chunks
  }

  return baseChunks
}

/**
 * Shuffles an array using Fisher-Yates algorithm.
 * Retries up to 10 times if the result equals the input order (elementwise).
 * Pure function with no side effects.
 */
export function shuffleChunksWithGuard(chunks: string[]): string[] {
  const shuffleArray = <T,>(array: T[]): T[] => {
    const next = [...array]

    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = next[i]!
      next[i] = next[j]!
      next[j] = temp
    }

    return next
  }

  const isEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) {
      return false
    }
    return a.every((val, idx) => val === b[idx])
  }

  let shuffled = shuffleArray(chunks)
  let attempts = 0

  while (attempts < 10 && isEqual(shuffled, chunks)) {
    shuffled = shuffleArray(chunks)
    attempts += 1
  }

  return shuffled
}
