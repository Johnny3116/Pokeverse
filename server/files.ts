import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

/**
 * Join a single file name onto a directory, refusing anything that is not a plain
 * file name. Callers only pass names from config files or server-generated ids,
 * never raw request input, but this is the backstop.
 */
export function safeJoin(dir: string, name: string): string {
  if (!name || name !== basename(name) || name === "." || name === ".." || name.includes("\\")) {
    throw new Error(`Refusing unsafe file name: ${JSON.stringify(name)}`);
  }
  const full = resolve(dir, name);
  if (!full.startsWith(resolve(dir) + sep)) throw new Error(`Path escapes ${dir}: ${name}`);
  return full;
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Write via temp file + rename so a crash never leaves a half-written file. */
export function atomicWrite(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Keep only the newest `keep` files in a directory (by name, which embeds a timestamp). */
export function pruneOldest(dir: string, keep: number): void {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(resolve(dir, f));
}
