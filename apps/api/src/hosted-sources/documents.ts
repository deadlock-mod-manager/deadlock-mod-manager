import { createHash } from "node:crypto";
import { posix } from "node:path";
import { ValidationError } from "@deadlock-mods/common";
import { z } from "zod";
import type {
  HostedSourceDefinition,
  HostedSourceRoot,
  HostedSourceSnapshot,
} from "./types";

/*
 * The subset of the `dmm-source` 1.0 documents a hosted source publishes. The
 * desktop validates them again (`native_sources/validation.rs`); these
 * schemas describe the API's responses.
 */

export const hostedSourceDescriptorSchema = z.object({
  format: z.literal("dmm-source"),
  protocolVersion: z.literal("1.0"),
  sourceId: z.string(),
  name: z.string(),
  gameId: z.literal("deadlock"),
  homepageUrl: z.string(),
  catalog: z.object({ kind: z.literal("static"), indexUrl: z.string() }),
  networkOrigins: z.object({
    api: z.array(z.string()),
    downloads: z.array(z.string()),
    media: z.array(z.string()),
  }),
  capabilities: z.object({ installationChoices: z.boolean() }),
});

const componentSchema = z.object({
  id: z.string(),
  label: z.string(),
  files: z.array(z.object({ artifactId: z.string(), path: z.string() })),
});

const choiceGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  minSelections: z.number().int(),
  maxSelections: z.number().int(),
  componentIds: z.array(z.string()),
  defaultComponentIds: z.array(z.string()),
});

const installationSchema = z.object({
  mode: z.literal("components"),
  components: z.array(componentSchema),
  requiredComponents: z.array(z.string()),
  choiceGroups: z.array(choiceGroupSchema),
});

const releaseSchema = z.object({
  id: z.string(),
  contentRevision: z.string(),
  publishedAt: z.string(),
  artifacts: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      format: z.literal("zip"),
      download: z.object({ url: z.string() }),
      size: z.number().int(),
      hashes: z.object({ sha256: z.string() }),
    }),
  ),
  installation: installationSchema,
});

const listingSchema = z.object({
  id: z.string(),
  title: z.string(),
  availability: z.enum(["available", "removed"]),
  isNsfw: z.boolean(),
  description: z.string(),
  author: z.string(),
  homepageUrl: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string().optional(),
  release: releaseSchema.optional(),
});

export const hostedSourceCatalogSchema = z.object({
  snapshotId: z.string(),
  items: z.array(listingSchema),
});

export type HostedSourceDescriptor = z.infer<
  typeof hostedSourceDescriptorSchema
>;
export type HostedSourceCatalog = z.infer<typeof hostedSourceCatalogSchema>;
type Installation = z.infer<typeof installationSchema>;
type Component = z.infer<typeof componentSchema>;
type ChoiceGroup = z.infer<typeof choiceGroupSchema>;
type Listing = z.infer<typeof listingSchema>;

/** Every hosted project is a listing in this one source. */
export const HOSTED_SOURCE_ID = "deadlock-mod-manager";
export const HOSTED_SOURCE_NAME = "Deadlock Mod Manager";

const ARTIFACT_ID = "archive";

/**
 * Download origins cover every definition, switched on or not, so a flag
 * flip never changes the descriptor.
 */
export const buildHostedSourceDescriptor = (
  definitions: HostedSourceDefinition[],
  apiOrigin: string,
): HostedSourceDescriptor => ({
  format: "dmm-source",
  protocolVersion: "1.0",
  sourceId: HOSTED_SOURCE_ID,
  name: HOSTED_SOURCE_NAME,
  gameId: "deadlock",
  homepageUrl: "https://deadlockmods.app/",
  catalog: { kind: "static", indexUrl: "./catalog.json" },
  networkOrigins: {
    api: [apiOrigin],
    downloads: [
      ...new Set(
        definitions.map((definition) => new URL(definition.archiveUrl).origin),
      ),
    ].sort(),
    media: [],
  },
  capabilities: { installationChoices: true },
});

/**
 * Maps the archive's VPKs onto components. Component IDs are archive paths,
 * so saved choices survive refreshes. Components are declared in load order,
 * by pak name across folders, so an optional `pak02` takes the default
 * `pak02`'s place. Throws when the archive no longer matches the definition,
 * so a changed upstream layout keeps the last good snapshot instead of
 * publishing a broken plan.
 */
