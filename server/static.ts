import { resolve, sep } from "node:path";
import { isFile } from "./files.ts";
import { json } from "./http.ts";

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  // External walkthrough sites may be embedded in the guide panel.
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// The emulator page loads the WASM core and its glue from blobs. connect-src 'self'
// keeps EmulatorJS from reaching its CDN (update checks, core fallbacks).
const EMULATOR_CSP = [
  "default-src 'self'",
  "script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export function securityHeaders(res: Response, pathname: string): Response {
  const h = new Headers(res.headers);
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "no-referrer");
  h.set("cross-origin-opener-policy", "same-origin");
  if ((h.get("content-type") ?? "").includes("text/html")) {
    h.set("content-security-policy", pathname.startsWith("/emulator") ? EMULATOR_CSP : APP_CSP);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export async function serveStatic(
  root: string,
  pathname: string,
  method: string,
): Promise<Response> {
  if (method !== "GET" && method !== "HEAD")
    return json({ error: "Method not allowed" }, { status: 405 });
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return json({ error: "Bad path" }, { status: 400 });
  }
  const base = resolve(root);
  const target = resolve(base, "." + decoded);
  if (target !== base && !target.startsWith(base + sep))
    return json({ error: "Not found" }, { status: 404 });

  if (isFile(target)) {
    const immutable = decoded.startsWith("/assets/");
    const cache = immutable
      ? "public, max-age=31536000, immutable"
      : decoded.startsWith("/vendor/")
        ? "public, max-age=86400"
        : "no-cache";
    return new Response(Bun.file(target), { headers: { "cache-control": cache } });
  }
  if (decoded === "/emulator" && isFile(resolve(base, "emulator.html"))) {
    return new Response(Bun.file(resolve(base, "emulator.html")), {
      headers: { "cache-control": "no-cache" },
    });
  }
  // Unknown file-looking paths 404; everything else is a client-side route.
  if (/\.[a-z0-9]+$/i.test(decoded)) return json({ error: "Not found" }, { status: 404 });
  const index = resolve(base, "index.html");
  if (!isFile(index)) {
    return new Response("Frontend not built. Run `bun run build`.", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response(Bun.file(index), {
    headers: { "cache-control": "no-cache", "content-type": "text/html; charset=utf-8" },
  });
}
