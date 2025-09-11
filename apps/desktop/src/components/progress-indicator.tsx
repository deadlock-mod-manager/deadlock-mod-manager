import { createContext, type ReactNode, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProgressContextType {
  isProcessing: boolean;
  processingStatus: string;
  setProcessing: (isProcessing: boolean, status?: string) => void;
}

const ProgressContext = createContext<ProgressContextType | undefined>(
  undefined
);

export const ProgressProvider = ({ children }: { children: ReactNode }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const setProcessing = (processing: boolean, status = '') => {
    setIsProcessing(processing);
    setProcessingStatus(status);
  };

  return (
    <ProgressContext.Provider
      value={{ isProcessing, processingStatus, setProcessing }}
    >
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};

export const ProgressIndicator = () => {
  const { t } = useTranslation();
  const { isProcessing, processingStatus } = useProgress();

  if (!isProcessing) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-[9999] min-w-[250px] max-w-[400px] rounded-lg border bg-background p-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
        <div className="flex-1">
          <div className="font-medium text-foreground text-sm">
            {processingStatus}
          </div>
          <div className="mt-1 text-muted-foreground text-xs">
            {t('progress.pleaseWait')}
          </div>
        </div>
      </div>
    </div>
  );
};
