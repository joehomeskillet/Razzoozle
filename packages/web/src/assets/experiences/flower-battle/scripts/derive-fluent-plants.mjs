#!/usr/bin/env node
/**
 * derive-fluent-plants.mjs — reproduzierbare Ableitung der Flower-Battle
 * Produktions-Pflanzen aus Microsoft Fluent Emoji (MIT) Quellen.
 *
 * Quellen:  ../source/external/fluent-emoji/*_color.svg
 *           (microsoft/fluentui-emoji @ 62ecdc0d7ca5c6df32148c169556bc8d3782fca4)
 * Ausgaben: ../optimized/plants/** (15 SVGs; Pflanzen 32x32, Topf 16x12)
 *
 * Technik:
 * - Top-Level-Element-Split pro Quell-SVG (Indices verifiziert, Count-Assert)
 * - ID-Praefixe pro Quelle (kollisionsfreie Komposition)
 * - Farb-Regeln per exaktem Hex -> HSL-Rotation (nur Petal-/Zentrum-Familien;
 *   Gruentoene von Stiel/Blaettern werden nicht erfasst)
 * - Komposition: Stiel-Leaf-Rig + skalierter Art-Kopf mit fester Ueberlappung
 * - bud = Kopf 0.5x + gruener Kelch; half = Kopf 0.78x; full = Kopf 1x
 *
 * Aufruf: node scripts/derive-fluent-plants.mjs  (Cwd beliebig)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "source", "external", "fluent-emoji")
const OUT = join(HERE, "..", "optimized", "plants")

/* ---------------- SVG zerlegen ---------------- */

/** Top-Level-Elemente (path/g/circle/ellipse/rect) als Strings, Dokumentreihenfolge. */
function topLevelElements(body) {
  const els = []
  const re = /<\/?(?:path|g|circle|ellipse|rect)\b[^>]*?>/gs
  let m
  let depth = 0
  let openStart = -1
  while ((m = re.exec(body)) !== null) {
    const tok = m[0]
    const isClose = tok.startsWith("</")
    const selfClose = tok.endsWith("/>")
    if (isClose) {
      depth -= 1
      if (depth === 0 && openStart >= 0) {
        els.push(body.slice(openStart, re.lastIndex))
        openStart = -1
      }
      continue
    }
    if (depth === 0) openStart = m.index
    if (!selfClose) depth += 1
    else if (depth === 0) els.push(tok)
  }
  return els
}

function splitSource(file) {
  const svg = readFileSync(join(SRC, file), "utf8")
  const di = svg.indexOf("<defs>")
  if (di < 0) throw new Error(`${file}: <defs> fehlt`)
  const de = svg.indexOf("</defs>") + "</defs>".length
  const body = svg.slice(svg.indexOf(">") + 1, di)
  const defs = svg.slice(di, de)
  return { body, defs, elements: topLevelElements(body) }
}

/** IDs einer Quelle praefixen (body+defs), damit Kompositionen kollisionsfrei sind. */
function prefixIds(text, prefix, knownIds) {
  const found = [...text.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  const ids = new Set([...(knownIds ?? []), ...found])
  let out = text
  for (const id of ids) {
    out = out.split(`id="${id}"`).join(`id="${prefix}-${id}"`)
    out = out.split(`url(#${id})`).join(`url(#${prefix}-${id})`)
    out = out.split(`href="#${id}"`).join(`href="#${prefix}-${id}"`)
  }
  return out
}

/* ---------------- Farb-Regeln (HSL) ---------------- */

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255
  const mx = Math.max(r, g, b) / 255,
    mn = Math.min(r, g, b) / 255
  const l = (mx + mn) / 2
  let h = 0,
    s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    const rr = r / 255,
      gg = g / 255,
      bb = b / 255
    if (mx === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
    else if (mx === gg) h = ((bb - rr) / d + 2) / 6
    else h = ((rr - gg) / d + 4) / 6
  }
  return [h * 360, s, l]
}

