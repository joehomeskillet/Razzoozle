// GROUP 1 — AUTHORING: reusable question bank (catalog).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  deleteCatalogEntry,
  getCatalog,
  saveCatalogEntry,
} from "../config-store.js"
import { buildQuestion } from "../question-builder.js"
import { fail, ok, questionInputShape, toBuildInput } from "./shared.js"

export function registerCatalogTools(server: McpServer): void {
  server.registerTool(
    "list_catalog",
    {
      title: "List catalog (question bank) entries",
      description:
        "List reusable questions saved in config/catalog (id, question text, type, tags, source, addedAt). These can be dropped into a quiz as-is.",
      inputSchema: {},
    },
    () => {
      try {
        return ok(
          getCatalog().map((e) => ({
            id: e.id,
            question: e.question.question,
            type: e.question.type,
            tags: e.tags,
            source: e.source,
            addedAt: e.addedAt,
          })),
        )
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "add_to_catalog",
    {
      title: "Add a question to the catalog",
      description:
        "Build a question (same fields as create_question) and store it in the reusable question bank (config/catalog/<id>.json). Re-validates the question before writing and returns the generated catalog entry id.",
      inputSchema: {
        ...questionInputShape,
        tags: z
          .array(z.string().min(1).max(40))
          .max(20)
          .optional()
          .describe("Optional free-text tags (<=20, each 1-40 chars)."),
        source: z
          .enum(["manual", "submission", "editor", "ai"])
          .optional()
          .describe("Provenance chip (default manual)."),
      },
    },
    (args: { tags?: string[]; source?: "manual" | "submission" | "editor" | "ai"; [key: string]: unknown }) => {
      try {
        const { tags, source, ...rest } = args
        const question = buildQuestion(toBuildInput(rest))
        const entry = saveCatalogEntry({ question, tags, source })
        return ok({
          id: entry.id,
          question: entry.question.question,
          tags: entry.tags,
          source: entry.source,
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "delete_catalog_entry",
    {
      title: "Delete a catalog entry",
      description: "Delete a reusable question from the catalog by id.",
      inputSchema: {
        id: z.string().describe("Catalog entry id (from list_catalog)."),
      },
    },
    ({ id }: { id: string }) => {
      try {
        deleteCatalogEntry(id)
        return ok({ deleted: id })
      } catch (e) {
        return fail(e)
      }
    },
  )
}
