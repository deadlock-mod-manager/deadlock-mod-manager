import { getPluginAssetUrl } from "@/lib/plugins";
import { ThemeBackdrop } from "../../components/theme-backdrop";

const nightshiftBg = getPluginAssetUrl(
  "themes",
  "public/pre-defined/nightshift/background/nightshift_bg_1080p.png",
);

const backdropStyle = {
  backgroundImage: `linear-gradient(hsl(var(--background) / 0.7), hsl(var(--background) / 0.7)), url(${nightshiftBg})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
};

const NightshiftTheme = () => (
  <ThemeBackdrop rootClass='nightshift-theme-active' style={backdropStyle} />
);

export default NightshiftTheme;
