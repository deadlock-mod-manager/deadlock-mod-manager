const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

export const formatByteSize = (bytes: number): string => {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${BYTE_UNITS[unitIndex]}`;
};

export const formatByteRate = (bytesPerSecond: number): string =>
  `${formatByteSize(bytesPerSecond)}/s`;
