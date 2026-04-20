import { toast } from "@deadlock-mods/ui/components/sonner";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errors";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const skipGlobalError = query.meta?.skipGlobalErrorHandler;
      if (skipGlobalError) {
        return;
      }
      toast.error(`Error: ${getErrorMessage(error)}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _, __, mutation) => {
      const skipGlobalError = mutation.options.meta?.skipGlobalErrorHandler;
      if (skipGlobalError) {
        return;
      }
      const { mutationKey } = mutation.options;
      const key = mutationKey ? `: ${mutationKey.join(" ")}` : "";
      toast.error(`Error${key}: ${getErrorMessage(error)}`);
    },
  }),
});
