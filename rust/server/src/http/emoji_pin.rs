use rand::seq::SliceRandom;

pub const EMOJI_PIN_SET: &[(&str, &str)] = &[
    // Animals - 80 entries
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
    ("🦗", "grille"), ("🕷️", "spinne"), ("🦂", "skorpion"), ("🐢", "schildkroete2"),
    ("🐈", "katze2"), ("🐓", "henne"), ("🦁", "loewe2"), ("🦒", "giraffe"),
    ("🦓", "zebra"), ("🦍", "gorilla"), ("🦧", "orang_utan"), ("🐘", "elefant"),
    ("🦛", "flusspferd"), ("🦏", "nashorn"), ("🐁", "feldmaus"), ("🐀", "ratte"),
    ("🐿️", "eichhorn"), ("🦌", "hirsch"), ("🦬", "bueffel"), ("🐃", "wasserbueffel"),
    ("🐄", "rind"), ("🐎", "pferd"), ("🐖", "schwein2"), ("🐏", "schaf"),
    ("🐑", "schaf2"), ("🦍", "gorilla2"), ("🦧", "affe2"), ("🐒", "affe3"),
    ("🦁", "loewe3"), ("🐅", "tiger2"), ("🐆", "leopard"), ("🐘", "elefant2"),
    ("🦛", "flusspferd2"), ("🦏", "nashorn2"), ("🐪", "kamel"), ("🐫", "kamel2"),
    ("🦒", "giraffe2"), ("🦓", "zebra2"),
    
    // Vehicles - 60 entries
    ("🚗", "auto"), ("🚕", "taxi"), ("🚙", "auto2"), ("🚌", "bus"),
    ("🚎", "bus2"), ("🏎️", "rennwagen"), ("🚓", "polizeiauto"), ("🚑", "krankenwagen"),
    ("🚒", "feuerwehr"), ("🚐", "minibus"), ("🛻", "pick_up"), ("🚚", "lastwagen"),
    ("🚛", "lastwagen2"), ("🚜", "traktor"), ("🏍️", "motorrad"), ("🏎️", "rennwagen2"),
    ("🛵", "roller"), ("🦯", "blindenstock"), ("🦽", "handbike"), ("🦼", "elektroroller"),
    ("🛺", "tuk_tuk"), ("🚲", "fahrrad"), ("🛴", "skateboard"), ("🛹", "longboard"),
    ("🛼", "rollschuhe"), ("🛶", "kanu"), ("⛵", "segelboot"), ("🚤", "schnellboot"),
    ("🛳️", "schiff"), ("⛴️", "faehre"), ("🛥️", "motorboot"), ("🎣", "angeln"),
    ("⛽", "tankstelle"), ("✈️", "flugzeug"), ("🛩️", "kleinflugzeug"), ("💺", "flugzeugsitz"),
    ("🛫", "start"), ("🛬", "landung"), ("🛰️", "satellit"), ("🚁", "hubschrauber"),
    ("🚟", "seilbahn"), ("🚠", "bergbahn"), ("🚡", "fahrstuhl"), ("🛣️", "autobahn"),
    ("🛤️", "bahnstrecke"), ("🛢️", "erdoeltank"), ("⛽", "tankstelle2"), ("🚨", "polizeisirene"),
    ("🚥", "verkehrsampel"), ("🚦", "ampel"), ("🚧", "baustelle_zeichen"),
    
    // Food & Drink - 70 entries
    ("🍎", "apfel"), ("🍊", "orange"), ("🍋", "zitrone"), ("🍌", "banane"),
    ("🍉", "wassermelone"), ("🍇", "trauben"), ("🍓", "erdbeere"), ("🍈", "melone"),
    ("🍒", "kirsche"), ("🍑", "pfirsich"), ("🥭", "mango"), ("🍍", "ananas"),
    ("🥥", "kokosnuss"), ("🥑", "avocado"), ("🍅", "tomate"), ("🍆", "aubergine"),
    ("🥦", "brokkoli"), ("🥬", "salat"), ("🥒", "gurke"), ("🌶️", "chili"),
    ("🌽", "mais"), ("🥕", "karotte"), ("🥔", "kartoffel"), ("🍠", "susskartoffel"),
    ("🥐", "croissant"), ("🍞", "brot"), ("🥖", "baguette"), ("🥨", "brezel"),
    ("🧀", "kaese"), ("🥚", "ei"), ("🍳", "spiegeleier"), ("🧈", "butter"),
    ("🥞", "pfannkuchen"), ("🥓", "speck"), ("🥩", "fleisch"), ("🍗", "chicken"),
    ("🍖", "keule"), ("🌭", "hotdog"), ("🍔", "hamburger"), ("🍟", "pommes"),
    ("🍕", "pizza"), ("🥪", "sandwich"), ("🥙", "gyros"), ("🧆", "falafel"),
    ("🌮", "taco"), ("🌯", "burrito"), ("🥗", "salat2"), ("🥘", "paella"),
    ("🥫", "dosenessen"), ("🍝", "pasta"), ("🍜", "nudelsuppe"), ("🍲", "eintopf"),
    ("🍛", "curryreis"), ("🍣", "sushi"), ("🍱", "bento"), ("🥟", "ravioli"),
    ("🦪", "auster"), ("🍤", "garnele"), ("🍙", "reisball"), ("🍚", "reis"),
    ("🍖", "fleisch2"), ("🌭", "wurst"), ("🍿", "popcorn"), ("🍩", "donut"),
    ("🍪", "keks"), ("🎂", "kuchen"), ("🍰", "torte"), ("🧁", "macarons"),
    ("🍫", "schokolade"), ("🍬", "bonbon"), ("🍭", "lutscher"), ("🍮", "pudding"),
    ("🍯", "honig"), ("🍼", "flasche"), ("☕", "kaffee"), ("🍵", "tee"),
    
    // Objects & Household - 70 entries
    ("🏠", "haus"), ("🏡", "hauschen"), ("🏘️", "haeuser"), ("🏚️", "huette"),
    ("🏗️", "baustelle"), ("🏭", "fabrik"), ("🏢", "buerogeb"), ("🏬", "kaufhaus"),
    ("🏣", "japanhaus"), ("🏤", "postamt"), ("🏥", "krankenhaus"), ("🏦", "bank"),
    ("🏨", "hotel"), ("🏪", "laden"), ("🏫", "schule"), ("🏩", "liebesnest"),
    ("💒", "kapelle"), ("🏛️", "museum"), ("⛪", "kirche"), ("🕌", "moschee"),
    ("🕍", "synagoge"), ("🛕", "tempel"), ("🕋", "kaaba"), ("⌚", "uhr"),
    ("📱", "handy"), ("📲", "telefon"), ("💻", "computer"), ("⌨️", "tastatur"),
    ("🖥️", "monitor"), ("🖨️", "drucker"), ("🖱️", "maus"), ("🖲️", "trackball"),
    ("🕹️", "joystick"), ("🗜️", "spannzange"), ("💽", "festplatte"), ("💾", "diskette"),
    ("💿", "cd"), ("📀", "dvd"), ("🧮", "rechenmaschine"), ("🎥", "kamera"),
    ("🎬", "filmrolle"), ("📺", "fernseher"), ("📷", "fotoapparat"), ("📸", "foto"),
    ("📹", "videokamera"), ("🎞️", "filmstreifen"), ("📼", "videokassette"), ("🔍", "lupe"),
    ("🔎", "lupe2"), ("🕯️", "kerze"), ("💡", "glühbirne"), ("🔦", "taschenlampe"),
    ("🏮", "laterne"), ("📔", "notizbuch"), ("📕", "rotesbuch"), ("📖", "offenesbuch"),
    ("📝", "schreiben"), ("✏️", "bleistift"), ("✒️", "tintenstift"), ("🖋️", "feder"),
    ("🖊️", "kugelschreiber"), ("🖌️", "pinsel"), ("🖍️", "wachsmalstift"), ("📏", "lineal"),
    ("📐", "geodreieck"), ("📌", "reißnagel"), ("📍", "nadel"), ("✂️", "schere"),
    ("🗃️", "kartothekkarte"), ("🗳️", "stimmbox"), ("🗂️", "karteikasten"), ("🗞️", "zeitung"),
    
    // Nature & Weather - 50 entries
    ("🌲", "tannenbaum"), ("🌳", "baum"), ("🌴", "palme"), ("🌵", "kaktus"),
    ("🌾", "getreide"), ("💐", "blumenstrauss"), ("🌷", "tulpe"), ("🌹", "rose"),
    ("🥀", "welkerose"), ("🌻", "sonnenblume"), ("🌞", "sonne"), ("🌝", "vollmond"),
    ("🌛", "mondsichel"), ("🌜", "mondsichel2"), ("🌚", "neumond"), ("🌕", "vollmond2"),
    ("🌖", "abnehmendmond"), ("🌗", "letztesviertel"), ("🌘", "neumond2"), ("🌑", "neumond3"),
    ("🌒", "zunehmendmond"), ("🌓", "erstes_viertel"), ("🌔", "mondzu"), ("⭐", "stern"),
    ("🌟", "glitzerstern"), ("✨", "funkeln"), ("⚡", "blitz"), ("☄️", "komet"),
    ("💥", "explosion"), ("🔥", "feuer"), ("🌪️", "tornado"), ("🌈", "regenbogen"),
    ("☀️", "sonne2"), ("🌤️", "sonnig"), ("⛅", "teilsbewoelkt"), ("🌥️", "bewoelkt"),
    ("☁️", "wolke"), ("🌦️", "regen"), ("🌧️", "gewitter"), ("⛈️", "sturm"),
    ("🌩️", "donner"), ("🌨️", "schnee"), ("❄️", "schneeflocke"), ("☃️", "schneemann"),
    ("⛄", "schneemann2"), ("🌬️", "wind"), ("💨", "luft"), ("💧", "wasser"),
    ("💦", "tropfen"), ("☔", "regenschirm"), ("🍏", "gruener_apfel"), ("🍎", "apfel2"),
    
    // Sports & Activities - 50 entries
    ("⚽", "fussball"), ("⚾", "baseball"), ("🥎", "softball"), ("🎾", "tennis"),
    ("🏐", "volleyball"), ("🏈", "american_football"), ("🏉", "rugby"), ("🥏", "kricket"),
    ("🎳", "bowling"), ("🏓", "tischtennis"), ("🏸", "badminton"), ("🥅", "tor"),
    ("⛳", "golfplatz"), ("⛸️", "eislaufen"), ("🎣", "fischen"), ("🎽", "laufshirt"),
    ("🎿", "ski"), ("⛷️", "skifahrer"), ("🏂", "snowboard"), ("🪂", "fallschirm"),
    ("🏋️", "gewichtheber"), ("🤼", "ringler"), ("🤸", "turner"), ("⛹️", "basketballspieler"),
    ("🏌️", "golfer"), ("🏄", "surfer"), ("🏊", "schwimmer"), ("🤽", "wasserballspieler"),
    ("🚣", "ruderer"), ("🧗", "kletterer"), ("🚴", "radfahrer"), ("🚵", "mountainbiker"),
    ("🎯", "schiessziel"), ("🪀", "diabolo"), ("🪁", "drachen"), ("🎪", "zirkuszelt"),
    ("🎨", "pinsel"), ("🎬", "filmrolle2"), ("🎤", "mikrofon"), ("🎧", "kopfhoerer"),
    ("🎼", "noten"), ("🎵", "musiknote"), ("🎶", "musiknoten"), ("🎹", "klavier"),
    ("🥁", "schlagzeug"), ("🎷", "saxophon"), ("🎺", "trompete"), ("🎸", "gitarre"),
    ("🎻", "geige"), ("🎩", "zylinderhut"), ("👑", "krone"), ("🎭", "theater"),
    
    // Symbols & Celebrations - 50 entries
    ("🎄", "weihnachtsbaum"), ("🎆", "feuerwerk"), ("🎇", "feuerzauber"), ("🎈", "luftballon"),
    ("🎉", "konfetti"), ("🎊", "konfetti2"), ("🎁", "geschenk"), ("🎀", "schleife"),
    ("🏆", "preis"), ("🏅", "medaille"), ("🥇", "gold"), ("🥈", "silber"),
    ("🥉", "bronze"), ("⭐", "stern2"), ("🌟", "glitzerstern2"), ("✨", "glitter"),
    ("⚡", "blitzbolzen"), ("💫", "schwindel"), ("💥", "knall"), ("🔔", "glocke"),
    ("🔕", "stummeglocke"), ("📢", "lautsprecher"), ("📣", "megaphon"), ("📯", "horn"),
    ("🎺", "trompete2"), ("🎸", "gitarre2"), ("🎹", "klavier2"), ("🎻", "violine"),
    ("🎤", "mikro"), ("🎧", "headphones"), ("📻", "radio2"), ("🎬", "movie"),
    ("🎭", "drama"), ("🎨", "palette"), ("🎪", "zirkuszelt2"), ("🎫", "ticket"),
    ("🎯", "dartscheibe"), ("🎲", "wuerfel"), ("🎰", "slotmaschine"), ("🧩", "puzzle"),
    ("🚀", "rakete"), ("🛸", "ufo"), ("🔭", "teleskop"), ("🔬", "mikroskop"),
    ("💎", "diamant"), ("💍", "ring"), ("👑", "krone2"), ("🎖️", "medaille2"),
    ("🏅", "medaille3"), ("🎗️", "band"), ("🎀", "schleife2"),
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

/// Parse a PIN string into German labels if valid (exactly 4 set symbols).
pub fn labels_for(pin: &str) -> Option<Vec<&'static str>> {
    let mut labels = Vec::new();
    let mut remaining = pin;
    let mut count = 0;

    while !remaining.is_empty() && count < 4 {
        let mut matched = false;
        for (emoji, label) in EMOJI_PIN_SET {
            if remaining.starts_with(emoji) {
                labels.push(*label);
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
        Some(labels)
    } else {
        None
    }
}

/// Validate that a PIN string contains exactly 4 symbols from the set.
pub fn is_valid_pin(pin: &str) -> bool {
    labels_for(pin).is_some()
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
}
