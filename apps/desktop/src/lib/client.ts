import { toast } from "@deadlock-mods/ui/components/sonner";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _, __, mutation) => {
      const { mutationKey } = mutation.options;
      const key = mutationKey ? `: ${mutationKey.join(" ")}` : "";
      toast.error(`Error: ${key} - ${error.message}`);
    },
  }),
});
