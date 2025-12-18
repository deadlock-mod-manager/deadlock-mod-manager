import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { handleCallback } from "@/lib/auth/auth.server";

export const Route = createFileRoute("/auth/callback")({
  component: OIDCCallbackComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || "",
    state: search.state as string | undefined,
    error: search.error as string | undefined,
    error_description: search.error_description as string | undefined,
  }),
  beforeLoad: async ({ search }) => {
    await handleCallback({
      data: {
        code: search.code,
        state: search.state,
        error: search.error,
        error_description: search.error_description,
      },
    });
  },
});

function OIDCCallbackComponent() {
  return (
    <div className='flex min-h-screen flex-col items-center justify-center'>
      <Loader />
      <p className='mt-4 text-lg'>Completing sign in...</p>
    </div>
  );
}
