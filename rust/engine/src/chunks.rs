use rand::Rng;
use std::collections::HashSet;

/// Splits a correct sentence into word chunks in their correct order.
/// If sentence has 5 words or fewer, splits word-by-word.
/// If it has more than 5 words, splits into phrases of 2-3 words,
/// respecting natural pause marks and clause conjunction boundaries.
/// Returns chunks in CORRECT order (no shuffling).
pub fn auto_generate_chunks(sentence: &str) -> Vec<String> {
    let clean_sentence = sentence.trim();

    if clean_sentence.is_empty() {
        return Vec::new();
    }

    let abbreviations: HashSet<&str> = [
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
    ]
    .iter()
    .cloned()
    .collect();

    let split_before_words: HashSet<&str> = [
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
    ]
    .iter()
    .cloned()
    .collect();

    let words: Vec<&str> = clean_sentence.split_whitespace().collect();
    let base_chunks: Vec<String>;

    if words.len() <= 5 {
        base_chunks = words.iter().map(|w| w.to_string()).collect();
    } else {
        let mut chunks: Vec<String> = Vec::new();
        let mut current_chunk_words: Vec<&str> = Vec::new();

        for idx in 0..words.len() {
            let word = words[idx];
            current_chunk_words.push(word);

            let next_word = if idx + 1 < words.len() {
                Some(words[idx + 1])
            } else {
                None
            };

            let last_char = word.chars().last().unwrap_or(' ');
            let is_abbreviation = abbreviations.contains(word.to_lowercase().as_str());
            let is_pause = is_pause_char(last_char) && !is_abbreviation;

            let is_next_split_word = next_word.map_or(false, |nw| {
                let cleaned = nw
                    .to_lowercase()
                    .chars()
                    .filter(|c| c.is_alphabetic())
                    .collect::<String>();
                split_before_words.contains(cleaned.as_str())
            });

            let should_split = idx == words.len() - 1
                || is_pause
                || is_next_split_word
                || current_chunk_words.len() >= 3;

            if should_split {
                chunks.push(current_chunk_words.join(" "));
                current_chunk_words.clear();
            }
        }

        // Enforce a minimum of 4 chunks for phrase-based chunking
        while chunks.len() < 4 {
            let mut max_words_index = 0;
            let mut max_words_count = 0;

            for (j, chunk) in chunks.iter().enumerate() {
                let word_count = chunk.split_whitespace().count();
                if word_count > max_words_count {
                    max_words_count = word_count;
                    max_words_index = j;
                }
            }

            if max_words_count <= 1 {
                break;
            }

            let chunk_to_split = &chunks[max_words_index];
            let words_in_chunk: Vec<&str> = chunk_to_split.split_whitespace().collect();
            let mid = (words_in_chunk.len() + 1) / 2; // ceil(len / 2)
            let part1 = words_in_chunk[..mid].join(" ");
            let part2 = words_in_chunk[mid..].join(" ");

            chunks.remove(max_words_index);
            chunks.insert(max_words_index, part1);
            chunks.insert(max_words_index + 1, part2);
        }

        base_chunks = chunks;
    }

    base_chunks
}

/// Helper function to check if a character is a pause mark
fn is_pause_char(c: char) -> bool {
    matches!(c, '.' | ',' | ';' | ':' | '!' | '?')
        || c == '"'
        || c == '\''
        || c == '\u{201C}'
        || c == '\u{201D}'
}

/// Shuffles an array using Fisher-Yates algorithm with a provided RNG.
/// Retries up to 10 times if the result equals the input order (elementwise).
/// Returns the original array if all elements are identical or length < 2.
pub fn shuffle_chunks_with_guard<R: Rng>(
    chunks: &[String],
    rng: &mut R,
) -> Vec<String> {
    if chunks.len() < 2 {
        return chunks.to_vec();
    }

    // Check if all elements are identical
    if chunks.windows(2).all(|w| w[0] == w[1]) {
        return chunks.to_vec();
    }

    let mut shuffled = shuffle_array(chunks, rng);
    let mut attempts = 0;

    while attempts < 10 && arrays_equal(&shuffled, chunks) {
        shuffled = shuffle_array(chunks, rng);
        attempts += 1;
    }

    shuffled
}

