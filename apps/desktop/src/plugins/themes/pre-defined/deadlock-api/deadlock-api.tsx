import {
  ThemeBackdrop,
  useThemeStyleVars,
} from "../../components/theme-backdrop";

const PRIMARY_COLOR = "#fa4454";

const backdropStyle = {
  background: `
    radial-gradient(ellipse 85% 65% at 0% 0%, rgba(250, 68, 84, 0.18) 0%, transparent 52%),
    radial-gradient(ellipse 80% 60% at 100% 100%, rgba(250, 68, 84, 0.14) 0%, transparent 48%),
    radial-gradient(ellipse 55% 45% at 100% 0%, rgba(255, 107, 122, 0.08) 0%, transparent 42%),
    radial-gradient(ellipse 65% 50% at 0% 100%, rgba(255, 107, 122, 0.06) 0%, transparent 38%),
    hsl(var(--background))
  `,
};

const cssVars = `
    .deadlock-api-theme-active {
      --background: 220 20% 2%;
      --foreground: 210 20% 92%;
      --card: 220 20% 5% / 0.9;
      --card-foreground: 210 20% 92%;
      --popover: 220 20% 5% / 0.95;
      --popover-foreground: 210 20% 92%;
      --secondary: 220 15% 9% / 0.85;
      --secondary-foreground: 210 15% 85%;
      --muted: 220 15% 11% / 0.85;
      --muted-foreground: 210 10% 55%;
      --primary: 354 94% 62%;
      --primary-foreground: 0 0% 100%;
      --accent: 354 80% 50%;
      --accent-foreground: 0 0% 100%;
      --border: 220 15% 13%;
      --input: 220 15% 11% / 0.7;
      --ring: 354 90% 58%;
      --sidebar-background: 220 20% 2% / 0.98;
      --sidebar-foreground: 210 20% 92%;
      --sidebar-primary: 354 94% 62%;
      --sidebar-primary-foreground: 0 0% 100%;
      --sidebar-accent: 354 80% 50%;
      --sidebar-accent-foreground: 0 0% 100%;
      --sidebar-border: 220 15% 11%;
      --eb-color: ${PRIMARY_COLOR};
    }
  `;

const DeadlockApiTheme = () => {
  useThemeStyleVars("deadlock-api-dynamic-vars", cssVars);
  return (
    <ThemeBackdrop
      rootClass='deadlock-api-theme-active'
      style={backdropStyle}
    />
  );
};

export default DeadlockApiTheme;
