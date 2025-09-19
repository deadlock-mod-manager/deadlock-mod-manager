import type React from "react";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import type { InstallWithCollectionFunction } from "@/hooks/use-install-with-collection";
import useInstallWithCollection from "@/hooks/use-install-with-collection";

type InstallWithCollectionProps = {
  children: (params: {
    install: InstallWithCollectionFunction;
    isAnalyzing: boolean;
  }) => React.ReactNode;
};

export const InstallWithCollection: React.FC<InstallWithCollectionProps> = ({
  children,
}) => {
  const {
    install,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    setShowFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallWithCollection();

  return (
    <>
      {children({ install, isAnalyzing })}

      <FileSelectorDialog
        fileTree={currentFileTree}
        isOpen={showFileSelector}
        modName={currentMod?.name}
        onCancel={cancelInstallation}
        onConfirm={confirmInstallation}
        onOpenChange={setShowFileSelector}
      />
    </>
  );
};

export default InstallWithCollection;
