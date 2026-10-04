import { getPluginAssetUrl } from "@/lib/plugins";
import { ThemeBackdrop } from "../../components/theme-backdrop";

const bloodmoonBg = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/background/background.png",
);

const backdropStyle = {
  backgroundImage: `linear-gradient(hsl(var(--background) / 0.6), hsl(var(--background) / 0.6)), url(${bloodmoonBg})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
};

const BloodmoonTheme = () => (
  <ThemeBackdrop rootClass='bloodmoon-theme-active' style={backdropStyle} />
);

export default BloodmoonTheme;
