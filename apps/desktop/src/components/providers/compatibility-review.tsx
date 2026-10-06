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
import { CompatibilityReviewDialog } from "@/components/my-mods/compatibility-review-dialog";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";

interface ReviewRequest {
  id: number;
  profileFolder: string | null;
  resolve: (applied: boolean) => void;
}

const CompatibilityReviewContext = createContext<
  ((profileFolder: string | null) => Promise<boolean>) | null
>(null);

export function CompatibilityReviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const gamePath = usePersistedStore((state) => state.gamePath);
  const [request, setRequest] = useState<ReviewRequest | null>(null);
  const activeRequest = useRef<ReviewRequest | null>(null);
  const nextId = useRef(0);
  const game = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    enabled: !!gamePath && !!request,
    refetchInterval: 5000,
    staleTime: 5000,
  });

  const finish = useCallback((applied: boolean) => {
    activeRequest.current?.resolve(applied);
    activeRequest.current = null;
    setRequest(null);
  }, []);

  const review = useCallback((profileFolder: string | null) => {
    if (activeRequest.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { id: ++nextId.current, profileFolder, resolve };
      activeRequest.current = next;
      setRequest(next);
    });
  }, []);

  useEffect(
    () => () => {
      activeRequest.current?.resolve(false);
      activeRequest.current = null;
    },
    [],
  );

  return (
    <CompatibilityReviewContext.Provider value={review}>
      {children}
      {request ? (
        <CompatibilityReviewDialog
          key={request.id}
          open
          onOpenChange={(open) => {
            if (!open) finish(false);
          }}
          onApplied={() => finish(true)}
          launchAfterApply
          profileFolder={request.profileFolder}
          enabled
          gameRunning={!!game.data || game.isError}
        />
      ) : null}
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
