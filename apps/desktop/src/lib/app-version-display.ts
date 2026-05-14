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

export const getReleaseNotesPath = (version: string): string => {
  if (isNightlyBuildVersion(version)) {
    return "/releases/tag/nightly";
  }
  return `/releases/tag/v${version}`;
};
