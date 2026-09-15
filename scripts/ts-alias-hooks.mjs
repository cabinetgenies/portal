// Resolution hooks that let `node --test` run the pure TypeScript domain tests
// directly (Node strips the types), while the source keeps using the `@/` alias
// that Next.js applications use everywhere else.
//
// Only used by `npm test`. Next.js never loads this file.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const base = path.join(projectRoot, specifier.slice(2));

  for (const candidate of [
    base,
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ]) {
    try {
      return await nextResolve(pathToFileURL(candidate).href, context);
    } catch {
      // Try the next candidate.
    }
  }

  return nextResolve(pathToFileURL(base).href, context);
}
