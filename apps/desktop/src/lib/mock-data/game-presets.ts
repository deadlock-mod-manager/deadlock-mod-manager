import type { Option, Preset } from "@/types/game-presets";

export const MOCK_OPTIONS: Option[] = [
  {
    id: "opt-1",
    key: "opt-1",
    varName: "r_aspectratio",
    valueType: "number",
    min: 1.6,
    max: 2.6,
    defaultValue: "2.15",
    label: "FOV",
    help: "Field of view aspect ratio",
  },
  {
    id: "opt-2",
    key: "opt-2",
    varName: "r_ssao",
    valueType: "string",
    stringAllowed: ["0", "1"],
    defaultValue: "0",
    label: "SSAO",
    help: "Screen space ambient occlusion",
  },
  {
    id: "opt-3",
    key: "opt-3",
    varName: "lb_dynamic_shadow_resolution_base",
    valueType: "string",
    stringAllowed: ["0", "256", "512", "1024"],
    defaultValue: "256",
    label: "Shadow Quality",
    help: "Dynamic shadow resolution",
  },
  {
    id: "opt-4",
    key: "opt-4",
    varName: "cl_particle_max_count",
    valueType: "number",
    min: 50,
    max: 1000,
    defaultValue: "350",
    label: "Particles",
    help: "Maximum particle count",
  },
  {
    id: "opt-5",
    key: "opt-5",
    varName: "cl_disable_ragdolls",
    valueType: "string",
    stringAllowed: ["0", "1"],
    defaultValue: "1",
    label: "Ragdolls",
    help: "Disable ragdoll physics",
  },
];

export const MOCK_PRESETS: Preset[] = [
  {
    id: "preset-1",
    name: "FPS Boost",
    description: "Optimized for maximum performance",
    values: {
      "opt-1": "1.8",
      "opt-2": "0",
      "opt-3": "0",
      "opt-4": "100",
      "opt-5": "1",
    },
  },
  {
    id: "preset-2",
    name: "Balanced Visuals",
    description: "Balance between quality and performance",
    values: {
      "opt-1": "2.15",
      "opt-2": "1",
      "opt-3": "512",
      "opt-4": "500",
      "opt-5": "0",
    },
  },
  {
    id: "preset-3",
    name: "My Custom Preset",
    description: "Custom configuration",
    values: {
      "opt-1": "2.0",
      "opt-2": "1",
      "opt-3": "256",
      "opt-4": "350",
      "opt-5": "1",
    },
  },
];

export const MOCK_CURRENT_CONFIG: Record<string, string> = {
  r_aspectratio: "2.15",
  r_ssao: "0",
  lb_dynamic_shadow_resolution_base: "512",
  cl_particle_max_count: "500",
  cl_disable_ragdolls: "0",
};

