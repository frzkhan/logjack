import type { Source } from "../core/types.js";

export function parseTailSource(input: string): Source {
  const idx = input.indexOf(":");
  if (idx <= 0 || idx === input.length - 1) {
    throw new Error(`Invalid --tail value "${input}". Expected "name:/path/to/file.log".`);
  }
  const name = input.slice(0, idx).trim();
  const filePath = input.slice(idx + 1).trim();
  if (!name || !filePath) {
    throw new Error(`Invalid --tail value "${input}". Expected "name:/path/to/file.log".`);
  }
  return { name, filePath };
}
