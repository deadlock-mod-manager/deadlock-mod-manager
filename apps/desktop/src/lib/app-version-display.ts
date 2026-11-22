import { WEB_URL } from "./config";
import { GITHUB_REPO } from "./constants";

const NIGHTLY_VERSION = /^(\d+\.\d+\.\d+)-nightly\.(\d{8})\.([0-9a-f]+)$/i;

export const isNightlyBuildVersion = (version: string): boolean =>
  NIGHTLY_VERSION.test(version);

export const getDisplaySemver = (version: string): string => {
  const match = version.match(NIGHTLY_VERSION);
  if (match?.[1]) {
    return match[1];
  }
  return version;
};

export const getReleaseNotesUrl = (version?: string): string => {
  if (!version) {
    return `${WEB_URL}/changelog`;
  }
  if (isNightlyBuildVersion(version)) {
    return `${GITHUB_REPO}/releases/tag/nightly`;
  }
  return `${WEB_URL}/changelog#v${version}`;
};