export const buildInstallation = (
  definition: HostedSourceDefinition,
  snapshot: HostedSourceSnapshot,
): Installation => {
  const rootOf = (path: string) =>
    definition.roots.findIndex((root) => path.startsWith(`${root.path}/`));
  const paths = snapshot.vpkPaths
    .filter((path) => rootOf(path) >= 0)
    .sort((a, b) => {
      const [nameA, nameB] = [posix.basename(a), posix.basename(b)];
      return nameA === nameB ? rootOf(a) - rootOf(b) : nameA < nameB ? -1 : 1;
    });
  const components: Component[] = paths.map((path) => ({
    id: path,
    label: snapshot.labels[path] ?? posix.basename(path),
    files: [{ artifactId: ARTIFACT_ID, path }],
  }));

  const available = new Set(paths);
  const grouped = new Set<string>();
  const definedGroups: ChoiceGroup[] = [];
  for (const group of definition.groups ?? []) {
    const missing = group.paths.filter((path) => !available.has(path));
    if (missing.length) {
      throw new ValidationError(
        `${definition.id}: group ${group.id} names VPKs the archive doesn't have: ${missing.join(", ")}`,
      );
    }
    for (const path of group.paths) grouped.add(path);
    definedGroups.push({
      id: group.id,
      label: group.label,
      minSelections: group.min,
      maxSelections: group.max,
      componentIds: group.paths,
      defaultComponentIds: group.defaults,
    });
  }

  const required: string[] = [];
  const rootGroups = new Map<HostedSourceRoot["selection"], ChoiceGroup[]>();
  for (const [index, root] of definition.roots.entries()) {
    const inRoot = paths.filter((path) => rootOf(path) === index);
    if (root.selection !== "optional" && !inRoot.length) {
      throw new ValidationError(
        `${definition.id}: folder ${root.path} has no VPKs`,
      );
    }
    const ungrouped = inRoot.filter((path) => !grouped.has(path));
    if (root.selection === "required") {
      required.push(...ungrouped);
    } else if (ungrouped.length) {
      rootGroups.set(root.selection, [
        ...(rootGroups.get(root.selection) ?? []),
        {
          id: `folder:${root.path}`,
          label: root.label,
          minSelections: 0,
          maxSelections: ungrouped.length,
          componentIds: ungrouped,
          defaultComponentIds: root.selection === "default" ? ungrouped : [],
        },
      ]);
    }
  }

  return {
    mode: "components",
    components,
    requiredComponents: required,
    // The picker lists the pack's defaults, then its choices, then extras.
    choiceGroups: [
      ...(rootGroups.get("default") ?? []),
      ...definedGroups,
      ...(rootGroups.get("optional") ?? []),
    ],
  };
};

/**
 * Upstream timestamps keep `publishedAt` stable across refreshes; the
 * desktop dates installed files with it.
 */
const publishedAt = (snapshot: HostedSourceSnapshot) => {
  const date = snapshot.lastModified ? new Date(snapshot.lastModified) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : snapshot.fetchedAt;
};

export interface HostedListingState {
  definition: HostedSourceDefinition;
  snapshot: HostedSourceSnapshot | null;
  enabled: boolean;
}

/**
 * A project's listing, available only while its flag is on and a snapshot
 * exists. A removed listing keeps its ID so clients hide it instead of
 * forgetting it.
 */
const buildListing = ({
  definition,
  snapshot,
  enabled,
}: HostedListingState): Listing => {
  const listing = {
    id: definition.id,
    title: definition.name,
    isNsfw: false,
    description: definition.description,
    author: definition.author,
    homepageUrl: definition.homepageUrl,
    tags: definition.tags,
  };
  if (!snapshot || !enabled) return { ...listing, availability: "removed" };
  const installation = buildInstallation(definition, snapshot);
  // The plan is part of the revision: the desktop rejects a release whose
  // installation changes under an unchanged revision.
  const revision = createHash("sha256")
    .update(JSON.stringify({ archive: snapshot.sha256, installation }))
    .digest("hex")
    .slice(0, 32);
  const date = publishedAt(snapshot);
  return {
    ...listing,
    availability: "available",
    updatedAt: date,
    release: {
      id: revision,
      contentRevision: revision,
      publishedAt: date,
      artifacts: [
        {
          id: ARTIFACT_ID,
          filename: posix.basename(new URL(definition.archiveUrl).pathname),
          format: "zip",
          download: { url: definition.archiveUrl },
          size: snapshot.size,
          hashes: { sha256: snapshot.sha256 },
        },
      ],
      installation,
    },
  };
};

export const buildHostedSourceCatalog = (
  states: HostedListingState[],
): HostedSourceCatalog => {
  const items = states.map(buildListing);
  return {
    snapshotId: createHash("sha256")
      .update(JSON.stringify(items))
      .digest("hex")
      .slice(0, 32),
    items,
  };
};
