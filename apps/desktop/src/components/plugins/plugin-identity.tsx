import {
  BinocularsIcon,
  BroadcastIcon,
  BugIcon,
  ChartLineUpIcon,
  CompassIcon,
  CrosshairIcon,
  DatabaseIcon,
  ExportIcon,
  EyeIcon,
  FlaskIcon,
  GearIcon,
  GlobeSimpleIcon,
  HammerIcon,
  type Icon,
  ImageIcon,
  LightningIcon,
  MagicWandIcon,
  MapTrifoldIcon,
  MonitorPlayIcon,
  MusicNotesIcon,
  PackageIcon,
  PaintBrushIcon,
  PaletteIcon,
  PresentationChartIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  ShieldIcon,
  SpeakerHighIcon,
  SunIcon,
  SwordIcon,
  TerminalIcon,
  TrophyIcon,
  UsersIcon,
  WaveformIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Manifest `icon` names the host can draw. Anything else falls back to a puzzle piece. */
const GLYPHS = {
  binoculars: BinocularsIcon,
  broadcast: BroadcastIcon,
  bug: BugIcon,
  "chart-line-up": ChartLineUpIcon,
  compass: CompassIcon,
  crosshair: CrosshairIcon,
  database: DatabaseIcon,
  export: ExportIcon,
  eye: EyeIcon,
  flask: FlaskIcon,
  gear: GearIcon,
  "globe-simple": GlobeSimpleIcon,
  hammer: HammerIcon,
  image: ImageIcon,
  lightning: LightningIcon,
  "magic-wand": MagicWandIcon,
  "map-trifold": MapTrifoldIcon,
  "monitor-play": MonitorPlayIcon,
  "music-notes": MusicNotesIcon,
  package: PackageIcon,
  "paint-brush": PaintBrushIcon,
  palette: PaletteIcon,
  "presentation-chart": PresentationChartIcon,
  "puzzle-piece": PuzzlePieceIcon,
  "rocket-launch": RocketLaunchIcon,
  shield: ShieldIcon,
  "speaker-high": SpeakerHighIcon,
  sun: SunIcon,
  sword: SwordIcon,
  terminal: TerminalIcon,
  trophy: TrophyIcon,
  users: UsersIcon,
  waveform: WaveformIcon,
  wrench: WrenchIcon,
} satisfies Record<string, Icon>;

/** Plugins without an `accent` use the app's primary colour. */
const DEFAULT_ACCENT = "#EFE0BE";

const isGlyphName = (name: string): name is keyof typeof GLYPHS =>
  Object.prototype.hasOwnProperty.call(GLYPHS, name);

export const pluginGlyph = (icon: string | null): Icon =>
  icon && isGlyphName(icon) ? GLYPHS[icon] : PuzzlePieceIcon;

/** `#RRGGBB` plus a two-digit hex alpha, as the designs specify tints. */
export const tint = (accent: string, alpha: string) => `${accent}${alpha}`;

type PluginTileProps = {
  icon: string | null;
  accent: string | null;
  /** Tile edge in px. */
  size: number;
  /** Glyph edge in px. */
  glyphSize: number;
  radius: number;
  /** Background alpha, e.g. "1A". */
  fillAlpha: string;
  /** Outline alpha; omit for no outline. */
  outlineAlpha?: string;
  className?: string;
};

/** A plugin's glyph on a tile tinted with its accent. */
export const PluginTile = ({
  icon,
  accent,
  size,
  glyphSize,
  radius,
  fillAlpha,
  outlineAlpha,
  className,
}: PluginTileProps) => {
  const color = accent ?? DEFAULT_ACCENT;
  const Glyph = pluginGlyph(icon);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: tint(color, fillAlpha),
        outline: outlineAlpha
          ? `1px solid ${tint(color, outlineAlpha)}`
          : undefined,
        outlineOffset: outlineAlpha ? -0.5 : undefined,
      }}>
      <Glyph color={color} size={glyphSize} />
    </span>
  );
};
