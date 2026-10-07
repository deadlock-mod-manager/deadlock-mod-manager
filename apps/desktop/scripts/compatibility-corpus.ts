// Prepare a reproducible local corpus. Mod assets are never committed or enabled.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const caseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.url(),
  fileId: z.number().int(),
  filename: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  vpks: z.array(z.string()).min(1),
});
const cases = z
  .array(caseSchema)
  .parse(
    await Bun.file(
      new URL("./compatibility-corpus.json", import.meta.url),
    ).json(),
  );
const root = resolve(process.argv[2] ?? "/tmp/dmm-compatibility-corpus");
await mkdir(root, { recursive: true });
const prepared = [];
for (const entry of cases) {
  const archive = join(root, entry.filename);
  const file = Bun.file(archive);
  if (!(await file.exists())) {
    const response = await fetch(`https://gamebanana.com/dl/${entry.fileId}`);
    if (!response.ok)
      throw new Error(`Download ${entry.id}: ${response.status}`);
    await Bun.write(archive, response);
  }
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  if (digest !== entry.sha256) {
    // Remove it so the next run downloads it again instead of failing forever.
    await rm(archive, { force: true });
    throw new Error(`Checksum mismatch for ${entry.name}`);
  }
  const directory = join(root, String(entry.id));
  await mkdir(directory, { recursive: true });
  const extractor = Bun.spawn(["7z", "x", "-y", `-o${directory}`, archive], {
    stdout: "ignore",
    stderr: "inherit",
  });
  if ((await extractor.exited) !== 0) {
    throw new Error(
      `Cannot extract ${entry.name}; install 7z with RAR support`,
    );
  }
  const vpks = entry.vpks.map((path) => {
    if (path.split(/[\\/]/).some((part) => part === "..")) {
      throw new Error("Invalid fixture path");
    }
    return join(directory, path);
  });
  for (const path of vpks) {
    if (!(await Bun.file(path).exists())) {
      throw new Error(`Missing extracted fixture ${path}`);
    }
  }
  prepared.push({ ...entry, archive, vpks });
  console.log(`Prepared ${entry.id}: ${entry.name}`);
}
await Bun.write(join(root, "cases.json"), JSON.stringify(prepared, null, 2));
console.log(`Corpus manifest: ${join(root, "cases.json")}`);
