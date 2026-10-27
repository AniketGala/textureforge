import { z } from "zod";
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(120), width: z.number().int().min(1).max(8192).optional(), height: z.number().int().min(1).max(8192).optional() });
export const updateProjectSchema = createProjectSchema.partial().refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
export const createRecipeSchema = z.object({ name: z.string().trim().min(1).max(120), effects: z.array(z.record(z.string(), z.unknown())), randomSeed: z.number().int().optional() });
export const formatValidationError = (error: z.ZodError) => z.flattenError(error);
