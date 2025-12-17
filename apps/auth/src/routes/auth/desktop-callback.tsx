import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthLayout } from "../../components/auth-layout";
import { DesktopCallbackStatus } from "../../components/desktop-callback-status";

const searchSchema = z
  .object({
    code: z.string().optional().default(""),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .transform(({ error_description, ...rest }) => ({
    ...rest,
    errorDescription: error_description,
  }));

export const Route = createFileRoute("/auth/desktop-callback")({
  component: DesktopCallbackPage,
  validateSearch: searchSchema,
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
