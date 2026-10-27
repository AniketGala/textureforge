import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createProjectSchema, updateProjectSchema, createRecipeSchema, formatValidationError } from "../lib/validation";
export const projectsRouter = Router();
projectsRouter.get("/", async (_req, res) => res.json(await prisma.project.findMany({ orderBy: { updatedAt: "desc" } })));
projectsRouter.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: formatValidationError(parsed.error) });
  const project = await prisma.project.create({ data: parsed.data });
  return res.status(201).json(project);
});
projectsRouter.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { recipes: true } });
  return project ? res.json(project) : res.status(404).json({ error: "Project not found" });
});
projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: formatValidationError(parsed.error) });
  const exists = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ error: "Project not found" });
  return res.json(await prisma.project.update({ where: { id: req.params.id }, data: parsed.data }));
});
projectsRouter.delete("/:id", async (req, res) => {
  const exists = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ error: "Project not found" });
  await prisma.project.delete({ where: { id: req.params.id } });
  return res.status(204).end();
});
projectsRouter.get("/:id/recipes", async (req, res) => {
  const exists = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ error: "Project not found" });
  return res.json(await prisma.effectRecipe.findMany({ where: { projectId: req.params.id }, orderBy: { updatedAt: "desc" } }));
});
projectsRouter.post("/:id/recipes", async (req, res) => {
  const parsed = createRecipeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: formatValidationError(parsed.error) });
  const exists = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ error: "Project not found" });
  // Express JSON bodies are JSON-serializable; give Prisma the matching JSON array type.
  return res.status(201).json(await prisma.effectRecipe.create({ data: { ...parsed.data, effects: parsed.data.effects as unknown as Prisma.InputJsonArray, projectId: req.params.id } }));
});
projectsRouter.get("/:id/recipes/:recipeId", async (req, res) => {
  const recipe = await prisma.effectRecipe.findFirst({ where: { id: req.params.recipeId, projectId: req.params.id } });
  return recipe ? res.json(recipe) : res.status(404).json({ error: "Recipe not found" });
});
