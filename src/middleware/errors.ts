import { Request, Response, NextFunction } from "express";
export function notFound(_req: Request, res: Response) { res.status(404).json({ error: "Not found" }); }
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Never log raw Prisma errors: they can include connection metadata.
  console.error("Unhandled API error", err instanceof Error ? err.name : "UnknownError");
  const message = "Internal server error";
  const status = (err as { status?: number })?.status ?? 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : message });
}
