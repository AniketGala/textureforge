import { describe, expect, it } from "vitest";
import { processImage, randomizeEffects, type EffectConfig, type ImageFrame } from "./imageEngine";

const sample: ImageFrame = {
  width: 3,
  height: 2,
  data: new Uint8ClampedArray([
    40, 70, 100, 255, 80, 110, 140, 255, 120, 150, 180, 255,
    60, 90, 120, 255, 100, 130, 160, 255, 140, 170, 200, 255
  ])
};

describe("image processing engine", () => {
  it("returns an identical copy when no effects are enabled", () => {
    const output = processImage(sample, [{ type: "contrast", amount: 0, enabled: false }], 9);
    expect(output.data).toEqual(sample.data);
    expect(output.data).not.toBe(sample.data);
  });

  it("applies a real brightness transform and preserves alpha", () => {
    const output = processImage(sample, [{ type: "brightness", amount: 0.2 }], 9);
    expect(output.data[0]).toBeGreaterThan(sample.data[0]);
    expect(output.data[3]).toBe(255);
  });

  it("produces repeatable seeded noise and different results for another seed", () => {
    const effects: EffectConfig[] = [{ type: "noise", amount: 0.5 }];
    const first = processImage(sample, effects, 123);
    const second = processImage(sample, effects, 123);
    const third = processImage(sample, effects, 124);
    expect(first.data).toEqual(second.data);
    expect(first.data).not.toEqual(third.data);
  });

  it("applies blur without changing the frame dimensions", () => {
    const output = processImage(sample, [{ type: "blur", amount: 1 }], 5);
    expect(output.width).toBe(sample.width);
    expect(output.height).toBe(sample.height);
    expect(output.data).not.toEqual(sample.data);
  });

  it("randomizes parameters deterministically from its seed", () => {
    const effects: EffectConfig[] = [{ type: "hue", amount: 10 }, { type: "noise", amount: 0.1 }];
    expect(randomizeEffects(effects, 100)).toEqual(randomizeEffects(effects, 100));
    expect(randomizeEffects(effects, 100)).not.toEqual(randomizeEffects(effects, 101));
  });
});
