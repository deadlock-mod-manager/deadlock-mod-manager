import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "../../components/auth-layout";
import { DesktopCallbackStatus } from "../../components/desktop-callback-status";

export const Route = createFileRoute("/auth/callback")({
  component: OIDCCallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || "",
    state: search.state as string | undefined,
    error: search.error as string | undefined,
    errorDescription: search.error_description as string | undefined,
  }),
});

function DesktopCallbackPage() {
  const { code, state, error, errorDescription } = Route.useSearch();

  return (
    <AuthLayout logoClassName='mx-auto h-24 w-auto'>
      <div className='mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]'>
        <DesktopCallbackStatus
          code={code}
          state={state}
          error={error}
          errorDescription={errorDescription}
        />
      </div>
    </AuthLayout>
  );
}
