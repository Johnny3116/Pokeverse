import { resolve } from "node:path";

export type Config = {
  host: string;
  port: number;
  dataDir: string;
  /** ROMs, box art, BIOS and games.json. Defaults to <dataDir>/library. */
  libraryDir: string;
  /** Built SPA (vite build output). */
  staticDir: string;
  /** Built-in checklist templates shipped with the app. */
  builtinChecklistDir: string;
  production: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const root = resolve(import.meta.dirname, "..");
  const dataDir = resolve(env.DATA_DIR ?? resolve(root, "data"));
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`Invalid PORT: ${env.PORT}`);
  return {
    // Localhost by default: the app is meant to sit behind Tailscale Serve.
    host: env.HOST ?? "127.0.0.1",
    port,
    dataDir,
    libraryDir: resolve(env.LIBRARY_DIR ?? resolve(dataDir, "library")),
    staticDir: resolve(env.STATIC_DIR ?? resolve(root, "dist")),
    builtinChecklistDir: resolve(root, "checklists"),
    production: env.NODE_ENV === "production",
  };
}
