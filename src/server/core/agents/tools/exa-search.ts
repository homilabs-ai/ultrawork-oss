import { createTool } from "@mastra/core/tools";
import type Exa from "exa-js";
import { z } from "zod";
import type { SearchToolContext } from "./context.ts";

export function webSearchTool({ repo, runId, agentId, taskId }: SearchToolContext, client: Exa) {
  return createTool({
    id: "webSearch",
    description:
      "Search the live web via Exa. Returns top results with title, url, published date, and text highlights.",
    inputSchema: z.object({
      query: z.string().describe("The search query."),
      numResults: z.number().int().min(1).max(25).optional().describe("How many results to return (default 5)."),
    }),
    execute: async (input: { query: string; numResults?: number }) => {
      try {
        const res = await client.searchAndContents(input.query, {
          numResults: input.numResults ?? 5,
          type: "auto",
          highlights: true,
        });
        repo.logEvent({
          runId,
          agentId: agentId ?? null,
          taskId: taskId ?? null,
          type: "web.search",
          payload: { query: input.query, results: res.results.length },
        });
        return {
          results: res.results.map((r) => ({
            title: r.title,
            url: r.url,
            publishedDate: r.publishedDate,
            highlights: r.highlights ?? [],
          })),
        };
      } catch (e) {
        return { error: String(e) };
      }
    },
  });
}

export function webFetchTool({ repo, runId, agentId, taskId }: SearchToolContext, client: Exa) {
  return createTool({
    id: "webFetch",
    description:
      "Fetch the full content of a web page by URL. Returns title, published date, and text. Returns an array of results, one per URL with maximum 20,000 characters and main contents only.",
    inputSchema: z.object({
      urls: z.array(z.string().url()).describe("The URLs to fetch."),
    }),
    execute: async (input: { urls: string[] }) => {
      try {
        const res = await client.getContents(input.urls, {
          text: {
            maxCharacters: 20000,
          },
        });
        repo.logEvent({
          runId,
          agentId: agentId ?? null,
          taskId: taskId ?? null,
          type: "web.fetch",
          payload: { urls: input.urls },
        });
        return {
          results: res.results.map((result) => ({
            title: result.title,
            publishedDate: result.publishedDate,
            text: result.text,
          })),
        };
      } catch (e) {
        return { error: String(e) };
      }
    },
  });
}
