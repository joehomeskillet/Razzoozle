// Curated nerd-humor quote banks, one per error variant. The canonical source
// is i18n (locales/<lng>/errors.json → "errors:quotes.<variant>"), so the line
// follows the active language. The German arrays below stay as a hard fallback
// for the (unlikely) case where the i18n value is missing or not an array — e.g.
// a stripped/partial bundle. Kept harmless and on-brand — no insults, no
// politics.
//
// Picked at CALL time via pickQuote(variant), so a re-render after a "back"
// navigation or a remount yields a fresh line. Math.random is fine here — the
// reproducibility of the choice carries no weight.

import i18n from "@razzia/web/i18n"

export type ErrorVariant = "notFound" | "client" | "server" | "generic"

// 404 — "verloren im Void": the page drifted off somewhere.
const notFound = [
  "Diese Seite ist in einem anderen Schloss.",
  "Schroedingers Seite: gleichzeitig da und nicht da.",
  "Diese Seite hat sich ausgeloggt und nie wieder eingeloggt.",
  "404 — hier ist nur noch Leere und ein bisschen kosmischer Staub.",
  "Wir haben ueberall gesucht. Sogar hinter der Couch.",
  "Diese Seite ist auf einer Reise zu sich selbst.",
] as const

// 4xx — "du hast (sanft) was kaputtgemacht": a confused, wobbling client error.
const client = [
  "Bad Request — PEBKAC, aber wir moegen dich trotzdem.",
  "Layer-8-Problem erkannt.",
  "Das war syntaktisch mutig.",
  "Die Anfrage war ein bisschen daneben — passiert den Besten.",
  "Irgendwas zwischen Stuhl und Tastatur ist verrutscht.",
  "Fast richtig. Nur halt nicht ganz.",
] as const

// 5xx — "Kernel Panic": the server briefly lost its composure.
const server = [
  "Der Server hat kurz Feierabend gemacht.",
  "Hast du es schon mit aus- und wieder einschalten versucht?",
  "Stack Overflow (die schlechte Sorte).",
  "Die Hamster im Serverrad brauchen eine Pause.",
  "Kernel Panic — der Server zaehlt erst mal bis zehn.",
  "Es liegt nicht an dir, es liegt an uns. Wirklich.",
] as const

// Fallback — unknown / unclassifiable error.
const generic = [
  "Etwas ist schiefgelaufen — wir wissen auch nicht genau was.",
  "Ein wilder Fehler erschien. Es war nicht sehr effektiv.",
  "Houston, wir haben ein kleines Problem.",
  "Hier hat sich ein Bug eingeschlichen. Wir kehren ihn raus.",
  "Unerwartet, aber nicht ungewohnt.",
] as const

const FALLBACK_BANKS: Record<ErrorVariant, readonly string[]> = {
  notFound,
  client,
  server,
  generic,
}

// Read the localized bank for `variant` from i18n. Returns a non-empty
// string[] or null if the resource is missing / not an array of strings.
const i18nBank = (variant: ErrorVariant): string[] | null => {
  const value = i18n.t(`errors:quotes.${variant}`, { returnObjects: true })
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string")
  ) {
    return value as string[]
  }
  return null
}

/**
 * Returns one random line from the bank matching `variant`. The bank is sourced
 * from i18n (active language) and falls back to the hardcoded German arrays when
 * the i18n value is missing or not a non-empty string array. Called at render
 * time so each mount/remount can surface a different quote, and so a language
 * change before remount picks up the new locale. Falls back to the generic bank
 * for any unexpected variant value.
 */
export const pickQuote = (variant: ErrorVariant): string => {
  const bank = i18nBank(variant) ?? FALLBACK_BANKS[variant] ?? generic
  return bank[Math.floor(Math.random() * bank.length)]
}

export default pickQuote
