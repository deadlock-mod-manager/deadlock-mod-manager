import { NotFoundError, RuntimeError } from "@deadlock-mods/common";
import { createMockLogger } from "@deadlock-mods/logging";
import { Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseProcessor } from "../base/processor";
import type { CronJobData } from "../types/jobs";
import type { ProcessorResult } from "../types/processors";
import { CronService } from "./service";

interface FakeJob {
  id: string;
  name: string;
  data: CronJobData;
}

const mocks = vi.hoisted(() => {
  const captured: { processJob?: (job: FakeJob) => Promise<unknown> } = {};

  return {
    captured,
    upsertJobScheduler: vi.fn(),
    closeQueue: vi.fn(),
    closeWorker: vi.fn(),
  };
});

vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = mocks.upsertJobScheduler;
    close = mocks.closeQueue;
  },
  Worker: class {
    constructor(
      _queueName: string,
      processJob: (job: FakeJob) => Promise<unknown>,
    ) {
      mocks.captured.processJob = processJob;
    }
    on = vi.fn();
    close = mocks.closeWorker;
  },
}));

vi.mock("ioredis", () => ({
  Redis: class {},
  default: class {},
}));

class StubProcessor extends BaseProcessor<CronJobData> {
  readonly calls: CronJobData[] = [];

  constructor(private readonly result: ProcessorResult) {
    super(createMockLogger());
  }

  async process(jobData: CronJobData): Promise<ProcessorResult> {
    this.calls.push(jobData);
    return this.result;
  }
}

const succeeding = () => new StubProcessor({ success: true, data: "ok" });

const createService = () =>
  new CronService({
    queueName: "test-cron-queue",
    redis: new Redis(),
    logger: createMockLogger(),
  });

const jobFor = (name: string): FakeJob => ({
  id: "1",
  name,
  data: { jobData: {}, metadata: { jobType: name } },
});

const runJob = async (job: FakeJob) => {
  if (!mocks.captured.processJob) {
    throw new RuntimeError("Worker was never constructed");
  }
  return mocks.captured.processJob(job);
};

describe("CronService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captured.processJob = undefined;
  });

  it("schedules a recurring scheduler per defined job", async () => {
    const service = createService();

    await service.defineJobs([
      { name: "alpha", pattern: "0 * * * *", processor: succeeding() },
      { name: "beta", pattern: "30 * * * *", processor: succeeding() },
    ]);

    expect(mocks.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      "alpha",
      expect.objectContaining({ pattern: "0 * * * *" }),
      expect.objectContaining({
        name: "alpha",
        data: expect.objectContaining({
          metadata: { jobType: "alpha" },
        }),
      }),
    );
  });

  it("does not open a worker until start is called", async () => {
    const service = createService();

    await service.defineJobs([
      { name: "alpha", pattern: "0 * * * *", processor: succeeding() },
    ]);
    expect(mocks.captured.processJob).toBeUndefined();

    service.start();
    expect(mocks.captured.processJob).toBeDefined();
  });

  it("routes each job to the processor registered under its name", async () => {
    const alpha = succeeding();
    const beta = succeeding();
    const service = createService();

    await service.defineJobs([
      { name: "alpha", pattern: "0 * * * *", processor: alpha },
      { name: "beta", pattern: "30 * * * *", processor: beta },
    ]);
    service.start();

    await runJob(jobFor("beta"));

    expect(beta.calls).toHaveLength(1);
    expect(alpha.calls).toHaveLength(0);
  });

  it("fails a job with no registered processor instead of running another", async () => {
    const alpha = succeeding();
    const service = createService();

    await service.defineJobs([
      { name: "alpha", pattern: "0 * * * *", processor: alpha },
    ]);
    service.start();

    await expect(runJob(jobFor("stranger"))).rejects.toThrow(NotFoundError);
    expect(alpha.calls).toHaveLength(0);
  });

  it("surfaces an unsuccessful processor result as a failure", async () => {
    const service = createService();

    await service.defineJobs([
      {
        name: "alpha",
        pattern: "0 * * * *",
        processor: new StubProcessor({ success: false, error: "boom" }),
      },
    ]);
    service.start();

    await expect(runJob(jobFor("alpha"))).rejects.toThrow("boom");
  });

  it("rejects jobs defined after start, which the worker could not resolve", async () => {
    const service = createService();
    service.start();

    await expect(
      service.defineJob({
        name: "late",
        pattern: "0 * * * *",
        processor: succeeding(),
      }),
    ).rejects.toThrow(RuntimeError);
    expect(mocks.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("rejects a second start so only one worker drains the queue", () => {
    const service = createService();
    service.start();

    expect(() => service.start()).toThrow(RuntimeError);
  });

  it("closes both the worker and the queue on shutdown", async () => {
    const service = createService();
    service.start();

    await service.shutdown();

    expect(mocks.closeWorker).toHaveBeenCalledTimes(1);
    expect(mocks.closeQueue).toHaveBeenCalledTimes(1);
  });
});
