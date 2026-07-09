import type { Request, Response, NextFunction } from "express";
import { config } from "../../config";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (config.isDev && process.env.SKIP_AUTH === "true") {
    next();
    return;
  }

  const key =
    req.header("x-api-key") ||
    (req.header("authorization")?.startsWith("Bearer ")
      ? req.header("authorization")!.slice(7)
      : undefined);

  if (!key || key !== config.server.apiKey) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "internal error";
  const status = (err as { status?: number })?.status ?? 500;
  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "not found" });
}
