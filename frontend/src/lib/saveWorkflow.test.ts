import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "./api";
import type { ProjectSaveDependencies, ProjectSaveInput } from "./saveWorkflow";
import { saveProjectWorkflow } from "./saveWorkflow";
import { ProjectSaveRecoveryError } from "./projectSaveErrors";

const savedProject: Project = {
  id: "project-123",
  name: "Test material",
  width: 32,
  height: 32,
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z"
};

const newInput: ProjectSaveInput = {
  name: savedProject.name,
  width: savedProject.width,
  height: savedProject.height,
  effects: [{ type: "noise", amount: 0.3 }],
  randomSeed: 42
};

function makeDependencies(overrides: Partial<ProjectSaveDependencies> = {}): ProjectSaveDependencies {
  return {
    saveProject: vi.fn().mockResolvedValue(savedProject),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    getProjectImage: vi.fn().mockResolvedValue(undefined),
    saveProjectImage: vi.fn().mockResolvedValue("project-123"),
    deleteProjectImage: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as ProjectSaveDependencies;
}

const newImage = { blob: new Blob(["original PNG bytes"], { type: "image/png" }), fileName: "source.png", replaceExisting: true };

beforeEach(() => vi.clearAllMocks());

describe("project save workflow", () => {
  it("saves project metadata first, then stores the original image under the returned project ID", async () => {
    const calls: string[] = [];
    const dependencies = makeDependencies({
      saveProject: vi.fn(async () => { calls.push("api"); return savedProject; }),
      saveProjectImage: vi.fn(async () => { calls.push("indexeddb"); return "project-123"; })
    });

    const result = await saveProjectWorkflow(newInput, newImage, dependencies);

    expect(result.id).toBe("project-123");
    expect(calls).toEqual(["api", "indexeddb"]);
    expect(dependencies.saveProjectImage).toHaveBeenCalledWith("project-123", newImage.blob, "source.png");
  });

  it("does not write an image or report completion when the API fails", async () => {
    const dependencies = makeDependencies({ saveProject: vi.fn().mockRejectedValue(new Error("API unavailable")) });

    await expect(saveProjectWorkflow(newInput, newImage, dependencies)).rejects.toThrow("API unavailable");
    expect(dependencies.saveProjectImage).not.toHaveBeenCalled();
    expect(dependencies.deleteProject).not.toHaveBeenCalled();
  });

  it("cleans up a newly created project when IndexedDB image storage fails", async () => {
    const dependencies = makeDependencies({ saveProjectImage: vi.fn().mockRejectedValue(new Error("Browser quota exceeded")) });

    await expect(saveProjectWorkflow(newInput, newImage, dependencies)).rejects.toThrow("Browser quota exceeded");
    expect(dependencies.deleteProject).toHaveBeenCalledWith("project-123");
  });

  it("keeps the returned project ID available for a safe retry when API cleanup fails", async () => {
    const dependencies = makeDependencies({
      saveProjectImage: vi.fn().mockRejectedValue(new Error("Browser quota exceeded")),
      deleteProject: vi.fn().mockRejectedValue(new Error("API delete failed"))
    });

    const error = await saveProjectWorkflow(newInput, newImage, dependencies).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProjectSaveRecoveryError);
    expect((error as ProjectSaveRecoveryError).project.id).toBe("project-123");
    expect((error as Error).message).toContain("retrying will update that same project");
  });

  it("updates an existing project's recipe without rewriting its unchanged source image", async () => {
    const dependencies = makeDependencies({
      getProjectImage: vi.fn().mockResolvedValue({ projectId: savedProject.id, blob: newImage.blob, fileName: newImage.fileName, mimeType: "image/png", updatedAt: "2026-10-26T00:00:00.000Z" }),
      saveProject: vi.fn().mockResolvedValue({ ...savedProject, name: "Updated material" })
    });
    const input = { ...newInput, id: savedProject.id, name: "Updated material" };

    const result = await saveProjectWorkflow(input, { ...newImage, replaceExisting: false }, dependencies);

    expect(result.id).toBe(savedProject.id);
    expect(dependencies.saveProject).toHaveBeenCalledWith(input);
    expect(dependencies.getProjectImage).toHaveBeenCalledWith(savedProject.id);
    expect(dependencies.saveProjectImage).not.toHaveBeenCalled();
  });

  it("restores an unchanged in-memory source if its IndexedDB entry went missing", async () => {
    const dependencies = makeDependencies({ getProjectImage: vi.fn().mockResolvedValue(undefined) });
    const input = { ...newInput, id: savedProject.id };

    await saveProjectWorkflow(input, { ...newImage, replaceExisting: false }, dependencies);

    expect(dependencies.saveProjectImage).toHaveBeenCalledWith(savedProject.id, newImage.blob, "source.png");
    expect(dependencies.saveProject).toHaveBeenCalledWith(input);
  });

  it("restores the previous source if an explicit replacement is followed by an API failure", async () => {
    const previousBlob = new Blob(["original source"], { type: "image/jpeg" });
    const dependencies = makeDependencies({
      getProjectImage: vi.fn().mockResolvedValue({ projectId: savedProject.id, blob: previousBlob, fileName: "previous.jpg", mimeType: "image/jpeg", updatedAt: "2026-10-26T00:00:00.000Z" }),
      saveProject: vi.fn().mockRejectedValue(new Error("Recipe request failed"))
    });
    const input = { ...newInput, id: savedProject.id };

    await expect(saveProjectWorkflow(input, newImage, dependencies)).rejects.toThrow("Recipe request failed");
    expect(dependencies.saveProjectImage).toHaveBeenNthCalledWith(1, savedProject.id, newImage.blob, "source.png");
    expect(dependencies.saveProjectImage).toHaveBeenNthCalledWith(2, savedProject.id, previousBlob, "previous.jpg");
  });

  it("does not call the API if storing an explicit replacement fails", async () => {
    const dependencies = makeDependencies({ saveProjectImage: vi.fn().mockRejectedValue(new Error("Browser quota exceeded")) });
    const input = { ...newInput, id: savedProject.id };

    await expect(saveProjectWorkflow(input, newImage, dependencies)).rejects.toThrow("Browser quota exceeded");
    expect(dependencies.saveProject).not.toHaveBeenCalled();
  });
});
