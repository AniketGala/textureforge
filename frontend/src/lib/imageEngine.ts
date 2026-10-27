export type EffectType = "noise" | "grain" | "contrast" | "saturation" | "brightness" | "hue" | "blur" | "vignette" | "posterize" | "warp" | "cellular";

export type EffectConfig = {
  type: EffectType;
  amount?: number;
  scale?: number;
  enabled?: boolean;
};

export type ImageFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const amountOf = (effect: EffectConfig, fallback = 0) => Number.isFinite(effect.amount) ? effect.amount as number : fallback;

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCell(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function mapRgb(frame: ImageFrame, mapper: (r: number, g: number, b: number, x: number, y: number) => [number, number, number]): ImageFrame {
  const output = new Uint8ClampedArray(frame.data);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      const [r, g, b] = mapper(output[i], output[i + 1], output[i + 2], x, y);
      output[i] = clamp(r, 0, 255);
      output[i + 1] = clamp(g, 0, 255);
      output[i + 2] = clamp(b, 0, 255);
    }
  }
  return { ...frame, data: output };
}

function blur(frame: ImageFrame, radius: number): ImageFrame {
  const r = Math.round(clamp(radius, 0, 12));
  if (r === 0) return { ...frame, data: new Uint8ClampedArray(frame.data) };
  const { width, height } = frame;
  const horizontal = new Uint8ClampedArray(frame.data.length);
  const output = new Uint8ClampedArray(frame.data.length);
  const diameter = r * 2 + 1;

  for (let y = 0; y < height; y++) {
    const sums = [0, 0, 0, 0];
    for (let dx = -r; dx <= r; dx++) {
      const i = (y * width + clamp(dx, 0, width - 1)) * 4;
      for (let c = 0; c < 4; c++) sums[c] += frame.data[i + c];
    }
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) horizontal[out + c] = sums[c] / diameter;
      const remove = (y * width + clamp(x - r, 0, width - 1)) * 4;
      const add = (y * width + clamp(x + r + 1, 0, width - 1)) * 4;
      for (let c = 0; c < 4; c++) sums[c] += frame.data[add + c] - frame.data[remove + c];
    }
  }

  for (let x = 0; x < width; x++) {
    const sums = [0, 0, 0, 0];
    for (let dy = -r; dy <= r; dy++) {
      const i = (clamp(dy, 0, height - 1) * width + x) * 4;
      for (let c = 0; c < 4; c++) sums[c] += horizontal[i + c];
    }
    for (let y = 0; y < height; y++) {
      const out = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) output[out + c] = sums[c] / diameter;
      const remove = (clamp(y - r, 0, height - 1) * width + x) * 4;
      const add = (clamp(y + r + 1, 0, height - 1) * width + x) * 4;
      for (let c = 0; c < 4; c++) sums[c] += horizontal[add + c] - horizontal[remove + c];
    }
  }
  return { ...frame, data: output };
}

