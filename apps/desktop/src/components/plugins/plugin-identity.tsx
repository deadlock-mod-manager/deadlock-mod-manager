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

const DEFAULT_ACCENT = "hsl(var(--primary))";

const isGlyphName = (name: string): name is keyof typeof GLYPHS =>
  Object.prototype.hasOwnProperty.call(GLYPHS, name);

export const pluginGlyph = (icon: string | null): Icon =>
  icon && isGlyphName(icon) ? GLYPHS[icon] : PuzzlePieceIcon;

export const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

type PluginTileProps = {
  icon: string | null;
  accent: string | null;
  size: number;
  glyphSize: number;
  radius: number;
  fillAlpha: number;
  outlineAlpha?: number;
  className?: string;
};

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
