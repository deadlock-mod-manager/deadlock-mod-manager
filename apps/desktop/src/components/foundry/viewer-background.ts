import {
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";

export interface ViewerBackground {
  name: string;
  image: HTMLCanvasElement;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXTURE_SIDE = 2048;

export const loadViewerBackground = async (
  file: File,
): Promise<ViewerBackground> => {
  if (
    file.size > MAX_FILE_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    throw new ValidationError("Unsupported background image");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_TEXTURE_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.round(bitmap.width * scale));
    image.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = image.getContext("2d");
    if (!context) throw new RuntimeError("Background canvas is unavailable");
    context.drawImage(bitmap, 0, 0, image.width, image.height);
    return { name: file.name, image };
  } finally {
    bitmap.close();
  }
};
