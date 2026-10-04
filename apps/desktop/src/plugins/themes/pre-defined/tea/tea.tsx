import { getPluginAssetUrl } from "@/lib/plugins";
import { ThemeBackdrop } from "../../components/theme-backdrop";

const teaBackground = getPluginAssetUrl(
  "themes",
  "public/pre-defined/tea/background/chowder_pattern.png",
);

const backdropStyle = {
  backgroundImage: `linear-gradient(rgba(26, 18, 34, 0.35), rgba(26, 18, 34, 0.6)), url(${teaBackground})`,
  backgroundSize: "auto",
  backgroundPosition: "center",
  backgroundRepeat: "repeat",
};

const TeaTheme = () => (
  <ThemeBackdrop rootClass='tea-theme-active' style={backdropStyle} />
);

export default TeaTheme;
