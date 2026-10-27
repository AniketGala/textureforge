import type { EffectConfig } from "./imageEngine";
import { ProjectSaveRecoveryError } from "./projectSaveErrors";

export type Recipe = {
  id: string;
  projectId: string;
  name: string;
  effects: EffectConfig[];
  randomSeed: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  recipes?: Recipe[];
};

export type Preset = { id: string; name: string; effects: EffectConfig[] };

const configuredBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "/api";
export const API_BASE_URL = configuredBase.replace(/\/+$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export const listPresets = () => request<Preset[]>("/presets");
export const listProjects = () => request<Project[]>("/projects");
export const getProject = (id: string) => request<Project>(`/projects/${encodeURIComponent(id)}`);
export const deleteProject = (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function saveProject(input: {
  id?: string;
  name: string;
  width: number;
  height: number;
  effects: EffectConfig[];
  randomSeed: number;
}): Promise<Project> {
  let project: Project;
  if (input.id) {
    project = await getProject(input.id);
  } else {
    project = await request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name: input.name, width: input.width, height: input.height })
    });
  }

  try {
    await request<Recipe>(`/projects/${encodeURIComponent(project.id)}/recipes`, {
      method: "POST",
      body: JSON.stringify({ name: input.name, effects: input.effects, randomSeed: input.randomSeed })
    });
    if (input.id) {
      return await request<Project>(`/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name, width: input.width, height: input.height })
      });
    }
    return await getProject(project.id);
  } catch (error) {
    if (!input.id) {
      try {
        await deleteProject(project.id);
      } catch (cleanupError) {
        const saveMessage = error instanceof Error ? error.message : "Project settings could not be saved.";
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "The incomplete project could not be removed.";
        throw new ProjectSaveRecoveryError(
          project,
          `${saveMessage} The created project remains on the server with ID ${project.id}; retrying will update that same project. ${cleanupMessage}`,
          { cause: error }
        );
      }
    }
    throw error;
  }
}
