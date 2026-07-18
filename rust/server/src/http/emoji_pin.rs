use axum::Json;
use rand::seq::SliceRandom;
use serde::Serialize;

pub const EMOJI_PIN_SET: &[(&str, &str)] = &[
    ("🐱", "katze"), ("🐶", "hund"), ("🐭", "maus"), ("🐹", "hamster"), 
    ("🐰", "hase"), ("🦊", "fuchs"), ("🐻", "baer"), ("🐼", "panda"), 
    ("🐨", "koala"), ("🐯", "tiger"), ("🦁", "loewe"), ("🐮", "kuh"), 
    ("🐷", "schwein"), ("🐸", "frosch"), ("🐵", "affe"), ("🐔", "huhn"), 
    ("🐧", "pinguin"), ("🐦", "vogel"), ("🐤", "kueken"), ("🦆", "ente"), 
    ("🦉", "eule"), ("🦅", "adler"), ("🦇", "fledermaus"), ("🐝", "biene"), 
    ("🐛", "wurm"), ("🦋", "schmetterling"), ("🐌", "schnecke"), ("🐞", "marienkaefer"), 
    ("🐜", "ameise"), ("🦟", "muecke"), ("🐢", "schildkroete"), ("🐍", "schlange"), 
    ("🐙", "krake"), ("🐚", "muschel"), ("🐠", "fisch"), ("🐟", "fisch2"), 
    ("🐡", "kugelfisch"), ("🦈", "hai"), ("🐬", "delphin"), ("🐳", "wal"), 
    ("🐋", "wal2"), ("🦕", "dinosaurier"), ("🦖", "dinosaurier2"), ("🦴", "knochen"), 
    ("🦃", "truthahn"), ("🦚", "pfau"), ("🦜", "papagei"), ("🦢", "schwan"), 
    ("🦗", "grille"), ("🕷️", "spinne"), ("🦂", "skorpion"), ("🐈", "katze2"), 
    ("🐓", "henne"), ("🦒", "giraffe"), ("🦓", "zebra"), ("🦍", "gorilla"), 
    ("🦧", "orang_utan"), ("🐘", "elefant"), ("🦛", "flusspferd"), ("🦏", "nashorn"), 
    ("🐁", "feldmaus"), ("🐀", "ratte"), ("🐿️", "eichhorn"), ("🦌", "hirsch"), 
    ("🦬", "bueffel"), ("🐃", "wasserbueffel"), ("🐄", "rind"), ("🐎", "pferd"), 
    ("🐖", "schwein2"), ("🐏", "schaf"), ("🐑", "schaf2"), ("🐒", "affe3"), 
    ("🐅", "tiger2"), ("🐆", "leopard"), ("🐪", "kamel"), ("🐫", "kamel2"), 
    ("🚗", "auto"), ("🚕", "taxi"), ("🚙", "auto2"), ("🚌", "bus"), 
    ("🚎", "bus2"), ("🏎️", "rennwagen"), ("🚓", "polizeiauto"), ("🚑", "krankenwagen"), 
    ("🚒", "feuerwehr"), ("🚐", "minibus"), ("🛻", "pick_up"), ("🚚", "lastwagen"), 
    ("🚛", "lastwagen2"), ("🚜", "traktor"), ("🏍️", "motorrad"), ("🛵", "roller"), 
    ("🦯", "blindenstock"), ("🦽", "handbike"), ("🦼", "elektroroller"), ("🛺", "tuk_tuk"), 
    ("🚲", "fahrrad"), ("🛴", "skateboard"), ("🛹", "longboard"), ("🛼", "rollschuhe"), 
    ("🛶", "kanu"), ("⛵", "segelboot"), ("🚤", "schnellboot"), ("🛳️", "schiff"), 
    ("⛴️", "faehre"), ("🛥️", "motorboot"), ("🎣", "angeln"), ("⛽", "tankstelle"), 
    ("✈️", "flugzeug"), ("🛩️", "kleinflugzeug"), ("💺", "flugzeugsitz"), ("🛫", "start"), 
    ("🛬", "landung"), ("🛰️", "satellit"), ("🚁", "hubschrauber"), ("🚟", "seilbahn"), 
    ("🚠", "bergbahn"), ("🚡", "fahrstuhl"), ("🛣️", "autobahn"), ("🛤️", "bahnstrecke"), 
    ("🛢️", "erdoeltank"), ("🚨", "polizeisirene"), ("🚥", "verkehrsampel"), ("🚦", "ampel"), 
    ("🚧", "baustelle_zeichen"), ("🍎", "apfel"), ("🍊", "orange"), ("🍋", "zitrone"), 
    ("🍌", "banane"), ("🍉", "wassermelone"), ("🍇", "trauben"), ("🍓", "erdbeere"), 
    ("🍈", "melone"), ("🍒", "kirsche"), ("🍑", "pfirsich"), ("🥭", "mango"), 
    ("🍍", "ananas"), ("🥥", "kokosnuss"), ("🥑", "avocado"), ("🍅", "tomate"), 
    ("🍆", "aubergine"), ("🥦", "brokkoli"), ("🥬", "salat"), ("🥒", "gurke"), 
    ("🌶️", "chili"), ("🌽", "mais"), ("🥕", "karotte"), ("🥔", "kartoffel"), 
    ("🍠", "susskartoffel"), ("🥐", "croissant"), ("🍞", "brot"), ("🥖", "baguette"), 
    ("🥨", "brezel"), ("🧀", "kaese"), ("🥚", "ei"), ("🍳", "spiegeleier"), 
    ("🧈", "butter"), ("🥞", "pfannkuchen"), ("🥓", "speck"), ("🥩", "fleisch"), 
    ("🍗", "chicken"), ("🍖", "keule"), ("🌭", "hotdog"), ("🍔", "hamburger"), 
    ("🍟", "pommes"), ("🍕", "pizza"), ("🥪", "sandwich"), ("🥙", "gyros"), 
    ("🧆", "falafel"), ("🌮", "taco"), ("🌯", "burrito"), ("🥗", "salat2"), 
    ("🥘", "paella"), ("🥫", "dosenessen"), ("🍝", "pasta"), ("🍜", "nudelsuppe"), 
    ("🍲", "eintopf"), ("🍛", "curryreis"), ("🍣", "sushi"), ("🍱", "bento"), 
    ("🥟", "ravioli"), ("🦪", "auster"), ("🍤", "garnele"), ("🍙", "reisball"), 
    ("🍚", "reis"), ("🍿", "popcorn"), ("🍩", "donut"), ("🍪", "keks"), 
    ("🎂", "kuchen"), ("🍰", "torte"), ("🧁", "macarons"), ("🍫", "schokolade"), 
    ("🍬", "bonbon"), ("🍭", "lutscher"), ("🍮", "pudding"), ("🍯", "honig"), 
    ("🍼", "flasche"), ("☕", "kaffee"), ("🍵", "tee"), ("🏠", "haus"), 
    ("🏡", "hauschen"), ("🏘️", "haeuser"), ("🏚️", "huette"), ("🏗️", "baustelle"), 
    ("🏭", "fabrik"), ("🏢", "buerogeb"), ("🏬", "kaufhaus"), ("🏣", "japanhaus"), 
    ("🏤", "postamt"), ("🏥", "krankenhaus"), ("🏦", "bank"), ("🏨", "hotel"), 
    ("🏪", "laden"), ("🏫", "schule"), ("🏩", "liebesnest"), ("💒", "kapelle"), 
    ("🏛️", "museum"), ("⛪", "kirche"), ("🕌", "moschee"), ("🕍", "synagoge"), 
    ("🛕", "tempel"), ("🕋", "kaaba"), ("⌚", "uhr"), ("📱", "handy"), 
    ("📲", "telefon"), ("💻", "computer"), ("⌨️", "tastatur"), ("🖥️", "monitor"), 
    ("🖨️", "drucker"), ("🖱️", "maus"), ("🖲️", "trackball"), ("🕹️", "joystick"), 
    ("🗜️", "spannzange"), ("💽", "festplatte"), ("💾", "diskette"), ("💿", "cd"), 
    ("📀", "dvd"), ("🧮", "rechenmaschine"), ("🎥", "kamera"), ("🎬", "filmrolle"), 
    ("📺", "fernseher"), ("📷", "fotoapparat"), ("📸", "foto"), ("📹", "videokamera"), 
    ("🎞️", "filmstreifen"), ("📼", "videokassette"), ("🔍", "lupe"), ("🔎", "lupe2"), 
    ("🕯️", "kerze"), ("💡", "glühbirne"), ("🔦", "taschenlampe"), ("🏮", "laterne"), 
    ("📔", "notizbuch"), ("📕", "rotesbuch"), ("📖", "offenesbuch"), ("📝", "schreiben"), 
    ("✏️", "bleistift"), ("✒️", "tintenstift"), ("🖋️", "feder"), ("🖊️", "kugelschreiber"), 
    ("🖌️", "pinsel"), ("🖍️", "wachsmalstift"), ("📏", "lineal"), ("📐", "geodreieck"), 
    ("📌", "reißnagel"), ("📍", "nadel"), ("✂️", "schere"), ("🗃️", "kartothekkarte"), 
    ("🗳️", "stimmbox"), ("🗂️", "karteikasten"), ("🗞️", "zeitung"), ("🌲", "tannenbaum"), 
    ("🌳", "baum"), ("🌴", "palme"), ("🌵", "kaktus"), ("🌾", "getreide"), 
    ("💐", "blumenstrauss"), ("🌷", "tulpe"), ("🌹", "rose"), ("🥀", "welkerose"), 
    ("🌻", "sonnenblume"), ("🌞", "sonne"), ("🌝", "vollmond"), ("🌛", "mondsichel"), 
    ("🌜", "mondsichel2"), ("🌚", "neumond"), ("🌕", "vollmond2"), ("🌖", "abnehmendmond"), 
    ("🌗", "letztesviertel"), ("🌘", "neumond2"), ("🌑", "neumond3"), ("🌒", "zunehmendmond"), 
    ("🌓", "erstes_viertel"), ("🌔", "mondzu"), ("⭐", "stern"), ("🌟", "glitzerstern"), 
    ("✨", "funkeln"), ("⚡", "blitz"), ("☄️", "komet"), ("💥", "explosion"), 
    ("🔥", "feuer"), ("🌪️", "tornado"), ("🌈", "regenbogen"), ("☀️", "sonne2"), 
    ("🌤️", "sonnig"), ("⛅", "teilsbewoelkt"), ("🌥️", "bewoelkt"), ("☁️", "wolke"), 
    ("🌦️", "regen"), ("🌧️", "gewitter"), ("⛈️", "sturm"), ("🌩️", "donner"), 
    ("🌨️", "schnee"), ("❄️", "schneeflocke"), ("☃️", "schneemann"), ("⛄", "schneemann2"), 
    ("🌬️", "wind"), ("💨", "luft"), ("💧", "wasser"), ("💦", "tropfen"), 
    ("☔", "regenschirm"), ("🍏", "gruener_apfel"), ("⚽", "fussball"), ("⚾", "baseball"), 
    ("🥎", "softball"), ("🎾", "tennis"), ("🏐", "volleyball"), ("🏈", "american_football"), 
    ("🏉", "rugby"), ("🥏", "kricket"), ("🎳", "bowling"), ("🏓", "tischtennis"), 
    ("🏸", "badminton"), ("🥅", "tor"), ("⛳", "golfplatz"), ("⛸️", "eislaufen"), 
    ("🎽", "laufshirt"), ("🎿", "ski"), ("⛷️", "skifahrer"), ("🏂", "snowboard"), 
    ("🪂", "fallschirm"), ("🏋️", "gewichtheber"), ("🤼", "ringler"), ("🤸", "turner"), 
    ("⛹️", "basketballspieler"), ("🏌️", "golfer"), ("🏄", "surfer"), ("🏊", "schwimmer"), 
    ("🤽", "wasserballspieler"), ("🚣", "ruderer"), ("🧗", "kletterer"), ("🚴", "radfahrer"), 
    ("🚵", "mountainbiker"), ("🎯", "schiessziel"), ("🪀", "diabolo"), ("🪁", "drachen"), 
    ("🎪", "zirkuszelt"), ("🎨", "pinsel"), ("🎤", "mikrofon"), ("🎧", "kopfhoerer"), 
    ("🎼", "noten"), ("🎵", "musiknote"), ("🎶", "musiknoten"), ("🎹", "klavier"), 
    ("🥁", "schlagzeug"), ("🎷", "saxophon"), ("🎺", "trompete"), ("🎸", "gitarre"), 
    ("🎻", "geige"), ("🎩", "zylinderhut"), ("👑", "krone"), ("🎭", "theater"), 
    ("🎄", "weihnachtsbaum"), ("🎆", "feuerwerk"), ("🎇", "feuerzauber"), ("🎈", "luftballon"), 
    ("🎉", "konfetti"), ("🎊", "konfetti2"), ("🎁", "geschenk"), ("🎀", "schleife"), 
    ("🏆", "preis"), ("🏅", "medaille"), ("🥇", "gold"), ("🥈", "silber"), 
    ("🥉", "bronze"), ("💫", "schwindel"), ("🔔", "glocke"), ("🔕", "stummeglocke"), 
    ("📢", "lautsprecher"), ("📣", "megaphon"), ("📯", "horn"), ("📻", "radio2"), 
    ("🎫", "ticket"), ("🎲", "wuerfel"), ("🎰", "slotmaschine"), ("🧩", "puzzle"), 
    ("🚀", "rakete"), ("🛸", "ufo"), ("🔭", "teleskop"), ("🔬", "mikroskop"), 
    ("💎", "diamant"), ("💍", "ring"), ("🎖️", "medaille2"), ("🎗️", "band")
];

