import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const presets = [
  { name: "Soft Marble", effects: [{ type: "noise", amount: 0.22, scale: 0.55 }, { type: "warp", amount: 0.18, scale: 0.08 }, { type: "contrast", amount: 0.16 }], randomSeed: 17 },
  { name: "Woven Paper", effects: [{ type: "grain", amount: 0.24, scale: 0.8 }, { type: "noise", amount: 0.08, scale: 0.35 }, { type: "saturation", amount: 0.72 }], randomSeed: 42 },
  { name: "Weathered Stone", effects: [{ type: "cellular", amount: 0.32, scale: 0.07 }, { type: "contrast", amount: 0.26 }, { type: "grain", amount: 0.14, scale: 0.5 }], randomSeed: 81 },
  { name: "Neon Circuit", effects: [{ type: "posterize", amount: 5 }, { type: "hue", amount: 145 }, { type: "contrast", amount: 0.36 }, { type: "noise", amount: 0.12 }], randomSeed: 126 },
  { name: "Frosted Glass", effects: [{ type: "blur", amount: 2 }, { type: "saturation", amount: 0.62 }, { type: "brightness", amount: 0.08 }], randomSeed: 215 },
  { name: "Solarized Metal", effects: [{ type: "hue", amount: -72 }, { type: "contrast", amount: 0.3 }, { type: "vignette", amount: 0.22 }, { type: "grain", amount: 0.12 }], randomSeed: 314 }
];
async function main() {
  // Seed a clearly named example project only when it does not already exist.
  const project = await prisma.project.upsert({ where: { id: "textureforge-starter-presets" }, update: {}, create: { id: "textureforge-starter-presets", name: "Starter Presets" } });
  for (const preset of presets) {
    const exists = await prisma.effectRecipe.findFirst({ where: { projectId: project.id, name: preset.name } });
    if (exists) await prisma.effectRecipe.update({ where: { id: exists.id }, data: { effects: preset.effects, randomSeed: preset.randomSeed } });
    else await prisma.effectRecipe.create({ data: { ...preset, projectId: project.id } });
  }
}
main().finally(() => prisma.$disconnect());

