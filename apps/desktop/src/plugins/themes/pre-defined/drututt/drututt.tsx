import { getPluginAssetUrl } from "@/lib/plugins";
import {
  ThemeBackdrop,
  useThemeStyleVars,
} from "../../components/theme-backdrop";
import { useGassyViscousFart } from "./gassy-viscous";
import { ModsPopup } from "./mods-popup";

const drututtBackground = getPluginAssetUrl(
  "themes",
  "public/pre-defined/drututt/background.jpg",
);

// Channel offline art by @MiyuArt_, cropped to the campfire band and dimmed so cards stay readable.
const backdropStyle = {
  backgroundImage: `linear-gradient(rgba(10, 21, 23, 0.85), rgba(10, 21, 23, 0.92) 40%, rgba(10, 21, 23, 0.97)), url(${drututtBackground})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
};

const cssVars = `
    .drututt-theme-active {
      --background: 189 39% 6%;
      --foreground: 175 45% 94%;
      --card: 190 39% 9% / 0.88;
      --card-foreground: 175 45% 94%;
      --popover: 190 39% 9% / 0.95;
      --toast-background: 190 39% 9%;
      --popover-foreground: 175 45% 94%;
      --secondary: 177 29% 14% / 0.85;
      --secondary-foreground: 175 30% 88%;
      --muted: 186 33% 12% / 0.85;
      --muted-foreground: 182 15% 60%;
      --primary: 180 60% 54%;
      --primary-foreground: 178 83% 7%;
      --accent: 36 90% 59%;
      --accent-foreground: 178 83% 7%;
      --border: 187 33% 16%;
      --input: 187 33% 14% / 0.7;
      --ring: 180 60% 54%;
      --sidebar-background: 189 39% 6% / 0.9;
      --sidebar-foreground: 175 45% 94%;
      --sidebar-primary: 180 60% 54%;
      --sidebar-primary-foreground: 178 83% 7%;
      --sidebar-accent: 180 60% 54%;
      --sidebar-accent-foreground: 178 83% 7%;
      --sidebar-border: 187 33% 13%;
    }
  `;

const DrututtTheme = () => {
  useThemeStyleVars("drututt-dynamic-vars", cssVars);
  useGassyViscousFart();
  return (
    <>
      <ThemeBackdrop rootClass='drututt-theme-active' style={backdropStyle} />
      <ModsPopup />
    </>
  );
};

export default DrututtTheme;
