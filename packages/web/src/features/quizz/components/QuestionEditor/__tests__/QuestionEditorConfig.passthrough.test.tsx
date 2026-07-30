import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Test that QuestionEditorConfig properly passes excludeTypes prop to QuestionTypeSelector.
 *
 * This is a static analysis test that:
 * 1. Reads the source files
 * 2. Verifies the prop is declared in QuestionEditorConfig interface
 * 3. Verifies the prop is passed to QuestionTypeSelector component
 * 4. Confirms QuestionTypeSelector supports the prop
 */

const configPath = path.join(__dirname, "..", "QuestionEditorConfig", "index.tsx")
const selectorPath = path.join(__dirname, "..", "..", "QuestionTypeSelector.tsx")

describe("QuestionEditorConfig – excludeTypes passthrough (static analysis)", () => {
  const configSource = fs.readFileSync(configPath, "utf-8")
  const selectorSource = fs.readFileSync(selectorPath, "utf-8")

  it("QuestionEditorConfigProps interface includes excludeTypes prop", () => {
    // Check that the interface declares excludeTypes as optional
    expect(configSource).toMatch(
      /interface\s+QuestionEditorConfigProps\s*\{[^}]*excludeTypes\s*\?\s*:\s*QuestionTypeKey\[\]/
    )
  })

  it("QuestionEditorConfig destructures excludeTypes from props", () => {
    // Check that excludeTypes is destructured in the component function signature
    expect(configSource).toMatch(/const\s+QuestionEditorConfig\s*=\s*\(\s*\{\s*excludeTypes\s*\}/)
  })

  it("QuestionEditorConfig passes excludeTypes to QuestionTypeSelector", () => {
    // Check that the component passes excludeTypes to QuestionTypeSelector
    expect(configSource).toMatch(
      /<QuestionTypeSelector[^>]*excludeTypes\s*=\s*\{excludeTypes\}/
    )
  })

  it("QuestionTypeSelector component accepts excludeTypes prop", () => {
    // Check that QuestionTypeSelector defines excludeTypes in its interface
    expect(selectorSource).toMatch(
      /interface\s+QuestionTypeSelectorProps\s*\{[^}]*excludeTypes\s*\?\s*:\s*QuestionTypeKey\[\]/
    )
  })

  it("QuestionTypeSelector uses excludeTypes to filter types", () => {
    // Check that QuestionTypeSelector uses excludeTypes to filter the type list
    expect(selectorSource).toMatch(/excludeTypes\.includes\(meta\.id\)/)
  })

  it("excludeTypes prop flow is correct: CatalogQuestionForm -> QuestionEditor -> QuestionEditorConfig -> QuestionTypeSelector", () => {
    // Read QuestionEditor to verify it also passes the prop
    const editorPath = path.join(__dirname, "..", "index.tsx")
    const editorSource = fs.readFileSync(editorPath, "utf-8")

    // QuestionEditor should have excludeTypes in its interface
    expect(editorSource).toMatch(/interface\s+QuestionEditorProps\s*\{[^}]*excludeTypes/)

    // QuestionEditor should pass excludeTypes to QuestionEditorConfig
    expect(editorSource).toMatch(/<QuestionEditorConfig\s+excludeTypes\s*=\s*\{excludeTypes\}/)

    // QuestionEditorConfig (already tested) passes to QuestionTypeSelector
    expect(configSource).toMatch(
      /<QuestionTypeSelector[^>]*excludeTypes\s*=\s*\{excludeTypes\}/
    )
  })
})
