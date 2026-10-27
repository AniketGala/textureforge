import { deleteProject, saveProject, type Project } from "./api";
import { deleteProjectImage, getProjectImage, saveProjectImage } from "./projectImages";
import { ProjectSaveRecoveryError } from "./projectSaveErrors";

export type ProjectSaveInput = Parameters<typeof saveProject>[0];
export type ProjectImageInput = { blob: Blob; fileName: string; replaceExisting?: boolean };

export type ProjectSaveDependencies = {
  saveProject: typeof saveProject;
  deleteProject: typeof deleteProject;
  getProjectImage: typeof getProjectImage;
  saveProjectImage: typeof saveProjectImage;
  deleteProjectImage: typeof deleteProjectImage;
};

const defaults: ProjectSaveDependencies = {
  saveProject,
  deleteProject,
  getProjectImage,
  saveProjectImage,
  deleteProjectImage
};

export async function saveProjectWorkflow(
  input: ProjectSaveInput,
  image?: ProjectImageInput,
  dependencies: ProjectSaveDependencies = defaults
): Promise<Project> {
  if (input.id) {
    if (!image) return dependencies.saveProject(input);

    if (!image.replaceExisting) {
      const storedImage = await dependencies.getProjectImage(input.id);
      if (storedImage) return dependencies.saveProject(input);
      await dependencies.saveProjectImage(input.id, image.blob, image.fileName);
      return dependencies.saveProject(input);
    }

    const previousImage = await dependencies.getProjectImage(input.id);
    await dependencies.saveProjectImage(input.id, image.blob, image.fileName);
    try {
      return await dependencies.saveProject(input);
    } catch (apiError) {
      try {
        if (previousImage) {
          await dependencies.saveProjectImage(input.id, previousImage.blob, previousImage.fileName);
        } else {
          await dependencies.deleteProjectImage(input.id);
        }
      } catch (restoreError) {
        const apiMessage = apiError instanceof Error ? apiError.message : "The API could not save project settings.";
        const restoreMessage = restoreError instanceof Error ? restoreError.message : "The previous source image could not be restored.";
        throw new Error(`${apiMessage} The source image rollback also failed: ${restoreMessage}`);
      }
      throw apiError;
    }
  }

  const project = await dependencies.saveProject(input);
  if (!image) return project;

  try {
    await dependencies.saveProjectImage(project.id, image.blob, image.fileName);
  } catch (imageError) {
    try {
      await dependencies.deleteProject(project.id);
    } catch (cleanupError) {
      const imageMessage = imageError instanceof Error ? imageError.message : "The image could not be stored in this browser.";
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "The API could not remove the incomplete project.";
      throw new ProjectSaveRecoveryError(
        project,
        `${imageMessage} The project remains on the server with ID ${project.id}; retrying will update that same project. ${cleanupMessage}`,
        { cause: imageError }
      );
    }
    throw imageError;
  }
  return project;
}