/// Generate a random 4-emoji PIN by selecting from EMOJI_PIN_SET.
/// Must be called BEFORE any async/await to avoid !Send issues with ThreadRng.
pub fn generate_pin() -> String {
    let mut rng = rand::thread_rng();
    EMOJI_PIN_SET
        .choose_multiple(&mut rng, 4)
        .map(|(emoji, _)| *emoji)
        .collect::<Vec<_>>()
        .join("")
}

/// Parse a PIN string into German labels using longest-first matching (handles multi-codepoint emojis like 🕷️).
/// Returns None if the PIN doesn't contain exactly 4 valid set symbols.
pub fn labels_for(pin: &str) -> Option<Vec<&'static str>> {
    let symbols = symbols_of(pin)?;
    // Map symbols back to their labels
    let mut labels = Vec::new();
    for symbol in symbols {
        if let Some((_, label)) = EMOJI_PIN_SET.iter().find(|(e, _)| *e == symbol) {
            labels.push(*label);
        } else {
            return None; // Symbol not found (shouldn't happen if symbols_of is correct)
        }
    }
    Some(labels)
}

/// Extract the 4 emoji symbols from a PIN using longest-first matching.
/// This ensures multi-codepoint entries (VS16) like 🕷️ are not partially consumed.
/// Returns None if the PIN doesn't contain exactly 4 valid set symbols.
pub fn symbols_of(pin: &str) -> Option<Vec<&'static str>> {
    let mut symbols = Vec::new();
    let mut remaining = pin;
    let mut count = 0;

    while !remaining.is_empty() && count < 4 {
        let mut matched = false;
        // Sort by length descending to match longest entries first (handles VS16 variation selectors)
        let mut entries: Vec<_> = EMOJI_PIN_SET.iter().collect();
        entries.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

        for (emoji, _) in entries {
            if remaining.starts_with(emoji) {
                symbols.push(*emoji);
                remaining = &remaining[emoji.len()..];
                count += 1;
                matched = true;
                break;
            }
        }
        if !matched {
            return None; // Invalid character in PIN
        }
    }

    if count == 4 && remaining.is_empty() {
        Some(symbols)
    } else {
        None
    }
}

