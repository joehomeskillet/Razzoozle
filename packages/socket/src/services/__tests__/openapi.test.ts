import { describe, it, expect } from "vitest"
import { buildOpenApiDoc } from "@razzoozle/common/openapi/doc"
import { routes, openApiDoc } from "@razzoozle/socket/services/http-routes"

// Build a small reference doc for the schema-shape assertions that don't depend
// on the live route table.
const ref = buildOpenApiDoc(routes)

describe("OpenAPI document", () => {
  it("declares openapi 3.1.0", () => {
    expect(openApiDoc.openapi).toBe("3.1.0")
    expect(ref.openapi).toBe("3.1.0")
  })

  it("has a NEUTRAL info.title (no brand strings)", () => {
    expect(openApiDoc.info.title).toBe("Quiz Control API")
    expect(openApiDoc.info.title).not.toMatch(
      /razzoozle|violet|joelduss|joehomeskillet/i,
    )
    // Whole serialized doc must be brand-neutral.
    const serialized = JSON.stringify(openApiDoc)
    expect(serialized).not.toMatch(/razzoozle|violet|joelduss|joehomeskillet/i)
  })

  it("z.toJSONSchema emits additionalProperties:false + required on object schemas", () => {
    const clientEvent = openApiDoc.components.schemas.ClientEvent as {
      oneOf: { additionalProperties: unknown; required: string[] }[]
    }
    expect(Array.isArray(clientEvent.oneOf)).toBe(true)
    for (const variant of clientEvent.oneOf) {
      expect(variant.additionalProperties).toBe(false)
      expect(variant.required).toContain("type")
    }

    const soloReq = openApiDoc.components.schemas
      .SoloCheckAnswerRequest as Record<string, unknown>
    expect(soloReq.additionalProperties).toBe(false)
    expect(soloReq.required).toContain("questionIndex")
  })

  it("route-table path-set === Object.keys(doc.paths) (no phantom/undocumented routes)", () => {
    // Every non-hidden route must appear exactly once in doc.paths, and there
    // must be no doc path without a backing route.
    const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    const expected = new Set(
      routes.filter((r) => !r.hidden).map((r) => toOpenApiPath(r.path)),
    )
    const actual = new Set(Object.keys(openApiDoc.paths))
    expect(actual).toEqual(expected)
  })

  it("hidden routes (/metrics) are excluded from the published contract", () => {
    expect(Object.keys(openApiDoc.paths)).not.toContain("/metrics")
  })
})
