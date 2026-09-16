import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(
  readFileSync(path.join(root, "ai", "evals", "cases.json"), "utf8"),
);

const categories = new Set(cases.map((item) => item.category));
const ids = new Set(cases.map((item) => item.id));

console.log(`Evaluation catalog: ${cases.length} cases, ${categories.size} categories.`);
console.log(`Unique ids: ${ids.size === cases.length ? "yes" : "no"}.`);

const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL || "gpt-5-mini";
const limit = Number(process.env.AI_EVAL_LIMIT || 0);

if (!apiKey || !Number.isInteger(limit) || limit <= 0) {
  console.log(
    "Live model evaluation skipped (set AI_API_KEY and AI_EVAL_LIMIT > 0 to run).",
  );
  process.exit(0);
}

const provider = createOpenAI({
  apiKey,
  baseURL: process.env.AI_BASE_URL || undefined,
});

try {
  const started = Date.now();
  await generateText({
    model: provider(model),
    output: Output.object({
      schema: z.object({ ok: z.boolean() }),
    }),
    prompt:
      "Reply with {\"ok\":true} only. This is a structured-output provider smoke test for the Cabinet Genies assistant.",
  });

  console.log(
    `Provider smoke test passed in ${Date.now() - started}ms using model ${model}.`,
  );
  console.log("Full case-by-case live grading is not wired in this first release.");
  process.exit(0);
} catch (error) {
  console.error("Provider smoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
