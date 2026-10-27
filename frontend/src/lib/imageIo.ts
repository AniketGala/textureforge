import type { ImageFrame } from "./imageEngine";

export async function decodeImage(file: Blob): Promise<ImageFrame> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error("Images must be 8192 × 8192 pixels or smaller.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not create an image canvas.");
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } catch (error) {
    if (error instanceof Error && error.message.includes("8192")) throw error;
    throw new Error("This image could not be decoded. Use a valid PNG, JPEG, or WebP file.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function paintFrame(canvas: HTMLCanvasElement | null, frame: ImageFrame) {
  if (!canvas) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not draw the image preview.");
  context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
}

export function downloadPng(frame: ImageFrame, filename: string) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the PNG export.");
  context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
