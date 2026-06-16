import { z } from "zod"
import {
  soloCheckAnswerRequestValidator,
  soloScoreSubmitValidator,
} from "@razzoozle/common/validators/solo"
import { clientEventValidator } from "@razzoozle/common/validators/client-events"

// Static OpenAPI 3.1 document builder. Consumes the SAME `Route[]` table the
// HTTP dispatcher uses (single source of truth), so a route can never be
// documented without being served, nor served without being documented — the
// route-parity test asserts the path-set equality.
//
// SECURITY-BLOCKER 2: the `/api/quizz/{id}/solo` response schema is the
// HAND-WRITTEN stripped shape below — it is NEVER derived from the full `Quizz`
// type, so `solutions`/`correct`/`acceptedAnswers` can never leak into the
// published contract even if the Quizz type grows new secret fields.
//
// NEUTRAL info.title — never a brand string. The backport tree reuses this file
// verbatim.

// ── Route contract (shared by dispatcher + this generator) ──────────────────
export interface RouteDoc {
  method: "GET" | "POST"
  // Express-style path with `:param` segments (e.g. "/api/quizz/:id/solo").
  path: string
  summary: string
  description?: string
  // Optional request-body / response zod schemas (the doc generator converts
  // them via z.toJSONSchema). When absent the path is documented without a
  // typed body/response (legacy/opaque routes).
  requestSchema?: z.ZodType
  responseSchema?: z.ZodType
  // When true, the route is omitted from the spec's `paths` entirely (used for
  // raw/opaque endpoints we never want in the public contract, e.g. /metrics).
  hidden?: boolean
}

// ── Hand-written stripped solo response (B2) ────────────────────────────────
// Mirrors index.ts:152-155 which strips solutions/correct/acceptedAnswers from
// each question. `.loose()` keeps the remaining presentational question fields
// open without re-importing the full Quizz type.
export const soloResponseSchema = z.object({
  subject: z.string(),
  questions: z.array(
    z
      .object({
        question: z.string(),
        // `type` is optional on the wire (defaults to "quiz" when absent),
        // matching how questions are persisted.
        type: z.string().optional(),
      })
      .loose(),
  ),
})

const toSchema = (s: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(s, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }) as Record<string, unknown>
  // The top-level $schema key is redundant inside an OpenAPI components map.
  delete json.$schema
  return json
}

// `:id` → `{id}` for the OpenAPI path-templating syntax.
const toOpenApiPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")

const pathParams = (path: string) =>
  [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
    name: m[1]!,
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
  }))

export const buildOpenApiDoc = (routes: readonly RouteDoc[]) => {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const route of routes) {
    if (route.hidden) {
      continue
    }

    const openApiPath = toOpenApiPath(route.path)
    const verb = route.method.toLowerCase()
    const params = pathParams(route.path)

    const operation: Record<string, unknown> = {
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      ...(params.length > 0 ? { parameters: params } : {}),
      responses: {
        "200": {
          description: "OK",
          ...(route.responseSchema
            ? {
                content: {
                  "application/json": {
                    schema: toSchema(route.responseSchema),
                  },
                },
              }
            : {}),
        },
      },
    }

    if (route.requestSchema) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: toSchema(route.requestSchema) },
        },
      }
    }

    paths[openApiPath] = { ...(paths[openApiPath] ?? {}), [verb]: operation }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Quiz Control API",
      version: "1.0.0",
      description:
        "Self-documenting HTTP edge of the realtime quiz server. The control " +
        "plane (creating/starting games, themes, AI) is NOT REST — it is " +
        "~90 socket.io events behind manager auth, plus a 32-tool MCP server " +
        "that shares these same zod schemas. See GET /api/v1/observability/events " +
        "for the socket event catalog.",
    },
    tags: [
      {
        name: "Health",
        description: "Liveness/health probes for this HTTP edge.",
      },
      {
        name: "Achievements",
        description: "Public merged achievements config for the player client.",
      },
      {
        name: "Solo",
        description:
          "Single-player quiz flow: stripped questions, stateless answer " +
          "checks, and score submission.",
      },
      {
        name: "Observability",
        description:
          "Read-only diagnostics: client-event ingest plus the socket event " +
          "catalog and payload JSON Schema.",
      },
      {
        name: "Docs",
        description: "This OpenAPI document.",
      },
      {
        name: "Control plane",
        description:
          "Game/theme/AI mutations are NOT REST — they run over socket.io " +
          "events (manager.withAuth) and the MCP server; this document covers " +
          "the read/diagnostic HTTP surface only.",
      },
    ],
    components: {
      schemas: {
        SoloQuizz: toSchema(soloResponseSchema),
        SoloCheckAnswerRequest: toSchema(soloCheckAnswerRequestValidator),
        SoloScoreSubmit: toSchema(soloScoreSubmitValidator),
        ClientEvent: toSchema(clientEventValidator),
      },
      securitySchemes: {
        // Documented, not enforced in this layer — manager writes stay on the
        // socket.io `manager.withAuth` gate.
        ManagerToken: { type: "apiKey", in: "header", name: "X-Manager-Token" },
        "X-Manager-Token": {
          type: "apiKey",
          in: "header",
          name: "X-Manager-Token",
          description:
            "Manager auth (documented only; control-plane writes are gated " +
            "via socket.io manager.withAuth, not this header).",
        },
      },
    },
    paths,
  } as const
}

export type OpenApiDoc = ReturnType<typeof buildOpenApiDoc>
