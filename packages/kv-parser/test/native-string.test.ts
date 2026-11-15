import { describe, expect, it, mock } from "bun:test";
import { ptr } from "bun:ffi";
import { takeNativeString } from "../src/native-string";

describe("native string ownership", () => {
  const buffer = Buffer.from("native result\0");
  const pointer = ptr(buffer);

  it("copies before freeing the returned pointer exactly once", () => {
    const free = mock(() => {});
    const copy = mock(() => {
      expect(free).not.toHaveBeenCalled();
      return "copied";
    });

    expect(takeNativeString(pointer, copy, free)).toBe("copied");
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith(pointer);
    expect(free).toHaveBeenCalledTimes(1);
    expect(free).toHaveBeenCalledWith(pointer);
  });

  it("does not copy or free a null result", () => {
    const copy = mock(() => "copied");
    const free = mock(() => {});

    expect(() => takeNativeString(null, copy, free)).toThrow("null pointer");
    expect(copy).not.toHaveBeenCalled();
    expect(free).not.toHaveBeenCalled();
  });

  it("frees exactly once when copying throws", () => {
    const error = new Error("copy failed");
    const copy = mock(() => {
      throw error;
    });
    const free = mock(() => {});

    expect(() => takeNativeString(pointer, copy, free)).toThrow(error);
    expect(free).toHaveBeenCalledTimes(1);
    expect(free).toHaveBeenCalledWith(pointer);
  });
});
