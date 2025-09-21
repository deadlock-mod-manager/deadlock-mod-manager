import { createContext, type ReactNode, useContext, useState } from "react";

interface ScrollBackButtonContextType {
  showBackButton: boolean;
  onBackClick?: () => void;
  setShowBackButton: (show: boolean) => void;
  setOnBackClick: (callback?: () => void) => void;
}

const ScrollBackButtonContext = createContext<ScrollBackButtonContextType>({
  showBackButton: false,
  setShowBackButton: () => {},
  setOnBackClick: () => {},
});

interface ScrollBackButtonProviderProps {
  children: ReactNode;
}

export const ScrollBackButtonProvider = ({
  children,
}: ScrollBackButtonProviderProps) => {
  const [showBackButton, setShowBackButton] = useState(false);
  const [onBackClick, setOnBackClick] = useState<(() => void) | undefined>();

  return (
    <ScrollBackButtonContext.Provider
      value={{
        showBackButton,
        onBackClick,
        setShowBackButton,
        setOnBackClick,
      }}>
      {children}
    </ScrollBackButtonContext.Provider>
  );
};

export const useScrollBackButtonContext = () => {
  return useContext(ScrollBackButtonContext);
};
