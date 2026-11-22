import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PerfTier } from "@/types/generated/PerfTier";

/** What the pointer or keyboard focus is on, shared by the scale and the cards. */
type ScaleFocus =
  | { kind: "config"; configId: string }
  | { kind: "tier"; tier: PerfTier }
  | null;

type ScaleLink = {
  focus: ScaleFocus;
  setFocus: (focus: ScaleFocus) => void;
};

const ScaleLinkContext = createContext<ScaleLink | null>(null);

export const ScaleLinkProvider = ({ children }: { children: ReactNode }) => {
  const [focus, setFocus] = useState<ScaleFocus>(null);
  const value = useMemo(() => ({ focus, setFocus }), [focus]);
  return (
    <ScaleLinkContext.Provider value={value}>
      {children}
    </ScaleLinkContext.Provider>
  );
};

export const useScaleLink = () => {
  const context = useContext(ScaleLinkContext);
  if (!context) {
    throw new Error("useScaleLink must be used inside ScaleLinkProvider");
  }
  return context;
};

/** Handlers that point the scale at `focus` while hovered or focused. */
export const useScaleFocusHandlers = (focus: NonNullable<ScaleFocus>) => {
  const { setFocus } = useScaleLink();
  return {
    onPointerEnter: () => setFocus(focus),
    onPointerLeave: () => setFocus(null),
    onFocus: () => setFocus(focus),
    onBlur: () => setFocus(null),
  };
};
