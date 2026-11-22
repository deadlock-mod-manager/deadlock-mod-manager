import { Progress } from "@deadlock-mods/ui/components/progress";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { formatSize } from "@/lib/utils";

const PROGRESS_TOAST_ID = "processing-progress";

interface ProcessingBytes {
  done: number;
  total: number;
}

interface ProgressContextType {
  isProcessing: boolean;
  processingStatus: string;
  setProcessing: (
    isProcessing: boolean,
    status?: string,
    bytes?: ProcessingBytes,
  ) => void;
}

const ProgressContext = createContext<ProgressContextType | undefined>(
  undefined,
);

const ByteProgress = ({ done, total }: ProcessingBytes) => {
  const { t } = useTranslation();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className='mt-1.5 flex w-full flex-col gap-1.5'>
      <Progress
        className='h-1 rounded-full [&>div]:duration-200 [&>div]:ease-out'
        value={percent}
      />
      <div className='flex justify-between text-xs tabular-nums'>
        <span>
          {t("progress.bytes", {
            done: formatSize(done),
            total: formatSize(total),
          })}
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  );
};

export const ProgressProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingBytes, setProcessingBytes] =
    useState<ProcessingBytes | null>(null);

  const setProcessing = (
    processing: boolean,
    status = "",
    bytes?: ProcessingBytes,
  ) => {
    setIsProcessing(processing);
    setProcessingStatus(status);
    setProcessingBytes(bytes ?? null);
  };

  // A loading toast shows the status on every page, including drops that
  // start outside Add Mods.
  useEffect(() => {
    if (!isProcessing) {
      toast.dismiss(PROGRESS_TOAST_ID);
      return;
    }
    toast.loading(processingStatus, {
      id: PROGRESS_TOAST_ID,
      description: processingBytes ? (
        <ByteProgress {...processingBytes} />
      ) : (
        t("progress.pleaseWait")
      ),
    });
  }, [isProcessing, processingStatus, processingBytes, t]);

  const contextValue = useMemo(
    () => ({ isProcessing, processingStatus, setProcessing }),
    [isProcessing, processingStatus],
  );

  return (
    <ProgressContext.Provider value={contextValue}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error("useProgress must be used within a ProgressProvider");
  }
  return context;
};
