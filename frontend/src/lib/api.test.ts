import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProject } from "./api";
import { ProjectSaveRecoveryError } from "./projectSaveErrors";

const createdProject = {
  id: "project-abc",
  name: "Granite",
  width: 640,
  height: 480,
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("saveProject API contract", () => {
  it("creates project metadata, posts its recipe, then returns the project using the created ID", async () => {
    const savedWithRecipe = { ...createdProject, recipes: [{ id: "recipe-1", projectId: createdProject.id }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(createdProject, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "recipe-1" }, 201))
      .mockResolvedValueOnce(jsonResponse(savedWithRecipe));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveProject({
      name: "Granite", width: 640, height: 480,
      effects: [{ type: "grain", amount: 0.4 }], randomSeed: 91
    });

    expect(saved.id).toBe(createdProject.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/projects$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Granite", width: 640, height: 480 });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/projects\/project-abc\/recipes$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ name: "Granite", randomSeed: 91, effects: [{ type: "grain", amount: 0.4 }] });
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/projects\/project-abc$/);
  });

  it("keeps the existing project ID while saving a recipe and updating its metadata", async () => {
    const input = { id: "project-abc", name: "Granite v2", width: 800, height: 600, effects: [{ type: "noise" as const, amount: 0.2 }], randomSeed: 12 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(createdProject))
      .mockResolvedValueOnce(jsonResponse({ id: "recipe-2" }, 201))
      .mockResolvedValueOnce(jsonResponse({ ...createdProject, ...input }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveProject(input);

    expect(saved.id).toBe(input.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/projects\/project-abc\/recipes$/);
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/projects\/project-abc$/);
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ name: input.name, width: input.width, height: input.height });
  });

  it("preserves a created project ID if recipe failure cleanup also fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(createdProject, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "Recipe rejected" }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: "Delete rejected" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    const error = await saveProject({
      name: "Granite", width: 640, height: 480, effects: [], randomSeed: 91
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProjectSaveRecoveryError);
    expect((error as ProjectSaveRecoveryError).project.id).toBe(createdProject.id);
    expect((error as Error).message).toContain("retrying will update that same project");
  });
});
