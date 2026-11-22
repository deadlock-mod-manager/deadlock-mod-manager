export type ForumStatus =
  | "open"
  | "inProgress"
  | "resolved"
  | "duplicate"
  | "wontFix"
  | "planned"
  | "declined";

export interface ForumLifecycleConfig {
  channelId: string;
  statusTags: Partial<Record<ForumStatus, string>> & { open: string };
  closedStatuses: ForumStatus[];
  idleCloseStatus: ForumStatus;
  solveButton: boolean;
}

const MAX_APPLIED_TAGS = 5;
export const IDLE_CLOSE_DAYS = 5;
const IDLE_CLOSE_MS = IDLE_CLOSE_DAYS * 24 * 60 * 60 * 1000;

export function getStatus(
  config: ForumLifecycleConfig,
  appliedTags: string[],
): ForumStatus | null {
  for (const [status, tagId] of Object.entries(config.statusTags)) {
    if (appliedTags.includes(tagId)) {
      return status as ForumStatus;
    }
  }
  return null;
}

export function isClosedStatus(
  config: ForumLifecycleConfig,
  status: ForumStatus | null,
): boolean {
  return status !== null && config.closedStatuses.includes(status);
}

/** Replaces any status tag with `status`, keeping the author's topic tags. */
export function withStatus(
  config: ForumLifecycleConfig,
  appliedTags: string[],
  status: ForumStatus,
): string[] {
  const statusTagId = config.statusTags[status];
  if (!statusTagId) {
    throw new Error(`Forum ${config.channelId} has no "${status}" tag`);
  }
  const statusTagIds = new Set(Object.values(config.statusTags));
  const topicTags = appliedTags.filter((tagId) => !statusTagIds.has(tagId));
  return [statusTagId, ...topicTags].slice(0, MAX_APPLIED_TAGS);
}

export type SweepAction =
  | "none"
  | "tagOpen"
  | "archive"
  | "closeIdle"
  | "closeDeleted";

interface SweepThreadState {
  appliedTags: string[];
  lastActivityAt: number;
  starterDeleted: boolean;
}

export function planSweepAction(
  config: ForumLifecycleConfig,
  thread: SweepThreadState,
  now: number,
): SweepAction {
  if (thread.starterDeleted) {
    return "closeDeleted";
  }
  const status = getStatus(config, thread.appliedTags);
  if (isClosedStatus(config, status)) {
    return "archive";
  }
  if (now - thread.lastActivityAt >= IDLE_CLOSE_MS) {
    return "closeIdle";
  }
  return status === null ? "tagOpen" : "none";
}