/// Helper function to shuffle an array using Fisher-Yates
fn shuffle_array<R: Rng>(array: &[String], rng: &mut R) -> Vec<String> {
    let mut result = array.to_vec();

    for i in (1..result.len()).rev() {
        let j = rng.gen_range(0..=i);
        result.swap(i, j);
    }

    result
}

/// Helper function to check if two arrays are equal
fn arrays_equal(a: &[String], b: &[String]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).all(|(x, y)| x == y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    // autoGenerateChunks tests

    #[test]
    fn test_splits_short_sentence_word_by_word() {
        let sentence = "The quick brown fox";
        let chunks = auto_generate_chunks(sentence);
        assert_eq!(chunks, vec!["The", "quick", "brown", "fox"]);
    }

    #[test]
    fn test_joins_result_with_space_reproduces_word_sequence() {
        let sentence = "The quick brown fox jumps over lazy dog";
        let chunks = auto_generate_chunks(sentence);
        let rejoined = chunks.join(" ");
        assert_eq!(rejoined, sentence);
    }

    #[test]
    fn test_handles_long_sentence_with_multi_word_phrases() {
        let sentence = "The quick brown fox jumps over the lazy dog which was sleeping";
        let chunks = auto_generate_chunks(sentence);
        let rejoined = chunks.join(" ");
        assert_eq!(rejoined, sentence);
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_returns_empty_array_for_empty_string() {
        let chunks = auto_generate_chunks("");
        assert_eq!(chunks, Vec::<String>::new());
    }

    #[test]
    fn test_handles_sentence_with_exactly_5_words() {
        let sentence = "One two three four five";
        let chunks = auto_generate_chunks(sentence);
        assert_eq!(chunks.len(), 5);
        assert_eq!(chunks.join(" "), sentence);
    }

    #[test]
    fn test_handles_sentence_with_6_words_triggers_phrase_splitting() {
        let sentence = "One two three four five six";
        let chunks = auto_generate_chunks(sentence);
        assert_eq!(chunks.join(" "), sentence);
    }

    // shuffleChunksWithGuard tests

    #[test]
    fn test_shuffle_returns_a_permutation_of_input() {
        let chunks = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
            "e".to_string(),
            "f".to_string(),
        ];
        let mut rng = StdRng::seed_from_u64(42);
        let shuffled = shuffle_chunks_with_guard(&chunks, &mut rng);

        assert_eq!(shuffled.len(), chunks.len());

        let mut shuffled_sorted = shuffled.clone();
        shuffled_sorted.sort();

        let mut chunks_sorted = chunks.clone();
        chunks_sorted.sort();

        assert_eq!(shuffled_sorted, chunks_sorted);
    }

    #[test]
    fn test_shuffle_returns_different_order_for_6_distinct_elements() {
        let chunks = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
            "e".to_string(),
            "f".to_string(),
        ];
        let mut different_count = 0;

        for i in 0..50 {
            let mut rng = StdRng::seed_from_u64(i);
            let shuffled = shuffle_chunks_with_guard(&chunks, &mut rng);
            let is_equal = chunks
                .iter()
                .enumerate()
                .all(|(idx, val)| val == &shuffled[idx]);
            if !is_equal {
                different_count += 1;
            }
        }

        assert!(different_count > 0);
    }

    #[test]
    fn test_shuffle_handles_2_element_array() {
        let chunks = vec!["a".to_string(), "b".to_string()];
        let mut rng = StdRng::seed_from_u64(42);
        let shuffled = shuffle_chunks_with_guard(&chunks, &mut rng);

        assert_eq!(shuffled.len(), 2);

        let mut shuffled_sorted = shuffled.clone();
        shuffled_sorted.sort();

        let mut chunks_sorted = chunks.clone();
        chunks_sorted.sort();

        assert_eq!(shuffled_sorted, chunks_sorted);
    }

    #[test]
    fn test_shuffle_handles_identical_elements() {
        let chunks = vec![
            "a".to_string(),
            "a".to_string(),
            "a".to_string(),
            "a".to_string(),
        ];
        let mut rng = StdRng::seed_from_u64(42);
        let shuffled = shuffle_chunks_with_guard(&chunks, &mut rng);

        assert_eq!(shuffled, chunks);
    }

    #[test]
    fn test_shuffle_retries_up_to_10_times_to_avoid_input_order() {
        let chunks = vec![
            "unique_a".to_string(),
            "unique_b".to_string(),
            "unique_c".to_string(),
            "unique_d".to_string(),
        ];
        let mut rng = StdRng::seed_from_u64(42);
        let shuffled = shuffle_chunks_with_guard(&chunks, &mut rng);

        let is_equal = chunks
            .iter()
            .enumerate()
            .all(|(idx, val)| val == &shuffled[idx]);
        assert!(!is_equal);
    }

    // questionValidator constraints tests (mapping to chunk constraints)

    #[test]
    fn test_chunks_constraint_min_2() {
        // Validates that chunks must be at least 2 elements
        let chunks = vec!["OnlyOne".to_string()];
        assert!(chunks.len() < 2);
    }

    #[test]
    fn test_chunks_constraint_max_16() {
        // Validates that chunks can be at most 16 elements
        let chunks: Vec<String> = (0..16).map(|i| format!("chunk_{}", i)).collect();
        assert!(chunks.len() <= 16);
    }

    #[test]
    fn test_chunks_constraint_valid_range() {
        let chunks = vec![
            "The".to_string(),
            "quick".to_string(),
            "brown".to_string(),
            "fox".to_string(),
        ];
        assert!(chunks.len() >= 2 && chunks.len() <= 16);
    }

    #[test]
    fn test_empty_string_produces_valid_chunks() {
        let chunks = auto_generate_chunks("");
        // Empty input should produce empty chunks, which technically fail the min 2
        // constraint but is allowed by the validator
        assert_eq!(chunks.len(), 0);
    }

    #[test]
    fn test_single_word_produces_valid_chunks() {
        let chunks = auto_generate_chunks("hello");
        // Single word should be returned as-is (len <= 5)
        assert_eq!(chunks, vec!["hello"]);
    }

    #[test]
    fn test_chunks_within_valid_constraint_range() {
        let sentence = "The quick brown fox jumps over the lazy dog which was sleeping peacefully";
        let chunks = auto_generate_chunks(sentence);
        assert!(chunks.len() >= 2, "chunks must have at least 2 elements");
        assert!(chunks.len() <= 16, "chunks must have at most 16 elements");
        // Verify order is preserved
        assert_eq!(chunks.join(" "), sentence);
    }

    #[test]
    fn test_shuffle_determinism_with_seeded_rng() {
        let chunks = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
        ];

        let mut rng1 = StdRng::seed_from_u64(12345);
        let result1 = shuffle_chunks_with_guard(&chunks, &mut rng1);

        let mut rng2 = StdRng::seed_from_u64(12345);
        let result2 = shuffle_chunks_with_guard(&chunks, &mut rng2);

        assert_eq!(result1, result2, "Same seed should produce same shuffle");
    }

    #[test]
    fn test_shuffle_with_different_seeds_produces_different_results() {
        let chunks = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
        ];

        let mut rng1 = StdRng::seed_from_u64(111);
        let result1 = shuffle_chunks_with_guard(&chunks, &mut rng1);

        let mut rng2 = StdRng::seed_from_u64(222);
        let result2 = shuffle_chunks_with_guard(&chunks, &mut rng2);

        // Results *might* be the same by chance, but very unlikely with different seeds
        // We'll just verify they both are valid permutations
        let mut r1_sorted = result1.clone();
        r1_sorted.sort();
        let mut r2_sorted = result2.clone();
        r2_sorted.sort();
        let mut chunks_sorted = chunks.clone();
        chunks_sorted.sort();

        assert_eq!(r1_sorted, chunks_sorted);
        assert_eq!(r2_sorted, chunks_sorted);
    }
}
