import { type BuildEntry } from "./bridge";

export type BuildState = "deployed" | "missing" | "ready" | "superseded";

export const buildState = (
  build: BuildEntry,
  isLatest: boolean,
): BuildState => {
  if (build.deployed) return "deployed";
  if (build.available === false) return "missing";
  return isLatest ? "ready" : "superseded";
};

export type DeployControl = {
  profileName: string | null;
  canDeploy: boolean;
  deployingHash: string | null;
  onDeploy: (hash: string) => void;
};
