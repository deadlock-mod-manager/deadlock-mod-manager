import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { embedMany } from "ai";
import { MDocument } from "@mastra/rag";
import matter from "gray-matter";
import { env } from "../../../env";
import { createServiceLogger } from "../../../logger";
import {
  INDEX_NAME,
  EMBEDDING_DIMENSION,
  vectorStore,
  embeddingModel,
} from "./vector-store";

const log = createServiceLogger("docs-ingest");

function stripMdxContent(frontmatterContent: string): string {
  const lines = frontmatterContent.split("\n");
  const filtered: string[] = [];
  let inJsxBlock = 0;
  let jsxTagName: string | null = null;

  for (const line of lines) {
    if (line.trimStart().startsWith("import ")) continue;

    const openMatch = line.match(/^(\s*)<([A-Z][A-Za-z0-9]*)(?:\s[^>]*)?>/);
    if (openMatch) {
      inJsxBlock++;
      jsxTagName = openMatch[2];
      continue;
    }

    if (inJsxBlock > 0 && jsxTagName) {
      const closeMatch = line.match(new RegExp(`</\\s*${jsxTagName}\\s*>`));
      if (closeMatch) {
        inJsxBlock--;
        if (inJsxBlock === 0) jsxTagName = null;
      }
      continue;
    }

    const selfClosing = line.match(/^(\s*)<[A-Z][A-Za-z0-9]*[\s\S]*?\/\s*>/);
    if (selfClosing) continue;

    filtered.push(line);
  }

  return filtered
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .trim();
}

function walkMdxFiles(
  dir: string,
  baseDir: string,
): Array<{ path: string; slug: string }> {
  const results: Array<{ path: string; slug: string }> = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.slice(baseDir.length + 1);

    if (entry.isDirectory()) {
      results.push(...walkMdxFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      const slug = relativePath.replace(/\.mdx$/, "").replace(/\\/g, "/");
      results.push({ path: fullPath, slug });
    }
  }

  return results;
}

export async function ingestDocs(): Promise<void> {
  const docsPath = env.DOCS_PATH;
  const files = walkMdxFiles(docsPath, docsPath);

  if (files.length === 0) {
    log.warn("No MDX files found, skipping ingestion");
    return;
  }

  const existingIndexes = await vectorStore.listIndexes();
  if (existingIndexes.includes(INDEX_NAME)) {
    const stats = await vectorStore.describeIndex({ indexName: INDEX_NAME });
    if (stats.count > 0) {
      log.info(
        `Index "${INDEX_NAME}" already has ${stats.count} vectors, skipping ingestion`,
      );
      return;
    }
    await vectorStore.deleteIndex({ indexName: INDEX_NAME });
  }

  const allChunks: Array<{
    text: string;
    title: string;
    slug: string;
    section: string;
  }> = [];

  for (const { path, slug } of files) {
    const raw = readFileSync(path, "utf-8");
    const parsed = matter(raw);
    const cleaned = stripMdxContent(parsed.content);
    if (!cleaned || cleaned.length < 50) continue;

    const title = String(
      parsed.data?.title ?? slug.split("/").pop() ?? "Untitled",
    );
    const section = slug.split("/")[0] ?? "docs";

    const doc = MDocument.fromMarkdown(cleaned, { title, slug, section });
    const chunks = await doc.chunk({
      strategy: "recursive",
      maxSize: 512,
      overlap: 50,
    });

    for (const chunk of chunks) {
      const text = chunk.text;
      if (!text || text.trim().length < 20) continue;
      allChunks.push({ text, title, slug, section });
    }
  }

  if (allChunks.length === 0) {
    log.warn("No chunks produced from docs, skipping ingestion");
    return;
  }

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: allChunks.map((c) => c.text),
  });

  await vectorStore.createIndex({
    indexName: INDEX_NAME,
    dimension: EMBEDDING_DIMENSION,
  });

  await vectorStore.upsert({
    indexName: INDEX_NAME,
    vectors: embeddings,
    metadata: allChunks.map((c) => ({
      text: c.text,
      title: c.title,
      slug: c.slug,
      section: c.section,
    })),
  });

  log.info(`Ingested ${allChunks.length} chunks from ${files.length} files`);
}
