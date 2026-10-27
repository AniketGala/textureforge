import { Router } from "express";
export const presetsRouter = Router();
export const presets = [
  { id: "marble", name: "Soft Marble", effects: [{ type: "noise", amount: 0.22, scale: 0.55 }, { type: "warp", amount: 0.18, scale: 0.08 }, { type: "contrast", amount: 0.16 }] },
  { id: "paper", name: "Woven Paper", effects: [{ type: "grain", amount: 0.24, scale: 0.8 }, { type: "noise", amount: 0.08, scale: 0.35 }, { type: "saturation", amount: 0.72 }] },
  { id: "stone", name: "Weathered Stone", effects: [{ type: "cellular", amount: 0.32, scale: 0.07 }, { type: "contrast", amount: 0.26 }, { type: "grain", amount: 0.14, scale: 0.5 }] },
  { id: "circuit", name: "Neon Circuit", effects: [{ type: "posterize", amount: 5 }, { type: "hue", amount: 145 }, { type: "contrast", amount: 0.36 }, { type: "noise", amount: 0.12, scale: 0.2 }] },
  { id: "frost", name: "Frosted Glass", effects: [{ type: "blur", amount: 2 }, { type: "saturation", amount: 0.62 }, { type: "brightness", amount: 0.08 }, { type: "grain", amount: 0.06, scale: 0.9 }] },
  { id: "solar", name: "Solarized Metal", effects: [{ type: "hue", amount: -72 }, { type: "contrast", amount: 0.3 }, { type: "vignette", amount: 0.22 }, { type: "grain", amount: 0.12, scale: 0.6 }] }
];
presetsRouter.get("/", (_req, res) => res.json(presets));
