import type { Icon } from "@phosphor-icons/react";
import {
  BellIcon,
  DatabaseIcon,
  EyeIcon,
  GameControllerIcon,
  GlobeIcon,
  PencilSimpleIcon,
  RocketLaunchIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { ExternalPluginGrant } from "@/types/generated/ExternalPluginGrant";
import type { ExternalPluginPermission } from "@/types/generated/ExternalPluginPermission";
import type { ExternalPluginPermissionId } from "@/types/generated/ExternalPluginPermissionId";

export type FilesRequest = Extract<ExternalPluginPermission, { id: "files" }>;
export type ModsRequest = Extract<ExternalPluginPermission, { id: "mods" }>;

/** What the user picks while granting a request. */
export type PermissionResource = "file" | "folder" | "profile";

export type PermissionCopy = {
  icon: Icon;
  /** "Read one file you choose" */
  title: string;
  /** Why it is safe to allow, under the title. */
  detail: string;
  /** The limit, next to the granted value. */
  note: string;
  needs: PermissionResource | null;
};

const CATALOG_ORDER: ExternalPluginPermissionId[] = [
  "files",
  "mods",
  "network",
  "game",
  "events",
  "storage",
  "notifications",
];

/** Requests in catalog order, so every plugin lists its access the same way. */
export const sortPermissions = (permissions: ExternalPluginPermission[]) =>
  [...permissions].sort(
    (a, b) => CATALOG_ORDER.indexOf(a.id) - CATALOG_ORDER.indexOf(b.id),
  );

export const findPermission = <Id extends ExternalPluginPermissionId>(
  permissions: ExternalPluginPermission[],
  id: Id,
) =>
  permissions.find(
    (permission): permission is Extract<ExternalPluginPermission, { id: Id }> =>
      permission.id === id,
  );

export const permissionNeeds = (
  permission: ExternalPluginPermission,
): PermissionResource | null => {
  switch (permission.id) {
    case "files":
      return permission.kind;
    case "mods":
      return permission.profiles === "picked" ? "profile" : null;
    case "network":
    case "game":
    case "events":
    case "storage":
    case "notifications":
      return null;
  }
};

/** Reading may target the default profile; installing never does. */
export const allowsDefaultProfile = (request: ModsRequest) =>
  !request.access.includes("install");

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

/** Whether two requests ask for exactly the same scope. */
const samePermission = (
  a: ExternalPluginPermission,
  b: ExternalPluginPermission,
): boolean => {
  switch (a.id) {
    case "files":
      return (
        b.id === "files" &&
        a.kind === b.kind &&
        a.access === b.access &&
        sameSet(a.extensions, b.extensions)
      );
    case "mods":
      return (
        b.id === "mods" &&
        a.profiles === b.profiles &&
        sameSet(a.access, b.access)
      );
    case "network":
      return b.id === "network" && sameSet(a.hosts, b.hosts);
    case "events":
      return b.id === "events" && sameSet(a.types, b.types);
    case "game":
    case "storage":
    case "notifications":
      return a.id === b.id;
  }
};

/** Approved as asked, with the resource it needs picked. */
export const isPermissionGranted = (
  grant: ExternalPluginGrant | null,
  permission: ExternalPluginPermission,
) => {
  if (
    !grant?.permissions.some((granted) => samePermission(granted, permission))
  ) {
    return false;
  }
  const needs = permissionNeeds(permission);
  if (needs === "profile") return grant.profileFolder !== null;
  if (needs) return grant.file?.kind === needs;
  return true;
};

const filesVariant = (request: FilesRequest) =>
  `${request.kind}${request.access === "read" ? "Read" : "ReadWrite"}` as const;

const modsVariant = (request: ModsRequest) => {
  if (request.access.includes("install")) {
    return request.access.includes("read") ? "readInstall" : "install";
  }
  return request.profiles === "all" ? "readAll" : "read";
};

const formatList = (
  language: string,
  items: string[],
  type: Intl.ListFormatType,
) => new Intl.ListFormat(language, { style: "long", type }).format(items);

/** "vpk" → ".vpk"; several → ".vpk or .vtex_c". */
const extensionList = (language: string, extensions: string[]) =>
  formatList(
    language,
    extensions.map((extension) => `.${extension}`),
    "disjunction",
  );

/** The host's wording for one request, scope included. */
const describePermission = (
  t: TFunction,
  language: string,
  permission: ExternalPluginPermission,
): PermissionCopy => {
  const needs = permissionNeeds(permission);
  switch (permission.id) {
    case "files": {
      const variant = filesVariant(permission);
      return {
        icon: permission.access === "read" ? EyeIcon : PencilSimpleIcon,
        title: t(`plugins.permissions.files.title.${variant}`),
        detail: t(`plugins.permissions.files.detail.${variant}`),
        note:
          permission.extensions.length > 0
            ? t("plugins.permissions.files.note.typed", {
                extensions: extensionList(language, permission.extensions),
              })
            : t(`plugins.permissions.files.note.${permission.kind}`),
        needs,
      };
    }
    case "mods": {
      const variant = modsVariant(permission);
      return {
        icon: permission.access.includes("install")
          ? RocketLaunchIcon
          : StackIcon,
        title: t(`plugins.permissions.mods.title.${variant}`),
        detail: t(`plugins.permissions.mods.detail.${variant}`),
        note: t(`plugins.permissions.mods.note.${variant}`),
        needs,
      };
    }
    case "network":
      return {
        icon: GlobeIcon,
        title: t("plugins.permissions.network.title", {
          hosts: formatList(language, permission.hosts, "conjunction"),
        }),
        detail: t("plugins.permissions.network.detail"),
        note: t("plugins.permissions.network.note"),
        needs,
      };
    case "game":
      return {
        icon: GameControllerIcon,
        title: t("plugins.permissions.game.title"),
        detail: t("plugins.permissions.game.detail"),
        note: t("plugins.permissions.game.note"),
        needs,
      };
    case "storage":
      return {
        icon: DatabaseIcon,
        title: t("plugins.permissions.storage.title"),
        detail: t("plugins.permissions.storage.detail"),
        note: t("plugins.permissions.storage.note"),
        needs,
      };
    case "events":
      return {
        icon: EyeIcon,
        title: t("plugins.permissions.events.title"),
        detail: t("plugins.permissions.events.detail"),
        note: t("plugins.permissions.events.note"),
        needs,
      };
    case "notifications":
      return {
        icon: BellIcon,
        title: t("plugins.permissions.notifications.title"),
        detail: t("plugins.permissions.notifications.detail"),
        note: t("plugins.permissions.notifications.note"),
        needs,
      };
  }
};

export const usePermissionCopy = () => {
  const { t, i18n } = useTranslation();
  return (permission: ExternalPluginPermission) =>
    describePermission(t, i18n.language, permission);
};

/** Lowercase phrase that completes "Can …", e.g. "read one .vpk file you choose". */
const permissionPhrase = (
  t: TFunction,
  language: string,
  permission: ExternalPluginPermission,
) => {
  switch (permission.id) {
    case "files": {
      const variant = filesVariant(permission);
      return permission.extensions.length > 0
        ? t(`plugins.permissions.files.short.${variant}Typed`, {
            extensions: extensionList(language, permission.extensions),
          })
        : t(`plugins.permissions.files.short.${variant}`);
    }
    case "mods":
      return t(`plugins.permissions.mods.short.${modsVariant(permission)}`);
    case "network":
      return t("plugins.permissions.network.short", {
        hosts: formatList(language, permission.hosts, "conjunction"),
      });
    case "game":
    case "events":
    case "storage":
    case "notifications":
      return t(`plugins.permissions.${permission.id}.short`);
  }
};

/** One sentence for everything a plugin asks for, as shown before installing. */
export const describeAccess = (
  t: TFunction,
  language: string,
  permissions: ExternalPluginPermission[],
) => {
  if (permissions.length === 0) return t("plugins.permissions.summary.none");
  const list = formatList(
    language,
    sortPermissions(permissions).map((permission) =>
      permissionPhrase(t, language, permission),
    ),
    "conjunction",
  );
  return findPermission(permissions, "network")
    ? t("plugins.permissions.summary.online", { list })
    : t("plugins.permissions.summary.offline", { list });
};

/** The request as the manifest states it: `files  read  file  .vpk`. */
export const permissionTokens = (permission: ExternalPluginPermission) => {
  switch (permission.id) {
    case "files":
      return [
        permission.id,
        permission.access,
        permission.kind,
        ...permission.extensions.map((extension) => `.${extension}`),
      ];
    case "mods":
      return [permission.id, ...permission.access, permission.profiles];
    case "network":
      return [permission.id, ...permission.hosts];
    case "events":
      return [permission.id, ...permission.types];
    case "game":
    case "storage":
    case "notifications":
      return [permission.id];
  }
};

/** Opens the system picker for a files request, filtered to its extensions. */
export const chooseGrantedPath = (
  t: TFunction,
  request: FilesRequest,
  pluginName: string,
) =>
  open({
    multiple: false,
    directory: request.kind === "folder",
    title: t(`plugins.permissions.files.pick.${request.kind}`, {
      name: pluginName,
    }),
    filters:
      request.kind === "file" && request.extensions.length > 0
        ? [
            {
              name: t("plugins.permissions.files.pick.filter", {
                extensions: request.extensions
                  .map((extension) => `.${extension}`)
                  .join(" "),
              }),
              extensions: request.extensions,
            },
          ]
        : undefined,
  });

type BlockedScope =
  | "internet"
  | "otherSites"
  | "files"
  | "otherFiles"
  | "profiles"
  | "defaultProfile"
  | "otherProfiles"
  | "runningPrograms"
  | "otherPlugins";

const blockedProfiles = (mods: ModsRequest | undefined): BlockedScope[] => {
  if (!mods) return ["profiles"];
  if (mods.access.includes("install")) return ["defaultProfile"];
  return mods.profiles === "picked" ? ["otherProfiles"] : [];
};

/** What no grant can unlock for a plugin asking for `permissions`. */
export const blockedScopes = (
  permissions: ExternalPluginPermission[],
): BlockedScope[] => [
  findPermission(permissions, "network") ? "otherSites" : "internet",
  findPermission(permissions, "files") ? "otherFiles" : "files",
  ...blockedProfiles(findPermission(permissions, "mods")),
  "runningPrograms",
  "otherPlugins",
];
