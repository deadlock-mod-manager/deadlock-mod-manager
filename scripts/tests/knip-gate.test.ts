import { expect, test } from "bun:test";
import {
  compareFindings,
  findingKeys,
  readKnipResult,
} from "../check-knip.mjs";

test("rejects a replacement finding even when the total count is unchanged", () => {
  expect(compareFindings(["new export"], ["old export"])).toEqual({
    added: ["new export"],
    removed: ["old export"],
  });
});

test("requires resolved findings to be removed from the baseline", () => {
  expect(compareFindings([], ["fixed dependency"])).toEqual({
    added: [],
    removed: ["fixed dependency"],
  });
  expect(compareFindings(["existing"], ["existing"])).toEqual({
    added: [],
    removed: [],
  });
});

test("finding identity ignores line numbers, owners, path separators and alias order", () => {
  const before = findingKeys({
    issues: [
      {
        file: "apps\\example\\index.ts",
        owners: [{ name: "reviewer" }],
        exports: [{ name: "value" }],
        enumMembers: [{ name: "READY", namespace: "State" }],
        duplicates: [[{ name: "default" }, { name: "value" }]],
      },
    ],
  });
  const after = findingKeys({
    issues: [
      {
        file: "apps/example/index.ts",
        owners: [],
        duplicates: [[{ name: "value" }, { name: "default" }]],
        enumMembers: [{ name: "READY", namespace: "State" }],
        exports: [{ name: "value" }],
      },
    ],
  });
  expect(after).toEqual(before);
  expect(
    findingKeys({
      issues: [
        {
          file: "apps/example/index.ts",
          enumMembers: [{ name: "READY", namespace: "OtherState" }],
        },
      ],
    }),
  ).not.toEqual(before);
});

test("Knip execution errors fail even with empty or valid output", () => {
  expect(() =>
    readKnipResult({
      status: 2,
      signal: null,
      pid: 0,
      output: [],
      stdout: '{"issues":[]}',
      stderr: "Invalid config",
    }),
  ).toThrow("Invalid config");
  expect(() =>
    readKnipResult({
      status: null,
      signal: "SIGTERM",
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
    }),
  ).toThrow("Knip failed");
  expect(() =>
    readKnipResult({
      status: 0,
      signal: null,
      pid: 0,
      output: [],
      stdout: "invalid JSON",
      stderr: "",
    }),
  ).toThrow();
});