/// Validate that a PIN string contains exactly 4 symbols from the set.
pub fn is_valid_pin(pin: &str) -> bool {
    symbols_of(pin).is_some()
}

/// Wire row for `GET /api/emoji-pin-set` (A4).
#[derive(Debug, Clone, Serialize)]
pub struct EmojiPinSetEntry {
    pub emoji: &'static str,
    pub label: &'static str,
}

/// A4 / Wave-1 §B: return the curated emoji set for the client picker.
/// Cached static data — no auth required (public picker catalog, no secrets).
pub async fn handle_emoji_pin_set() -> Json<Vec<EmojiPinSetEntry>> {
    let entries: Vec<EmojiPinSetEntry> = EMOJI_PIN_SET
        .iter()
        .map(|(emoji, label)| EmojiPinSetEntry {
            emoji,
            label,
        })
        .collect();
    Json(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_pin_valid() {
        let pin = generate_pin();
        assert!(is_valid_pin(&pin));
    }

    #[test]
    fn test_labels_roundtrip() {
        let pin = generate_pin();
        if let Some(labels) = labels_for(&pin) {
            assert_eq!(labels.len(), 4);
            for label in labels {
                assert!(!label.is_empty());
            }
        }
    }

    #[test]
    fn test_reject_garbage() {
        assert!(!is_valid_pin("hello"));
        assert!(!is_valid_pin("🐱🐶"));
        assert!(!is_valid_pin("🐱🐶🐭"));
        assert!(!is_valid_pin("🐱🐶🐭🐹garbage"));
        assert!(!is_valid_pin(""));
    }

    #[test]
    fn test_is_valid_pin_boundary_cases() {
        let valid_pin = generate_pin();
        assert!(is_valid_pin(&valid_pin));

        assert!(!is_valid_pin("🐱🐶🐭🐹🐰")); // 5 emojis
        assert!(!is_valid_pin("🐱")); // 1 emoji (too few)
    }

    #[test]
    fn test_emoji_set_size() {
        assert!(EMOJI_PIN_SET.len() >= 256, "EMOJI_PIN_SET must have >= 256 entries, found {}", EMOJI_PIN_SET.len());
    }

    #[test]
    fn test_emoji_set_uniqueness() {
        let mut seen = std::collections::HashSet::new();
        for (emoji, _) in EMOJI_PIN_SET {
            assert!(!seen.contains(emoji), "Duplicate emoji in set: {}", emoji);
            seen.insert(emoji);
        }
    }

    #[test]
    fn test_multi_codepoint_pin_parsing() {
        // Test with multi-codepoint emojis (VS16 variation selectors)
        // 🕷️ (spider with VS16), ✈️ (plane with VS16)
        let spinne = "🕷️";
        let flugzeug = "✈️";

        // Verify they're in the set
        assert!(EMOJI_PIN_SET.iter().any(|(e, _)| e == &spinne), "🕷️ not found in set");
        assert!(EMOJI_PIN_SET.iter().any(|(e, _)| e == &flugzeug), "✈️ not found in set");

        // Create a PIN with multi-codepoint emojis
        let pin = format!("{}{}🐱🐶", spinne, flugzeug);
        assert!(is_valid_pin(&pin), "PIN with multi-codepoint emojis should be valid");

        // Verify symbols extraction works correctly
        if let Some(symbols) = symbols_of(&pin) {
            assert_eq!(symbols.len(), 4, "Should extract exactly 4 symbols");
            assert_eq!(symbols[0], spinne, "First symbol should be spinner");
            assert_eq!(symbols[1], flugzeug, "Second symbol should be airplane");
        } else {
            panic!("symbols_of should succeed for valid multi-codepoint PIN");
        }
    }

    #[test]
    fn test_symbols_of_extraction() {
        let pin = generate_pin();
        if let Some(symbols) = symbols_of(&pin) {
            assert_eq!(symbols.len(), 4, "Should extract exactly 4 symbols");
            for symbol in symbols {
                assert!(EMOJI_PIN_SET.iter().any(|(e, _)| e == &symbol), "Symbol should be in set: {}", symbol);
            }
        } else {
            panic!("symbols_of should succeed for valid PIN");
        }
    }
}
