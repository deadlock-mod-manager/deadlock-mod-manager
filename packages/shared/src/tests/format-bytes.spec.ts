import { describe, expect, it } from "vitest";
import { formatByteRate, formatByteSize } from "../format-bytes";

describe("formatByteSize", () => {
  it("formats bytes", () => {
    expect(formatByteSize(0)).toBe("0.00 B");
    expect(formatByteSize(500)).toBe("500.00 B");
    expect(formatByteSize(1023)).toBe("1023.00 B");
  });

  it("formats kilobytes and above with binary scale", () => {
    expect(formatByteSize(1024)).toBe("1.00 KB");
    expect(formatByteSize(1536)).toBe("1.50 KB");
    expect(formatByteSize(1024 * 1024)).toBe("1.00 MB");
    expect(formatByteSize(2.5 * 1024 * 1024)).toBe("2.50 MB");
  });
});

describe("formatByteRate", () => {
  it("appends per second", () => {
    expect(formatByteRate(0)).toBe("0.00 B/s");
    expect(formatByteRate(1024)).toBe("1.00 KB/s");
  });
});
