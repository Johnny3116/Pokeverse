import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });

export const bytes = (
  data: Uint8Array,
  contentType = "application/octet-stream",
  extra: HeadersInit = {},
) =>
  new Response(data as Uint8Array<ArrayBuffer>, {
    headers: { "content-type": contentType, "cache-control": "no-store", ...extra },
  });

export const noContent = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function readJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  maxBytes = 256 * 1024,
): Promise<z.infer<T>> {
  const raw = await readBody(req, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new HttpError(400, "Invalid request body", result.error.flatten());
  return result.data;
}

export async function readBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, `Body exceeds ${maxBytes} bytes`);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new HttpError(413, `Body exceeds ${maxBytes} bytes`);
  return buf;
}

export function parseParam<T extends z.ZodTypeAny>(
  schema: T,
  value: string | undefined,
  name: string,
): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, `Invalid ${name}`);
  return r.data;
}

type Handler = (
  req: Request,
  params: Record<string, string>,
  url: URL,
) => Response | Promise<Response>;
type Route = { method: string; regex: RegExp; keys: string[]; handler: Handler };

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const regex = new RegExp(
      "^" +
        pattern.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
          keys.push(k);
          return "([^/]+)";
        }) +
        "/?$",
    );
    this.routes.push({ method, regex, keys, handler });
    return this;
  }

  async handle(req: Request, url: URL): Promise<Response | null> {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method && !(r.method === "GET" && req.method === "HEAD")) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]!);
      });
      return r.handler(req, params, url);
    }
    if (pathMatched) throw new HttpError(405, "Method not allowed");
    return null;
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json(e.body ?? { error: e.message, ...(e.details ? { details: e.details } : {}) }, {
      status: e.status,
    });
  }
  console.error("[server] unhandled error", e);
  return json({ error: "Internal server error" }, { status: 500 });
}
