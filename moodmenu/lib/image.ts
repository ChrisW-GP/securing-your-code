export type ImageDimensions = { width: number; height: number };
export type CompressionResult = { file: File; failed: boolean };
export type ImageDecoder = (blob: Blob) => Promise<ImageBitmap>;

const MAX_IMAGE_SIDE = 1600;

export function resizeDimensions(width: number, height: number): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions.");
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(
  file: File,
  decode: ImageDecoder = (blob) => createImageBitmap(blob),
): Promise<CompressionResult> {
  try {
    const bitmap = await decode(file);
    try {
      const { width, height } = resizeDimensions(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context is unavailable.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const output = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("JPEG encoding failed."));
        }, "image/jpeg", 0.8);
      });
      return {
        file: new File([output], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }),
        failed: false,
      };
    } finally {
      bitmap.close();
    }
  } catch {
    return { file, failed: true };
  }
}
