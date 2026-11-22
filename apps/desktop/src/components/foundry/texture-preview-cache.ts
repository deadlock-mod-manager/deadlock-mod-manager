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
