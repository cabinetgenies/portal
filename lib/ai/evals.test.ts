import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

type EvalCase = {
  id: string;
  category: string;
  prompt: string;
  expected: Record<string, unknown>;
};

const cases = JSON.parse(
  readFileSync(path.join(process.cwd(), "ai", "evals", "cases.json"), "utf8"),
) as EvalCase[];

test("the evaluation catalog has at least 30 labeled cases", () => {
  assert.ok(cases.length >= 30);
});

test("evaluation case ids are unique", () => {
  const ids = new Set(cases.map((item) => item.id));
  assert.equal(ids.size, cases.length);
});

test("every evaluation case has a prompt and expected behavior", () => {
  for (const item of cases) {
    assert.ok(item.prompt.length > 0, `${item.id} is missing a prompt`);
    assert.ok(item.expected && typeof item.expected === "object", `${item.id} is missing expected`);
  }
});

