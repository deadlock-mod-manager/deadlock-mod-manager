import { describe, expect, it } from "bun:test";
import { NotFoundError } from "@deadlock-mods/common";
import { createMockLogger } from "@deadlock-mods/logging";
import type { ProcessorResult } from "../types/processors";
import {
  type ProcessorResolver,
  resolveProcessorOrThrow,
  toProcessorResolver,
} from "./dispatch";
import { BaseProcessor } from "./processor";

interface TestJobData {
  value: string;
}

class NamedProcessor extends BaseProcessor<TestJobData> {
  constructor(readonly id: string) {
    super(createMockLogger());
  }

  async process(): Promise<ProcessorResult> {
    return { success: true, data: this.id };
  }
}

describe("resolveProcessorOrThrow", () => {
  const modsSync = new NamedProcessor("mods-sync");
  const rss = new NamedProcessor("rss");
  const resolver: ProcessorResolver<TestJobData> = (jobName) =>
    ({ "mods-sync": modsSync, rss })[jobName];

  it("routes each job name to its own processor", () => {
    expect(resolveProcessorOrThrow(resolver, "mods-sync", "api-cron")).toBe(
      modsSync,
    );
    expect(resolveProcessorOrThrow(resolver, "rss", "api-cron")).toBe(rss);
  });

  it("throws instead of falling back when the job name is unknown", () => {
    expect(() =>
      resolveProcessorOrThrow(resolver, "lockdex-mods-scheduler", "api-cron"),
    ).toThrow(NotFoundError);
  });

  it("names the job and queue so a misrouted job is diagnosable", () => {
    expect(() =>
      resolveProcessorOrThrow(resolver, "unknown", "api-cron"),
    ).toThrow(/"unknown".*"api-cron"/);
  });
});

describe("toProcessorResolver", () => {
  it("passes a resolver through untouched", () => {
    const resolver: ProcessorResolver<TestJobData> = () => undefined;
    expect(toProcessorResolver(resolver)).toBe(resolver);
  });

  it("wraps a lone processor so it answers for every job name", () => {
    const processor = new NamedProcessor("only");
    const resolver = toProcessorResolver(processor);

    expect(resolver("anything")).toBe(processor);
    expect(resolver("something-else")).toBe(processor);
  });
});
