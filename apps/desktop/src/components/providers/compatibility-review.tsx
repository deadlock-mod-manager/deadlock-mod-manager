import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  HeldBackFixDialog,
  type HeldBackMod,
  LaunchFixDialog,
  type LaunchFixChoice,
} from "@/components/mod-health/launch-fix-dialog";
import { CompatibilityReviewDialog } from "@/components/my-mods/compatibility-review-dialog";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";

type ReviewOptions = { launchAfterApply?: boolean };

interface ReviewRequest {
  id: number;
  profileFolder: string | null;
  launchAfterApply: boolean;
  resolve: (applied: boolean) => void;
}

type LaunchFixPrompt =
  | { kind: "autoFixOff"; count: number }
  | { kind: "heldBack"; mods: readonly HeldBackMod[] };

interface LaunchFixRequest {
  id: number;
  prompt: LaunchFixPrompt;
  resolve: (choice: LaunchFixChoice) => void;
}

type Review = (
  profileFolder: string | null,
  options?: ReviewOptions,
) => Promise<boolean>;
type AskLaunchFix = (prompt: LaunchFixPrompt) => Promise<LaunchFixChoice>;

const CompatibilityReviewContext = createContext<Review | null>(null);
const LaunchFixContext = createContext<AskLaunchFix | null>(null);

export function CompatibilityReviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const gamePath = usePersistedStore((state) => state.gamePath);
  const [request, setRequest] = useState<ReviewRequest | null>(null);
  const [fixRequest, setFixRequest] = useState<LaunchFixRequest | null>(null);
  const activeRequest = useRef<ReviewRequest | null>(null);
  const activeFixRequest = useRef<LaunchFixRequest | null>(null);
  const nextId = useRef(0);
  // useHeroDetection already polls this key every 5s; a second interval here
  // would drift out of phase and double the process scans.
  const game = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    enabled: !!gamePath && !!request,
    staleTime: 5000,
  });

  const finish = useCallback((applied: boolean) => {
    activeRequest.current?.resolve(applied);
    activeRequest.current = null;
    setRequest(null);
  }, []);

  const review = useCallback<Review>((profileFolder, options) => {
    // A newer launch replaces an unanswered review instead of being dropped,
    // so a request that never closed cannot block every later launch.
    activeRequest.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = {
        id: ++nextId.current,
        profileFolder,
        launchAfterApply: options?.launchAfterApply ?? true,
        resolve,
      };
      activeRequest.current = next;
      setRequest(next);
    });
  }, []);

  const finishFix = useCallback((choice: LaunchFixChoice) => {
    activeFixRequest.current?.resolve(choice);
    activeFixRequest.current = null;
    setFixRequest(null);
  }, []);

  const askLaunchFix = useCallback<AskLaunchFix>((prompt) => {
    activeFixRequest.current?.resolve("cancel");
    return new Promise<LaunchFixChoice>((resolve) => {
      const next = { id: ++nextId.current, prompt, resolve };
      activeFixRequest.current = next;
      setFixRequest(next);
    });
  }, []);

  useEffect(
    () => () => {
      activeRequest.current?.resolve(false);
      activeRequest.current = null;
      activeFixRequest.current?.resolve("cancel");
      activeFixRequest.current = null;
    },
    [],
  );

  return (
    <CompatibilityReviewContext.Provider value={review}>
      <LaunchFixContext.Provider value={askLaunchFix}>
        {children}
        {request ? (
          <CompatibilityReviewDialog
            key={request.id}
            open
            onOpenChange={(open) => {
              if (!open) finish(false);
            }}
            onApplied={() => finish(true)}
            launchAfterApply={request.launchAfterApply}
            profileFolder={request.profileFolder}
            enabled
            gameRunning={!!game.data || game.isError}
          />
        ) : null}
        {fixRequest?.prompt.kind === "autoFixOff" ? (
          <LaunchFixDialog
            key={fixRequest.id}
            count={fixRequest.prompt.count}
            onChoose={finishFix}
          />
        ) : null}
        {fixRequest?.prompt.kind === "heldBack" ? (
          <HeldBackFixDialog
            key={fixRequest.id}
            mods={fixRequest.prompt.mods}
            onChoose={finishFix}
          />
        ) : null}
      </LaunchFixContext.Provider>
    </CompatibilityReviewContext.Provider>
  );
}

export function useCompatibilityReview() {
  const review = useContext(CompatibilityReviewContext);
  if (!review) {
    throw new Error(
      "useCompatibilityReview requires CompatibilityReviewProvider",
    );
  }
  return review;
}

export function useLaunchFixPrompt() {
  const ask = useContext(LaunchFixContext);
  if (!ask) {
    throw new Error("useLaunchFixPrompt requires CompatibilityReviewProvider");
  }
  return ask;
}
