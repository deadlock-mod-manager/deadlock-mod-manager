import type { StateCreator } from "zustand";
import type { State } from "..";

export type VpkFile = {
  name: string;
  path: string;
  size: number;
};

export type Author =
  | string
  | {
      name: string;
      role?: string;
      url?: string;
    };

export type Layer = {
  name: string;
  priority: number;
  description?: string;
  required: boolean;
  vpkFiles?: VpkFile[];
};

export type Variant = {
  id: string;
  name: string;
  description?: string;
  layers: string[];
  preview_image?: string;
  screenshots?: string[];
};

export type VariantGroup = {
  id: string;
  name: string;
  description?: string;
  default: string;
  variants: Variant[];
};

export type BasicInfo = {
  name: string;
  displayName: string;
  version: string;
  description: string;
  gameVersion?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  readme?: string;
  screenshots?: string[];
};

export type PackagingWizardState = {
  basicInfo: BasicInfo | null;
  authors: Author[];
  layers: Layer[];
  variantGroups: VariantGroup[];

  updateBasicInfo: (info: BasicInfo) => void;
  updateAuthors: (authors: Author[]) => void;
  updateLayers: (layers: Layer[]) => void;
  updateVariantGroups: (variantGroups: VariantGroup[]) => void;
  resetWizard: () => void;
  getWizardState: () => {
    basicInfo: BasicInfo | null;
    authors: Author[];
    layers: Layer[];
    variantGroups: VariantGroup[];
  };
};

const initialState = {
  basicInfo: null,
  authors: [],
  layers: [],
  variantGroups: [],
};

export const createPackagingWizardSlice: StateCreator<
  State,
  [],
  [],
  PackagingWizardState
> = (set, get) => ({
  ...initialState,

  updateBasicInfo: (info: BasicInfo) =>
    set(() => ({
      basicInfo: info,
    })),

  updateAuthors: (authors: Author[]) =>
    set(() => ({
      authors,
    })),

  updateLayers: (layers: Layer[]) =>
    set(() => ({
      layers,
    })),

  updateVariantGroups: (variantGroups: VariantGroup[]) =>
    set(() => ({
      variantGroups,
    })),

  resetWizard: () =>
    set(() => ({
      ...initialState,
    })),

  getWizardState: () => {
    const state = get();
    return {
      basicInfo: state.basicInfo,
      authors: state.authors,
      layers: state.layers,
      variantGroups: state.variantGroups,
    };
  },
});
