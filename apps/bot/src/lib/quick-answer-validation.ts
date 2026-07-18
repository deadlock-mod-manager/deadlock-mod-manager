import { ValidationError } from "@deadlock-mods/common";

export const QUICK_ANSWER_MAX_ASSETS = 3;
export const QUICK_ANSWER_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const QUICK_ANSWER_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const QUICK_ANSWER_MAX_TITLE_LENGTH = 200;
export const QUICK_ANSWER_MAX_BODY_LENGTH = 4_000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);
const IMAGE_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm"]);

export interface QuickAnswerUpload {
  readonly id: string;
  readonly name: string;
  readonly contentType: string | null;
  readonly size: number;
  readonly url: string;
}

export interface ValidatedQuickAnswerUpload {
  readonly upload: QuickAnswerUpload;
  readonly kind: "image" | "video";
  readonly contentType: string;
  readonly storageFilename: string;
}

export function normalizeQuickAnswerSlug(input: string): string {
  const slug = input.trim().toLowerCase();

  if (slug.length < 2 || slug.length > 50 || !SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      "Slug must be 2-50 lowercase letters, numbers, or single hyphens",
    );
  }

  return slug;
}

export function validateQuickAnswerText(titleInput: string, bodyInput: string) {
  const title = titleInput.trim();
  const body = bodyInput.trim();

  if (title.length < 2 || title.length > QUICK_ANSWER_MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `Title must be 2-${QUICK_ANSWER_MAX_TITLE_LENGTH} characters`,
    );
  }

  if (body.length < 2 || body.length > QUICK_ANSWER_MAX_BODY_LENGTH) {
    throw new ValidationError(
      `Answer must be 2-${QUICK_ANSWER_MAX_BODY_LENGTH} characters`,
    );
  }

  return { title, body };
}

function getFilenameExtension(filename: string): string {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}

function classifyUpload(
  upload: QuickAnswerUpload,
): Pick<ValidatedQuickAnswerUpload, "kind" | "contentType"> {
  const contentType = upload.contentType?.toLowerCase();

  if (contentType && IMAGE_CONTENT_TYPES.has(contentType)) {
    return { kind: "image", contentType };
  }

  if (contentType && VIDEO_CONTENT_TYPES.has(contentType)) {
    return { kind: "video", contentType };
  }

  const extension = getFilenameExtension(upload.name);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return {
      kind: "image",
      contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
    };
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return { kind: "video", contentType: `video/${extension}` };
  }

  throw new ValidationError(
    `Unsupported media type for ${upload.name}. Use PNG, JPEG, WebP, GIF, MP4, or WebM`,
  );
}

function createStorageFilename(upload: QuickAnswerUpload): string {
  const safeName = upload.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${upload.id}-${safeName || "media"}`;
}

export function validateQuickAnswerUploads(
  uploads: readonly QuickAnswerUpload[],
  existingAssetSizes: readonly number[] = [],
): ValidatedQuickAnswerUpload[] {
  if (uploads.length + existingAssetSizes.length > QUICK_ANSWER_MAX_ASSETS) {
    throw new ValidationError(
      `A quick answer can contain at most ${QUICK_ANSWER_MAX_ASSETS} media files`,
    );
  }

  const existingTotal = existingAssetSizes.reduce(
    (total, size) => total + size,
    0,
  );
  const uploadTotal = uploads.reduce((total, upload) => {
    if (upload.size <= 0 || upload.size > QUICK_ANSWER_MAX_FILE_BYTES) {
      throw new ValidationError(`${upload.name} must be smaller than 10 MiB`);
    }

    return total + upload.size;
  }, 0);

  if (existingTotal + uploadTotal > QUICK_ANSWER_MAX_TOTAL_BYTES) {
    throw new ValidationError(
      "Quick answer media must be smaller than 20 MiB in total",
    );
  }

  return uploads.map((upload) => ({
    upload,
    ...classifyUpload(upload),
    storageFilename: createStorageFilename(upload),
  }));
}
