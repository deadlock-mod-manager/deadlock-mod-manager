/**
 * Texture previews decoded at the current edit revision. Reads always ask for
 * the current revision, so moving to a new one drops every earlier preview, and
 * a decode that finishes after the move is not stored.
 */
export const createTexturePreviewCache = <Preview>() => {
  const previews = new Map<string, Preview>();
  let current = 0;
  return {
    setRevision(revision: number) {
      current = revision;
      previews.clear();
    },
    get: (key: string, revision: number) => previews.get(`${key}\n${revision}`),
    set(key: string, revision: number, preview: Preview) {
      if (revision === current) previews.set(`${key}\n${revision}`, preview);
    },
    clear: () => previews.clear(),
  };
};
