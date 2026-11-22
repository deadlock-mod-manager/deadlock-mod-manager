import type { FixtureRoute } from "./fixture-server";
import { SHARE_MODS, shareRoutes } from "./profile-share-fixtures";

export const FAILING_SHARE_CODE = "e2esharecode0002";
const [alpha, , charlie] = SHARE_MODS;
if (!alpha || !charlie) throw new Error("The share fixtures lost a mod");
export const IMPORTED_MOD = alpha;
export const UNINSTALLABLE_MOD = charlie;
export const MISSING_MOD_ID = "920099";

const archive = (name: string) => {
  const found = charlie.archives.find((item) => item.name === name);
  if (!found) throw new Error(`Charlie has no ${name}`);
  return found;
};

export const importFailureRoutes = async () => {
  const base = await shareRoutes();
  return (origin: string): FixtureRoute[] => {
    const routes = base(origin);
    const download = (mod: string, name: string, id: number) => {
      const route = routes.find((item) => item.path === `/dl/${id}`);
      if (!route) throw new Error(`No fixture download /dl/${id}`);
      return {
        remoteId: mod,
        file: name,
        url: `${origin}/dl/${id}`,
        size: route.body.length,
      };
    };
    const [alphaArchive] = alpha.archives;
    if (!alphaArchive) throw new Error("Alpha has no archive");
    const charlieBase = archive("charlie-base.zip");
    const effects = archive("charlie-effects.zip");
    const shared = {
      version: "3",
      payload: {
        mods: [
          {
            remoteId: alpha.id,
            submissionType: "mod",
            selectedDownloads: [
              download(alpha.id, alphaArchive.name, alphaArchive.id),
            ],
          },
          {
            remoteId: charlie.id,
            submissionType: "mod",
            selectedDownloads: [
              download(charlie.id, charlieBase.name, charlieBase.id),
            ],
            fileTree: {
              files: [
                {
                  name: effects.vpk,
                  path: effects.vpk,
                  size: 0,
                  is_selected: true,
                  archive_name: "",
                },
              ],
              total_files: 1,
              has_multiple_files: false,
            },
          },
          { remoteId: MISSING_MOD_ID, submissionType: "mod" },
        ],
        loadOrder: [alpha.id, charlie.id, MISSING_MOD_ID],
      },
    };
    const alphaPath = `/dl/${alphaArchive.id}`;
    const alphaRoute = routes.find((route) => route.path === alphaPath);
    if (!alphaRoute) throw new Error("The share fixtures lost Alpha's archive");
    return [
      ...routes.filter((route) => route !== alphaRoute),
      { ...alphaRoute, headerDelayMs: 3_000 },
      {
        method: "GET",
        path: `/apiv11/Mod/${MISSING_MOD_ID}/ProfilePage`,
        status: 404,
        body: '{"_sErrorCode":"404"}',
      },
      {
        method: "GET",
        path: `/api/v2/profiles/${FAILING_SHARE_CODE}`,
        status: 200,
        body: JSON.stringify(shared),
      },
    ];
  };
};
