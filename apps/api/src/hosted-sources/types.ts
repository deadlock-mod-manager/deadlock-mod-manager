import { z } from "zod";

/**
 * A folder in the archive whose VPKs become installable components, unless a
 * definition group claims them. `required` VPKs always install; `default` and
 * `optional` ones form a zero-or-more choice, ticked or not at first install.
 */
export interface HostedSourceRoot {
  path: string;
  selection: "required" | "default" | "optional";
  label: string;
}

/** A choice between archive VPKs, such as two variants of the same pak. */
interface HostedSourceGroup {
  id: string;
  label: string;
  min: number;
  max: number;
  paths: string[];
  defaults: string[];
}

/**
 * A mod project that only publishes an archive link. The API watches the
 * archive and serves a `dmm-source` 1.0 source for it; DMM never stores the
 * project's files, users download them from the project's own origin.
 */
export interface HostedSourceDefinition {
  /** The source ID, listing ID and URL segment. Never reuse one for another project. */
  id: string;
  name: string;
  author: string;
  /** Plain text: what the pack is, its credits and compatibility notes. */
  description: string;
  homepageUrl: string;
  /** Listing tags; `performance` also lists the pack on the Performance page. */
  tags: string[];
  /** HTTPS link to a `.zip`; its origin is the source's only download origin. */
  archiveUrl: string;
  /** Feature flag that lists the source; off marks its listing removed. */
  flag: string;
  roots: HostedSourceRoot[];
  /** Archive text files listing `pakNN_dir.vpk  Label  (file.vpk)` lines. */
  labelFiles?: string[];
  groups?: HostedSourceGroup[];
}

/** What a refresh learned about the archive; its bytes are never kept. */
export const hostedSourceSnapshotSchema = z.object({
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive(),
  vpkPaths: z.array(z.string()),
  labels: z.record(z.string(), z.string()),
  fetchedAt: z.string(),
});

export type HostedSourceSnapshot = z.infer<typeof hostedSourceSnapshotSchema>;
