import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../lib/ids";
import { compressImage, resizeDimensions } from "../lib/image";
import { parseIngredientInput } from "../lib/ingredients";
import { photoPickerProps } from "../lib/photo-picker";
import { serializeStoredState, parseStoredState } from "../lib/store";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fix1 utility regressions", () => {
  it("splits ingredient input only when explicitly parsed", () => {
    expect(parseIngredientInput("花生, 牛奶，鸡蛋、面粉;芝麻；葱花 番茄")).toEqual([
      "花生", "牛奶", "鸡蛋", "面粉", "芝麻", "葱花", "番茄",
    ]);
  });

  it("resizes images proportionally so the longest side is at most 1600 pixels", () => {
    expect(resizeDimensions(4000, 2000)).toEqual({ width: 1600, height: 800 });
    expect(resizeDimensions(900, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it("falls back to the original photo and reports compression failure", async () => {
    const original = new File(["photo"], "menu.png", { type: "image/png" });
    const compressed = await compressImage(original, async () => {
      throw new Error("decoder failure");
    });
    expect(compressed.file).toBe(original);
    expect(compressed.failed).toBe(true);
  });

  it("encodes resized photos as JPEG at quality 0.8", async () => {
    const original = new File(["photo"], "menu.png", { type: "image/png" });
    const bitmap = { width: 4000, height: 2000, close() {} } as ImageBitmap;
    let encodedType = "";
    let encodedQuality = 0;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {}, fillRect() {}, fillStyle: "" }),
      toBlob(callback: BlobCallback, type: string, quality?: number) {
        encodedType = type;
        encodedQuality = quality ?? 0;
        callback(new Blob(["compressed"], { type }));
      },
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    const compressed = await compressImage(original, async () => bitmap);
    expect(compressed.file.type).toBe("image/jpeg");
    expect(compressed.file.name).toBe("menu.jpg");
    expect(compressed.failed).toBe(false);
    expect(encodedType).toBe("image/jpeg");
    expect(encodedQuality).toBe(0.8);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
  });

  it("offers a multi-select photo picker without forcing the environment camera", () => {
    expect(photoPickerProps.multiple).toBe(true);
    expect(photoPickerProps).not.toHaveProperty("capture");
  });

  it("creates an ID even when secure randomUUID is unavailable", () => {
    expect(createId("manual", { randomUUID: () => { throw new Error("unavailable"); } })).toMatch(/^manual-/);
  });

  it("persists an explicitly cleared refinement instead of restoring the prior value", () => {
    const state = parseStoredState(JSON.stringify({
      menu: { items: [] },
      profile: { budget: null, currency: "¥", excludedIngredients: ["花生"], favoriteIngredients: [], dietaryNotes: "" },
      refinement: "微辣",
    }));
    const cleared = { ...state, refinement: "" };
    expect(parseStoredState(serializeStoredState(cleared)).refinement).toBe("");
  });
});
