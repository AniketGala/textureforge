import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";

const mocks = vi.hoisted(() => ({
  project: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  effectRecipe: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() }
}));
vi.mock("../lib/prisma", () => ({ prisma: mocks }));

let apiBase = "";
let server: Server | undefined;
let appRef: Express | undefined;

beforeAll(async () => {
  process.env.CORS_ORIGIN = "http://localhost:5173";
  ({ app: appRef } = await import("../app"));
  server = appRef.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server?.once("listening", resolve);
    server?.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  apiBase = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => vi.clearAllMocks());

describe("project API routes", () => {
  it("reports service health and allows the configured frontend origin", async () => {
    const response = await fetch(`${apiBase}/api/health`, { headers: { origin: "http://localhost:5173" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("returns six usable starter presets", async () => {
    const response = await fetch(`${apiBase}/api/presets`);
    expect(response.status).toBe(200);
    const presets = await response.json();
    expect(presets).toHaveLength(6);
    expect(presets.every((preset: { effects: unknown[] }) => preset.effects.length > 0)).toBe(true);
  });

  it("lists projects", async () => {
    mocks.project.findMany.mockResolvedValue([{ id: "p1", name: "Stone", width: 512, height: 512 }]);
    const response = await fetch(`${apiBase}/api/projects`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ id: "p1", name: "Stone" }]);
  });

  it("validates project creation before writing", async () => {
    const response = await fetch(`${apiBase}/api/projects`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: " " })
    });
    expect(response.status).toBe(400);
    expect(mocks.project.create).not.toHaveBeenCalled();
  });

  it("creates and opens a project", async () => {
    const project = { id: "p2", name: "Marble", width: 800, height: 600 };
    mocks.project.create.mockResolvedValue(project);
    mocks.project.findUnique.mockResolvedValue({ ...project, recipes: [] });
    const created = await fetch(`${apiBase}/api/projects`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(project)
    });
    expect(created.status).toBe(201);
    const opened = await fetch(`${apiBase}/api/projects/p2`);
    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({ id: "p2", recipes: [] });
  });

  it("updates and deletes a project", async () => {
    mocks.project.findUnique.mockResolvedValue({ id: "p3", name: "Old", width: 512, height: 512 });
    mocks.project.update.mockResolvedValue({ id: "p3", name: "New", width: 1024, height: 768 });
    mocks.project.delete.mockResolvedValue({ id: "p3" });
    const updated = await fetch(`${apiBase}/api/projects/p3`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New", width: 1024, height: 768 })
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ name: "New", width: 1024, height: 768 });
    const removed = await fetch(`${apiBase}/api/projects/p3`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(mocks.project.delete).toHaveBeenCalledWith({ where: { id: "p3" } });
  });

  it("saves recipe effects and the random seed", async () => {
    mocks.project.findUnique.mockResolvedValue({ id: "p4" });
    const recipe = { id: "r1", projectId: "p4", name: "My texture", effects: [{ type: "noise", amount: 0.25 }], randomSeed: 123 };
    mocks.effectRecipe.create.mockResolvedValue(recipe);
    const response = await fetch(`${apiBase}/api/projects/p4/recipes`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: recipe.name, effects: recipe.effects, randomSeed: recipe.randomSeed })
    });
    expect(response.status).toBe(201);
    expect(mocks.effectRecipe.create).toHaveBeenCalledWith({
      data: { name: recipe.name, effects: recipe.effects, randomSeed: 123, projectId: "p4" }
    });
  });
});
