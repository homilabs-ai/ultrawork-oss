import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isLocal(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const localOnly: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin");
  if (!isLocal(c.req.url) || (origin && !isLocal(origin))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
};
