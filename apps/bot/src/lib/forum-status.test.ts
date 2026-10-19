import { describe, expect, it } from "bun:test";
import {
  type ForumLifecycleConfig,
  IDLE_CLOSE_DAYS,
  planSweepAction,
  withStatus,
} from "./forum-status";

const config: ForumLifecycleConfig = {
  channelId: "forum",
  statusTags: { open: "open", resolved: "resolved", duplicate: "duplicate" },
  closedStatuses: ["resolved", "duplicate"],
  idleCloseStatus: "resolved",
  solveButton: true,
};

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;

describe("withStatus", () => {
  it("swaps the status tag and keeps the author's topic tags", () => {
    expect(withStatus(config, ["bug", "open", "vpn"], "resolved")).toEqual([
      "resolved",
      "bug",
      "vpn",
    ]);
  });

  it("stays within Discord's five tag limit", () => {
    expect(withStatus(config, ["a", "b", "c", "d", "e"], "open")).toEqual([
      "open",
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("planSweepAction", () => {
  const recent = now - DAY;
  const idle = now - IDLE_CLOSE_DAYS * DAY;

  it("archives closed posts without posting another note", () => {
    expect(
      planSweepAction(
        config,
        {
          appliedTags: ["duplicate"],
          lastActivityAt: idle,
          starterDeleted: false,
        },
        now,
      ),
    ).toBe("archive");
  });

  it("closes idle posts, even untagged ones", () => {
    expect(
      planSweepAction(
        config,
        { appliedTags: [], lastActivityAt: idle, starterDeleted: false },
        now,
      ),
    ).toBe("closeIdle");
  });

  it("tags active untagged posts as open", () => {
    expect(
      planSweepAction(
        config,
        { appliedTags: ["bug"], lastActivityAt: recent, starterDeleted: false },
        now,
      ),
    ).toBe("tagOpen");
  });

  it("closes posts whose starter message was deleted", () => {
    expect(
      planSweepAction(
        config,
        { appliedTags: ["open"], lastActivityAt: recent, starterDeleted: true },
        now,
      ),
    ).toBe("closeDeleted");
  });
});
