import { ThemeBackdrop } from "../../components/theme-backdrop";

const backdropStyle = {
  backgroundColor: "#211722",
  backgroundImage: `
    radial-gradient(ellipse 70% 55% at 0% 0%, rgba(255, 140, 192, 0.12) 0%, transparent 55%),
    radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255, 140, 192, 0.09) 0%, transparent 50%),
    radial-gradient(circle, rgba(255, 196, 224, 0.09) 1px, transparent 1.5px)
  `,
  backgroundSize: "100% 100%, 100% 100%, 22px 22px",
};

const LovelockTheme = () => (
  <ThemeBackdrop rootClass='lovelock-theme-active' style={backdropStyle} />
);

export default LovelockTheme;
