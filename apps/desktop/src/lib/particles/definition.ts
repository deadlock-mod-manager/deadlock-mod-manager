import { z } from "zod";
import type { JsonObject, JsonValue } from "./json";

export const MAX_OPERATORS = 128;
export const object = (value: JsonValue | undefined): JsonObject =>
  value instanceof Object && !Array.isArray(value) ? value : {};
export const list = (
  value: JsonValue | undefined,
  limit = MAX_OPERATORS,
): JsonObject[] =>
  Array.isArray(value)
    ? value
        .slice(0, limit)
        .filter(
          (item): item is JsonObject =>
            item instanceof Object && !Array.isArray(item),
        )
    : [];
export const numberOf = (value: JsonValue | undefined, fallback: number) => {
  const parsed = z.number().safeParse(value);
  return parsed.success ? parsed.data : fallback;
};
export const stringOf = (value: JsonValue | undefined, fallback: string) => {
  const parsed = z.string().safeParse(value);
  return parsed.success ? parsed.data : fallback;
};
export const numbersOf = (value: JsonValue | undefined, fallback: number[]) =>
  z.array(z.number()).catch(fallback).parse(value);
const CLASS_KEY = "_class";
export const classOf = (operator: JsonObject) =>
  stringOf(operator[CLASS_KEY], "");
export const booleanOf = (value: JsonValue | undefined) =>
  z.boolean().safeParse(value).data === true;
export const transformControlPoint = (value: JsonValue | undefined) =>
  numberOf(object(value).m_nControlPoint, 0);
