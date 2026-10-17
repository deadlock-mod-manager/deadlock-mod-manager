import { defaultParams, presetById } from "./catalog";
import {
  createId,
  type DashboardLayout,
  type DashboardTab,
  type DashboardWidget,
  DEFAULT_LAYOUT,
  type TabIcon,
  type WidgetView,
} from "./layout";

/**
 * Ready-made tabs for the "new tab" menu: the five built-in ones (to restore one
 * that was deleted) and a few compositions of presets nobody has to assemble
 * by hand.
 */

const fromPreset = (
  presetId: string,
  size?: { w: number; h: number },
  view?: Partial<WidgetView>,
): DashboardWidget[] => {
  const preset = presetById(presetId);
  if (!preset) {
    return [];
  }
  return [
    {
      id: createId("widget"),
      title: "",
      w: size?.w ?? preset.size.w,
      h: size?.h ?? preset.size.h,
      source: {
        kind: "preset",
        preset: preset.id,
        params: defaultParams(preset),
      },
      view: { ...preset.view, ...view },
    },
  ];
};

const kpi = (y: string) =>
  fromPreset("you.summary", { w: 3, h: 3 }, { y: [y] });

interface TabTemplate {
  id: string;
  icon: TabIcon;
  widgets: () => DashboardWidget[];
}

const EXTRA_TEMPLATES: TabTemplate[] = [
  {
    id: "performance",
    icon: "target",
    widgets: () => [
      ...kpi("winrate"),
      ...kpi("kda"),
      ...kpi("soulsPerMin"),
      ...kpi("matchesLast30Days"),
      ...fromPreset("you.performanceCurve", { w: 8, h: 8 }),
      ...fromPreset("you.soulSources", { w: 4, h: 8 }),
      ...fromPreset("you.percentiles", { w: 12, h: 9 }),
    ],
  },
  {
    id: "habits",
    icon: "clock",
    widgets: () => [
      ...fromPreset("you.daily"),
      ...fromPreset("you.byHour"),
      ...fromPreset("you.byWeekday"),
      ...fromPreset("you.session"),
      ...fromPreset("you.byDuration"),
    ],
  },
  {
    id: "ranked",
    icon: "trophy",
    widgets: () => [
      ...fromPreset("you.rank", { w: 3, h: 8 }),
      ...fromPreset("you.rankHistory", { w: 9, h: 8 }),
      ...fromPreset("global.rankDistribution"),
    ],
  },
  {
    id: "meta",
    icon: "globe",
    widgets: () => [
      ...fromPreset("global.heroes"),
      ...fromPreset("global.bans"),
      ...fromPreset("global.duos"),
      ...fromPreset("global.daily", { w: 6, h: 8 }),
      ...fromPreset("global.items", { w: 12, h: 9 }),
    ],
  },
];

export const TAB_TEMPLATE_IDS = [
  ...DEFAULT_LAYOUT.tabs.map((tab) => tab.id),
  ...EXTRA_TEMPLATES.map((template) => template.id),
];

/**
 * A fresh tab from a template. Built-in tabs keep their id while it is free, so
 * links like `?tab=heroes` and the translated name keep working once restored.
 */
export const tabFromTemplate = (
  templateId: string,
  layout: DashboardLayout,
  title: string,
): DashboardTab | null => {
  const builtIn = DEFAULT_LAYOUT.tabs.find((tab) => tab.id === templateId);
  const taken = layout.tabs.some((tab) => tab.id === templateId);
  if (builtIn) {
    return {
      ...structuredClone(builtIn),
      id: taken ? createId("tab") : builtIn.id,
      title: taken ? title : null,
      widgets: builtIn.widgets.map((widget) =>
        Object.assign(structuredClone(widget), { id: createId("widget") }),
      ),
    };
  }
  const template = EXTRA_TEMPLATES.find((entry) => entry.id === templateId);
  return template
    ? {
        id: createId("tab"),
        title,
        icon: template.icon,
        widgets: template.widgets(),
      }
    : null;
};

export const emptyTab = (title: string): DashboardTab => ({
  id: createId("tab"),
  title,
  icon: "star",
  widgets: [],
});