function rotateHue(r: number, g: number, b: number, degrees: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = h * 60;
  }
  h = ((h + degrees) % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

function applyOne(frame: ImageFrame, effect: EffectConfig, seed: number): ImageFrame {
  const amount = amountOf(effect);
  switch (effect.type) {
    case "brightness":
      return mapRgb(frame, (r, g, b) => [r + amount * 255, g + amount * 255, b + amount * 255]);
    case "contrast": {
      const factor = 1 + clamp(amount, -0.8, 1) * 1.65;
      return mapRgb(frame, (r, g, b) => [(r - 128) * factor + 128, (g - 128) * factor + 128, (b - 128) * factor + 128]);
    }
    case "saturation":
      return mapRgb(frame, (r, g, b) => {
        const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
        return [luma + (r - luma) * amount, luma + (g - luma) * amount, luma + (b - luma) * amount];
      });
    case "hue":
      return mapRgb(frame, (r, g, b) => rotateHue(r, g, b, amount));
    case "noise":
    case "grain": {
      const random = seededRandom(seed);
      const amplitude = clamp(amount, 0, 1) * 110;
      return mapRgb(frame, (r, g, b) => {
        if (effect.type === "grain") {
          const n = (random() * 2 - 1) * amplitude;
          return [r + n, g + n, b + n];
        }
        return [r + (random() * 2 - 1) * amplitude, g + (random() * 2 - 1) * amplitude, b + (random() * 2 - 1) * amplitude];
      });
    }
    case "blur":
      return blur(frame, amount);
    case "vignette":
      return mapRgb(frame, (r, g, b, x, y) => {
        const dx = (x / Math.max(1, frame.width - 1) - 0.5) * 2;
        const dy = (y / Math.max(1, frame.height - 1) - 0.5) * 2;
        const falloff = 1 - clamp(amount, 0, 1) * Math.min(1, (dx * dx + dy * dy) / 2);
        return [r * falloff, g * falloff, b * falloff];
      });
    case "posterize": {
      const levels = Math.round(clamp(amount, 2, 16));
      const step = 255 / (levels - 1);
      return mapRgb(frame, (r, g, b) => [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step]);
    }
    case "warp": {
      const output = new Uint8ClampedArray(frame.data.length);
      const amplitude = clamp(amount, 0, 1) * Math.min(frame.width, frame.height) * 0.08;
      const frequency = clamp(effect.scale ?? 0.08, 0.01, 0.4) * Math.PI * 2;
      const phase = (seed >>> 0) / 4294967296 * Math.PI * 2;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const sx = Math.round(clamp(x + Math.sin(y * frequency + phase) * amplitude, 0, frame.width - 1));
          const sy = Math.round(clamp(y + Math.cos(x * frequency + phase) * amplitude, 0, frame.height - 1));
          const from = (sy * frame.width + sx) * 4, to = (y * frame.width + x) * 4;
          output[to] = frame.data[from]; output[to + 1] = frame.data[from + 1]; output[to + 2] = frame.data[from + 2]; output[to + 3] = frame.data[from + 3];
        }
      }
      return { ...frame, data: output };
    }
    case "cellular": {
      const output = new Uint8ClampedArray(frame.data);
      const cellSize = Math.max(5, 1 / clamp(effect.scale ?? 0.07, 0.01, 0.3));
      const mix = clamp(amount, 0, 1) * 0.65;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
          let nearest = Number.POSITIVE_INFINITY;
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
              const fx = (gx + hashCell(gx, gy, seed)) * cellSize;
              const fy = (gy + hashCell(gy, gx, seed + 1)) * cellSize;
              nearest = Math.min(nearest, Math.hypot(x - fx, y - fy));
            }
          }
          const cellValue = clamp(255 - nearest / cellSize * 255, 0, 255);
          const i = (y * frame.width + x) * 4;
          output[i] = frame.data[i] * (1 - mix) + cellValue * mix;
          output[i + 1] = frame.data[i + 1] * (1 - mix) + cellValue * mix;
          output[i + 2] = frame.data[i + 2] * (1 - mix) + cellValue * mix;
        }
      }
      return { ...frame, data: output };
    }
  }
}

export function processImage(source: ImageFrame, effects: EffectConfig[], seed: number): ImageFrame {
  let current: ImageFrame = { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index];
    if (effect.enabled === false) continue;
    current = applyOne(current, effect, seed + index * 1013);
  }
  return current;
}

export function createDemoFrame(width = 720, height = 480): ImageFrame {
  const random = seededRandom(2026);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wave = (Math.sin(x * 0.025 + Math.sin(y * 0.018) * 1.8) + Math.cos(y * 0.031 - x * 0.008) + 2) / 4;
      const grain = (random() - 0.5) * 20;
      const i = (y * width + x) * 4;
      data[i] = clamp(28 + wave * 86 + grain, 0, 255);
      data[i + 1] = clamp(34 + wave * 44 + grain, 0, 255);
      data[i + 2] = clamp(52 + (1 - wave) * 112 + grain, 0, 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function randomizeEffects(effects: EffectConfig[], seed: number): EffectConfig[] {
  const random = seededRandom(seed);
  const between = (min: number, max: number) => min + random() * (max - min);
  return effects.map((effect) => {
    let amount: number;
    switch (effect.type) {
      case "hue": amount = between(-180, 180); break;
      case "brightness": amount = between(-0.25, 0.25); break;
      case "saturation": amount = between(0.2, 1.8); break;
      case "blur": amount = Math.round(between(0, 7)); break;
      case "posterize": amount = Math.round(between(3, 12)); break;
      case "contrast": amount = between(-0.2, 0.7); break;
      default: amount = between(0.06, 0.55);
    }
    const scale = ["noise", "grain", "cellular", "warp"].includes(effect.type) ? between(0.025, 0.18) : effect.scale;
    return { ...effect, amount, ...(scale === undefined ? {} : { scale }) };
  });
}
