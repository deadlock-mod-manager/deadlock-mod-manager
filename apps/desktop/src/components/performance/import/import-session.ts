/** Staging folders created while the dialog is open, and the one a save keeps. */
export type ImportSession = {
  stagingIds: Set<string>;
  keptStagingId: string | null;
};
