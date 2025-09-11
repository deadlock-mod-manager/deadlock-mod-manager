/**
 * File patterns and constants for file type detection and validation
 */

// File extension patterns
export const VPK_PATTERN = /\.vpk$/i;
export const ARCHIVE_PATTERN = /\.(zip|rar|7z)$/i;
export const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|svg)$/i;
export const ALL_SUPPORTED_PATTERN = /\.(zip|rar|7z|vpk)$/i;

// Supported file formats
export const SUPPORTED_ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z'] as const;
export const SUPPORTED_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
] as const;

// MIME types for file input
export const ACCEPTED_FILE_TYPES =
  '.vpk,.zip,.rar,.7z,application/zip,application/x-7z-compressed,application/x-rar-compressed';

// Fallback SVG for mods without preview images
export const FALLBACK_MOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#1f2937" offset="0"/><stop stop-color="#111827" offset="1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g font-family="Inter, Arial, sans-serif" fill="#E5E7EB" text-anchor="middle"><text x="50%" y="48%" font-size="36" font-weight="700">MOD</text><text x="50%" y="62%" font-size="14" fill="#9CA3AF">No image provided</text></g></svg>`;
