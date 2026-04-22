import { toast } from "@deadlock-mods/ui/components/sonner";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { formatUserError } from "@/lib/format-error";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const skipGlobalError = query.meta?.skipGlobalErrorHandler;
      if (skipGlobalError) {
        return;
      }
      const { title, description } = formatUserError(error);
      toast.error(title, { description });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _, __, mutation) => {
      const skipGlobalError = mutation.options.meta?.skipGlobalErrorHandler;
      if (skipGlobalError) {
        return;
      }
      const { title, description } = formatUserError(error);
      toast.error(title, { description });
    },
  }),
});
