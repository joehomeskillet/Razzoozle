/**
 * Output paths for the Side-by-Side generator. Extracted so tests can assert
 * on them without re-deriving the file layout.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUTPUT_DIR = resolve(__dirname, "visual-output")

export const COMPOSITE_PATH = resolve(OUTPUT_DIR, "side-by-side.png")
export const REPORT_PATH = resolve(OUTPUT_DIR, "side-by-side.report.json")
export const OUTPUT_DIR_PATH = OUTPUT_DIR
