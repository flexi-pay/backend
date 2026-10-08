// Minimal HTTP toolkit on node:http — routing, JSON bodies, CORS. No framework needed.
import type { IncomingMessage, ServerResponse } from "node:http";

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  headers: IncomingMessage["headers"];
  ip: string;
  body: () => Promise<unknown>;
}

export interface Res {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type Handler = (req: Req) => Promise<Res> | Res;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (body: unknown, status = 200): Res => ({ status, body });
export const error = (status: number, message: string): Res => ({ status, body: { error: message } });

interface Route { method: string; parts: string[]; handler: Handler }

export class Router {
  private routes: Route[] = [];
  on(method: string, pattern: string, handler: Handler) {
    this.routes.push({ method, parts: pattern.split("/").filter(Boolean), handler });
    return this;
  }
  get(p: string, h: Handler) { return this.on("GET", p, h); }
  post(p: string, h: Handler) { return this.on("POST", p, h); }
  delete(p: string, h: Handler) { return this.on("DELETE", p, h); }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | "method" | null {
    const segs = path.split("/").filter(Boolean);
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      const ok = r.parts.every((p, i) => (p.startsWith(":") ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]));
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method) return { handler: r.handler, params };
    }
    return pathMatched ? "method" : null;
  }
}

const MAX_BODY = 16 * 1024;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "Body must be JSON")); }
    });
    req.on("error", reject);
  });
}

export function corsHeaders(origin: string | undefined, allowed: string[]): Record<string, string> {
  const allowAny = allowed.includes("*");
  const value = allowAny ? "*" : origin && allowed.includes(origin) ? origin : "";
  if (!value) return {};
  return {
    "access-control-allow-origin": value,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...(allowAny ? {} : { vary: "origin" }),
  };
}

/** Adapts a Router to node:http's request listener. */
export function listener(router: Router, opts: { cors: string[]; onError?: (e: unknown) => void }) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://local");
    const cors = corsHeaders(req.headers.origin, opts.cors);
    const send = (r: Res) => {
      const isText = typeof r.body === "string";
      const headers = { "content-type": isText ? "text/plain; charset=utf-8" : "application/json", ...cors, ...r.headers };
      res.writeHead(r.status, headers);
      res.end(r.body === undefined ? undefined : isText ? (r.body as string) : JSON.stringify(r.body));
    };
    if (req.method === "OPTIONS") return send({ status: 204 });
    const m = router.match(req.method ?? "GET", url.pathname);
    if (m === null) return send(error(404, "Not found"));
    if (m === "method") return send(error(405, "Method not allowed"));
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    try {
      send(await m.handler({ method: req.method ?? "GET", path: url.pathname, query: url.searchParams, params: m.params, headers: req.headers, ip, body: () => readBody(req) }));
    } catch (e) {
      if (e instanceof HttpError) return send(error(e.status, e.message));
      opts.onError?.(e);
      send(error(500, "Internal error"));
    }
  };
}
