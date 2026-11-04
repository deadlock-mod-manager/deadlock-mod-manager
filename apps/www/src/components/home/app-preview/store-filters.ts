import {
  BarricadeIcon,
  CardsThreeIcon,
  CubeIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { PREVIEW_MODS } from "./mods";

export const CONTENT_TABS = [
  { id: "mods", icon: CubeIcon },
  { id: "sounds", icon: MusicNotesIcon },
  { id: "collections", icon: CardsThreeIcon },
  { id: "wips", icon: BarricadeIcon },
] as const;

export const heroes = [
  ...new Set(PREVIEW_MODS.flatMap((mod) => (mod.hero ? [mod.hero] : []))),
].sort();
