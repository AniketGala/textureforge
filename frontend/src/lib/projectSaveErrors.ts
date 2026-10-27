import type { Project } from "./api";

export class ProjectSaveRecoveryError extends Error {
  constructor(readonly project: Project, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectSaveRecoveryError";
  }
}
