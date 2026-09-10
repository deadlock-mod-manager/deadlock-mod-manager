import JSZip from "jszip";

export const createArchive = async (
  files: Record<string, Uint8Array>,
): Promise<Buffer> => {
  const zip = new JSZip();
  for (const [name, contents] of Object.entries(files)) {
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").some((part) => part === ".." || !part)
    )
      throw new Error(`Unsafe archive entry: ${name}`);
    zip.file(name, contents, { date: new Date("2020-01-01T00:00:00Z") });
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
};
