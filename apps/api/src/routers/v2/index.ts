import { modsRouter } from "./mods";
import { vpkRouter } from "./vpk";

export const v2Router = {
  ...modsRouter,
  ...vpkRouter,
};
