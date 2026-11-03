// A share code where some mods can't be imported, on top of the share fixtures.
import type { FixtureRoute } from "./fixture-server";
import { SHARE_MODS, shareRoutes } from "./profile-share-fixtures";

export const FAILING_SHARE_CODE = "e2esharecode0002";
const [alpha, , charlie] = SHARE_MODS;
if (!alpha || !charlie) throw new Error("The share fixtures lost a mod");
/** Imports normally. */
export const IMPORTED_MOD = alpha;
/** Its pick is the base archive, but its file selection names the effects
 *  VPK, which only the effects archive holds: the install can't find it. This
 *  is what re-sharing an imported profile produced before #1217. */
export const UNINSTALLABLE_MOD = charlie;
/** Not on GameBanana any more. */
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
    // Reuse the base routes' archive sizes so the picks match the catalog.
    const download = (mod: string, name: string, id: number) => {
      const body = routes.find((route) => route.path === `/dl/${id}`)?.body;
      return {
        remoteId: mod,
        file: name,
        url: `${origin}/dl/${id}`,
        size: body?.length ?? 0,
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
      // Alpha's download answers slowly, so the test can try closing the
      // dialog while the import runs.
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