function hslToHex(hue, s, l) {
  const h = ((hue % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

/** Wende Regeln [{colors, rotate|hue, sat, light}] auf SVG-Text an (nur exakte Hexe). */
function applyColorRules(text, rules) {
  let out = text
  for (const rule of rules ?? []) {
    for (const hex of rule.colors) {
      const [h, s, l] = hexToHsl(hex)
      const nh = rule.hue !== undefined ? rule.hue : h + (rule.rotate ?? 0)
      const ns = Math.max(0, Math.min(1, s * (rule.sat ?? 1)))
      const nl = Math.max(0, Math.min(1, l * (rule.light ?? 1)))
      const target = hslToHex(nh, ns, nl)
      out = out.replace(new RegExp(hex, "gi"), target)
    }
  }
  return out
}

/* ---------------- Arten-Konfiguration ---------------- */
/* Indices via Struktur-Analyse der gepinnten Quell-SVGs und Count-Assertions. */

const SPECIES = {
  violet: {
    dir: "violet-hibiscus",
    headSource: "hibiscus_color.svg",
    headPrefix: "hib",
    // Kopf = komplette Hibiskus-Datei [0..33] ([02-04] ist ihr gruener Kelch)
    headElements: (n) => range(0, n),
    stemFrom: "tulip",
    headAnchor: [16.2, 27.9],
    fullScale: 0.52,
    colors: [
      // Pink-Petale -> Violet (Hue ~325 -> ~270); gelber Stempel bleibt
      {
        rotate: -55,
        // prettier-ignore
        colors: ["#FFA8E0", "#FF9BD8", "#FF8FD8", "#FF88D5", "#FF83E8", "#FF7CD0", "#FF78BC", "#F058C6", "#FF67D9", "#FE65D5", "#ED4AA5", "#ED49A5", "#ED3FA3", "#E73790", "#E32D95", "#F03EBD", "#EA2195", "#E52A8A"],
      },
    ],
    // Gruen-Kelch der Hibiskus + ein rosa "Arm"-Element werden mitgedreht
    // (hue-matched), damit der Kopf farblich stimmig bleibt.
    colorOverrides: [
      // Kelch-Gruens -> satte, dunkle Gruentoene passend zum Violett
      {
        colors: ["#76A04A", "#567343", "#5C9452", "#4D844D", "#589550"],
        hue: 100,
        sat: 0.85,
        light: 0.9,
      },
    ],
    expectedHeadElements: 34,
  },
  blue: {
    dir: "blue-tulip",
    headSource: "tulip_color.svg",
    headPrefix: "tul",
    // sameSource: Kopf = [14..28], Stiel = [0..13] -> ein gemeinsamer Slice
    headElements: () => range(14, 29),
    stemFrom: "tulip",
    headAnchor: [16, 19.7],
    fullScale: 0.78,
    colors: [
      // Magenta -> Blau (Hue ~325 -> ~215); Hell/Dunkel-Verteilung bleibt
      {
        rotate: -110,
        // prettier-ignore
        colors: ["#B51E5F", "#AD1D50", "#BE2475", "#BC2C76", "#BB3E97", "#BA4383", "#D36592", "#D33E8E", "#D94AAA", "#E55CBB", "#EC6FB0", "#E598BC", "#E573BA", "#E07EA7", "#DF85AA", "#DE86BC"],
      },
    ],
    expectedHeadElements: 15,
  },
  orange: {
    dir: "orange-sunflower",
    headSource: "sunflower_color.svg",
    headPrefix: "sun",
    // sameSource: Kopf = [3,4,5,19,20,21,22], Stiel = Rest
    headElements: () => [3, 4, 5, 19, 20, 21, 22],
    stemFrom: "sunflower",
    headAnchor: [16, 19],
    fullScale: 0.8,
    colors: [
      // Gelb -> Orange-Gold (Hue ~50 -> ~28)
      {
        rotate: -22,
        sat: 1.05,
        colors: ["#FFE447", "#F8EC1D", "#F7BE1E", "#F7B44B"],
      },
      // Lila-Stich im Zentrum -> warmes Braun (RGB-exakt, deckt Gradient-Stops ab)
      {
        rotate: 25,
        sat: 0.9,
        colors: [
          "#723152",
          "#693542",
          "#7B454A",
          "#9C634D",
          "#966261",
          "#8C6161",
        ],
      },
      // Reines Dunkelbraun des Kerns -> warmes, etwas helleres Braun
      { colors: ["#63332A"], hue: 18, sat: 0.55, light: 1.25 },
    ],
    expectedHeadElements: 7,
  },
  green: {
    dir: "green-blossom",
    headSource: "blossom_color.svg",
    headPrefix: "blo",
    // sameSource: Kopf = [14..24], Stiel = [0..13]
    headElements: () => range(14, 25),
    stemFrom: "blossom",
    headAnchor: [16, 19.6],
    fullScale: 0.78,
    colors: [
      // Orange-Mitte -> gediegenes Gruen (Hue ~11-32 -> ~95, deutlich entsaettigt)
      {
        rotate: 82,
        sat: 0.55,
        light: 1.05,
        colors: ["#EC6F51", "#FFBA5F", "#FC8F39"],
      },
      // Lavendel/Creme-Petale -> cremeweiss, Schatten warm-neutral (RGB-exakt,
      // inkl. aller Gradient-Stops, damit kein Grau/Lila-Schatten zurueckbleibt)
      {
        rotate: 150,
        sat: 0.15,
        light: 1.1,
        colors: [
          "#D2B9DA",
          "#D0C3DC",
          "#BBB5C2",
          "#D7C0EF",
          "#E8DEF1",
          "#E7D4F9",
          "#E9E2F0",
          "#D2B9D9",
          "#E7D3F9",
        ],
      },
    ],
    expectedHeadElements: 11,
  },
}

const STEMS = {
  tulip: {
    source: "tulip_color.svg",
    prefix: "tul",
    elements: () => range(0, 14),
    top: [16, 19.66],
  },
  sunflower: {
    source: "sunflower_color.svg",
    prefix: "sun",
    elements: () => [
      0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 23,
    ],
    top: [16.1, 19.75],
  },
  blossom: {
    source: "blossom_color.svg",
    prefix: "blo",
    elements: () => range(0, 14),
    top: [16, 19.64],
  },
}

function range(a, b) {
  return Array.from({ length: b - a }, (_, i) => a + i)
}

/* ---------------- Komposition ---------------- */

const CALYX_DEF = `<linearGradient id="fbCalyxGrad" x1="0" y1="0" x2="0" y2="-9" gradientUnits="userSpaceOnUse"><stop stop-color="#7CB342"/><stop offset="1" stop-color="#4D9055"/></linearGradient>`
const HEAD_STEM_OVERLAP_Y = 0.5

function calyxGroup([x, y]) {
  return (
    `<g transform="translate(${x} ${y + 0.4})">` +
    `<path d="M0 0C-1.8-3-1.8-7 0-9.5C1.8-7 1.8-3 0 0Z" fill="url(#fbCalyxGrad)"/>` +
    `<path d="M0 0C-4.5-1.5-6-5-4.2-8.5C-1.5-6-0.6-2.5 0 0Z" fill="url(#fbCalyxGrad)"/>` +
    `<path d="M0 0C4.5-1.5 6-5 4.2-8.5C1.5-6 0.6-2.5 0 0Z" fill="url(#fbCalyxGrad)"/>` +
    `</g>`
  )
}

function svgDoc(inner, defs, options = {}) {
  const viewBox = options.viewBox ?? "0 0 32 32"
  const attributes = options.attributes ? ` ${options.attributes}` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"${attributes}>${defs}${inner}</svg>\n`
}

/**
 * Debug-Overlay: faerbt jedes Top-Level-Element in einer eigenen Signalfarbe
 * (gleiche Element-Indexe => gleiche Farbe ueber alle Quellen). Aktivieren
 * via Env `DEBUG_ELEMENT_COLORS=1`, um Slice-/Index-Probleme sichtbar zu
 * machen. Wird NIE fuer Produktionsassets gesetzt.
 */
// prettier-ignore
const DEBUG_COLORS = process.env.DEBUG_ELEMENT_COLORS === "1"
  ? ["#FF0000", "#00CC00", "#0044FF", "#FF8800", "#AA00FF", "#00CCCC", "#FF0088", "#888800", "#FF6666", "#66FF66", "#6666FF", "#CC6600", "#CC00CC", "#009999", "#990000", "#009900", "#000099", "#996633", "#663399", "#339966", "#993366", "#336699", "#CC9933", "#33CC99", "#9933CC", "#669933", "#CC3366", "#3366CC", "#999933", "#33CCCC", "#CC3333", "#33CC33", "#3333CC", "#CCCC33", "#33FF99", "#9933FF", "#669900"]
  : null

function debugRecolor(elements) {
  if (!DEBUG_COLORS) return elements
  return elements.map((el, i) => {
    const color = DEBUG_COLORS[i % DEBUG_COLORS.length]
    let out = el
    // Solid fills
    out = out.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${color}"`)
    // Gradient fills -> solid (defs bleiben, werden ungenutzt)
    out = out.replace(/fill="url\(#[^)]+\)"/g, `fill="${color}"`)
    // Filter entfernen (sie verstecken sonst die Farbe)
    out = out.replace(/filter="url\(#[^)]+\)"/g, "")
    return out
  })
}

/** Lade + transformiere eine Quelle: Farb-Regeln anwenden, IDs praefixen. */
function prepareSource(file, prefix, colorRules) {
  const { body, defs } = splitSource(file)
  const recoloredBody = applyColorRules(body, colorRules)
  const recoloredDefs = applyColorRules(defs, colorRules)
  // IDs aus defs extrahieren und dem Body-Prefixer mitgeben: der Body
  // referenziert `url(#<id>)`, definiert die IDs aber nicht selbst, weshalb
  // ein reines "aus dem Text lernen" sie nicht findet.
  const defIds = [...recoloredDefs.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  const prefixedBody = prefixIds(recoloredBody, prefix, defIds)
  const parsed = debugRecolor(topLevelElements(prefixedBody))
  return {
    elements: parsed,
    defs: DEBUG_COLORS
      ? "<defs></defs>"
      : prefixIds(recoloredDefs, prefix, defIds),
    count: topLevelElements(prefixedBody).length,
  }
}

const sourceCache = new Map()
function getSource(file, prefix, colorRules) {
  // Cache-Key enthaelt die Farb-Regeln: dieselbe Quelle wird z. B. als
  // re-kolorierter Art-Kopf UND als naturgruenes Stiel-Rig verwendet.
  const key = `${file}|${prefix}|${JSON.stringify(colorRules ?? null)}`
  if (!sourceCache.has(key)) {
    sourceCache.set(key, prepareSource(file, prefix, colorRules))
  }
  return sourceCache.get(key)
}

function pick(elements, indices) {
  return indices.map((i) => {
    if (!elements[i])
      throw new Error(`Element [${i}] fehlt (${elements.length} vorhanden)`)
    return elements[i]
  })
}

/* ---------------- defs-Hygiene + Duplikat-Komposition ---------------- */
// Problem 1: Viele Fluent-Elemente sind halbtransparente Soft-Light-Overlays
// (Gradient -> stop-opacity 0). Werden Kopf + Stiel getrennt in eine <defs>
// gestellt, verlieren diese Overlays ihre Referenz-Form -> schwarze Flecken.
// Fix: `wrapSoftOverlays` sammelt Gradienten, deren Stops ALLE opacity 0
// haben (reine Shading-Layer), und weist komponierte Gruppen an, diese
// Overlays auszublenden (opacity=0). Die Grundformen bleiben.
// Problem 2: Bei sameSource (z. B. Tulpe Kopf+Stiel aus einer Datei) wuerde
// der Stiel-Ausschnitt [0..13] samt Kopf-Overlays und der Kopf samt
// Stiel-Overlays doppelt zeichnen -> Mischmasch. Fix: pro Datei genau EIN
// Ausschnitt; Overlay-Elemente des jeweils anderen Teils werden ausgeblendet.

/** IDs von Gradienten, bei denen jeder Stop stop-opacity="0" hat. */
function softOverlayGradientIds(defsText) {
  const ids = new Set()
  for (const m of defsText.matchAll(
    /<(linearGradient|radialGradient)\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g,
  )) {
    const stops = [...m[3].matchAll(/<stop\b[^>]*>/g)]
    if (stops.length === 0) continue
    const allZero = stops.every((s) => /stop-opacity="0"/.test(s[0]))
    if (allZero) ids.add(m[2])
  }
  return ids
}

/** Setzt opacity="0" auf Elemente, deren Fill ein Soft-Overlay-Gradient ist. */
function hideSoftOverlays(elementText, overlayIds, prefix) {
  let out = elementText
  for (const id of overlayIds) {
    const ref = `url(#${prefix}-${id})`
    if (!out.includes(ref)) continue
    // Fills in diesem Element (inkl. <g fill=...>) auf das Overlay -> Gruppe ausblenden
    out = out.replace(
      new RegExp(`fill="${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"),
      `fill="${prefix}-none"`,
    )
  }
  if (out !== elementText) {
    out = `<g opacity="0">${out}</g>`
  }
  return out
}

/** Versteckt eine explizite Index-Liste (als Gruppe opacity=0). */
function hideIndices(elements, indices) {
  return indices.map((i) => `<g opacity="0">${elements[i]}</g>`).join("")
}

/** Sichtbarkeitsschema fuer einen Quell-Ausschnitt. */
function _makeSlice(src, visible, allCount) {
  const visibleSet = new Set(visible)
  const hidden = []
  for (let i = 0; i < allCount; i += 1) if (!visibleSet.has(i)) hidden.push(i)
  return {
    visible: pick(src.elements, visible).join(""),
    hidden: hideIndices(src.elements, hidden),
  }
}

/** Komponiere eine Stage (bud|half|full) fuer eine Art. */
function composeSpeciesStage(key, stage) {
  const spec = SPECIES[key]
  const stemSpec = STEMS[spec.stemFrom]
  const scale =
    stage === "bud"
      ? spec.fullScale * 0.5
      : stage === "half"
        ? spec.fullScale * 0.78
        : spec.fullScale

  const sameSource = spec.headSource === stemSpec.source
  const headRules = [...(spec.colors ?? []), ...(spec.colorOverrides ?? [])]
  const headSrc = getSource(spec.headSource, spec.headPrefix, headRules)
  const stemSrc = sameSource
    ? headSrc
    : getSource(stemSpec.source, stemSpec.prefix)

  const headIdx = spec.headElements(headSrc.count)
  if (headIdx.length !== spec.expectedHeadElements) {
    throw new Error(
      `${key}: head ${headIdx.length} != expected ${spec.expectedHeadElements}`,
    )
  }
  const stemIdx = stemSpec.elements()

  const [ax, ay] = spec.headAnchor
  const [sx, sy] = stemSpec.top
  const headT = `translate(${sx} ${sy + HEAD_STEM_OVERLAP_Y}) scale(${scale.toFixed(3)}) translate(${-ax} ${-ay})`

  let stem
  let head
  let defsOut
  if (sameSource) {
    // Eine Datei: alle Elemente einmal in Original-Reihenfolge; der jeweils
    // andere Teil wird ausgeblendet. Soft-Overlays (Gradient->opacity 0)
    // werden global versteckt, damit sie ohne Referenzform nicht schwarz
    // rendern. Grundformen + Deckoverlays bleiben sichtbar.
    const allIdx = range(0, headSrc.count)
    const overlayIds = softOverlayGradientIds(headSrc.defs)
    const parts = allIdx.map((i) => {
      const el = hideSoftOverlays(
        headSrc.elements[i],
        overlayIds,
        spec.headPrefix,
      )
      const inHead = headIdx.includes(i)
      const inStem = stemIdx.includes(i)
      if (!inHead && !inStem) return `<g opacity="0">${el}</g>`
      return el
    })
    // Stiel- und Kopfteile trennen: Stiel unten, Kopf oben — Kopf ueber Stiel.
    stem = stemIdx.map((i) => parts[i]).join("")
    head = headIdx.map((i) => parts[i]).join("")
    defsOut = headSrc.defs
  } else {
    const headOverlayIds = softOverlayGradientIds(headSrc.defs)
    const stemOverlayIds = softOverlayGradientIds(stemSrc.defs)
    stem = stemIdx
      .map((i) =>
        hideSoftOverlays(stemSrc.elements[i], stemOverlayIds, stemSpec.prefix),
      )
      .join("")
    head = headIdx
      .map((i) =>
        hideSoftOverlays(headSrc.elements[i], headOverlayIds, spec.headPrefix),
      )
      .join("")
    defsOut = `${stemSrc.defs}${headSrc.defs}`
  }

  let inner = stem
  if (stage === "bud") inner += calyxGroup([sx, sy])
  inner += `<g transform="${headT}">${head}</g>`

  if (stage === "bud") defsOut = `<defs>${CALYX_DEF}</defs>${defsOut}`
  return svgDoc(inner, defsOut, {
    attributes:
      `data-fb-stage="${stage}" ` +
      `data-fb-stem-tip="${sx},${sy}" ` +
      `data-fb-bloom-base="${sx},${sy}" ` +
      `data-fb-overlap="${HEAD_STEM_OVERLAP_Y}"`,
  })
}

/* ---------------- Shared: seedling + sprout ---------------- */

function composeSeedling() {
  const src = getSource("seedling_color.svg", "see")
  if (src.count !== 15)
    throw new Error(`seedling: ${src.count} Elemente, 15 erwartet`)
  // [13] = Erdhuegel (paint13-16, braun) -> entfernen; Rest +8 nach unten (Wurzel ~30.5)
  const overlayIds = softOverlayGradientIds(src.defs)
  const keep = [...range(0, 13), 14]
  const body = keep
    .map((i) => hideSoftOverlays(src.elements[i], overlayIds, "see"))
    .join("")
  return svgDoc(`<g transform="translate(0 8)">${body}</g>`, src.defs)
}

function composeSprout() {
  const src = getSource("potted_plant_color.svg", "pot")
  if (src.count !== 37)
    throw new Error(`potted_plant: ${src.count} Elemente, 37 erwartet`)
  // [18] = Erde, [25-36] = Topf -> entfernen; Rest +11 nach unten (Stielbasis ~30.2)
  const overlayIds = softOverlayGradientIds(src.defs)
  const keep = [...range(0, 18), ...range(19, 25)]
  const body = keep
    .map((i) => hideSoftOverlays(src.elements[i], overlayIds, "pot"))
    .join("")
  return svgDoc(`<g transform="translate(0 11)">${body}</g>`, src.defs)
}

function composePot() {
  const src = getSource("potted_plant_color.svg", "pot")
  if (src.count !== 37)
    throw new Error(`potted_plant: ${src.count} Elemente, 37 erwartet`)

  // [18] = Erde; [25..33] = Topfkoerper, Rand und Highlights.
  // [34..36] gehoeren zur Pflanze und bleiben bewusst ausgeschlossen.
  const body = pick(src.elements, [18, ...range(25, 34)]).join("")
  return svgDoc(
    `<g transform="translate(-8.00745 -17.9963)">${body}</g>`,
    src.defs,
    {
      viewBox: "0 0 16 12",
      attributes: 'data-fb-pot-version="1"',
    },
  )
}

/* ---------------- Main ---------------- */

function main() {
  const writes = []
  const put = (rel, content) => {
    const abs = join(OUT, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    writes.push(`${rel} (${content.length} B)`)
  }

  put("shared/seedling.svg", composeSeedling())
  put("shared/sprout.svg", composeSprout())
  put("shared/pot.svg", composePot())
  for (const key of Object.keys(SPECIES)) {
    put(`${SPECIES[key].dir}/bud.svg`, composeSpeciesStage(key, "bud"))
    put(`${SPECIES[key].dir}/half-bloom.svg`, composeSpeciesStage(key, "half"))
    put(`${SPECIES[key].dir}/full-bloom.svg`, composeSpeciesStage(key, "full"))
  }
  console.log(`OK - ${writes.length} Dateien:`)
  for (const w of writes) console.log(`  ${w}`)
}

main()
