/* oxlint-disable anti-slop/no-runtime-typeof -- This module is the SDK's JSON decoding boundary; it turns parsed JSON into typed values. */
import type { JsonObject, JsonValue } from "./json";

/** Turns a parsed JSON value into `T`, or throws a `DecodeError`. */
export type Decoder<T> = (value: JsonValue, path?: string) => T;

export class DecodeError extends Error {
  override readonly name = "DecodeError";
  readonly path: string;

  constructor(path: string, expected: string) {
    super(`Expected ${expected} at ${path}`);
    this.path = path;
  }
}

const ROOT = "$";

export const json: Decoder<JsonValue> = (value) => value;

export const string: Decoder<string> = (value, path = ROOT) => {
  if (typeof value !== "string") throw new DecodeError(path, "a string");
  return value;
};

export const number: Decoder<number> = (value, path = ROOT) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DecodeError(path, "a finite number");
  }
  return value;
};

export const boolean: Decoder<boolean> = (value, path = ROOT) => {
  if (typeof value !== "boolean") throw new DecodeError(path, "a boolean");
  return value;
};

export const object: Decoder<JsonObject> = (value, path = ROOT) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DecodeError(path, "an object");
  }
  return value;
};

export function array<T>(item: Decoder<T>): Decoder<T[]> {
  return (value, path = ROOT) => {
    if (!Array.isArray(value)) throw new DecodeError(path, "an array");
    return value.map((entry, index) => item(entry, `${path}[${index}]`));
  };
}

export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (value, path = ROOT) => (value === null ? null : decoder(value, path));
}

export function oneOf<const T extends readonly string[]>(
  values: T,
): Decoder<T[number]> {
  return (value, path = ROOT) => {
    const match = values.find((candidate) => candidate === value);
    if (match === undefined) {
      throw new DecodeError(path, `one of ${values.join(", ")}`);
    }
    return match;
  };
}

const ownValue = (source: JsonObject, key: string) =>
  Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;

/** Decodes a required own property of `source`. */
export function field<T>(
  source: JsonObject,
  key: string,
  decoder: Decoder<T>,
  path = ROOT,
): T {
  const fieldPath = `${path}.${key}`;
  const value = ownValue(source, key);
  if (value === undefined) throw new DecodeError(fieldPath, "a value");
  return decoder(value, fieldPath);
}

/** Decodes an own property of `source`, returning `undefined` when it is absent. */
export function optionalField<T>(
  source: JsonObject,
  key: string,
  decoder: Decoder<T>,
  path = ROOT,
): T | undefined {
  const value = ownValue(source, key);
  return value === undefined ? undefined : decoder(value, `${path}.${key}`);
}
