import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Loader from "@/components/loader";
import { initiateLogin } from "@/lib/auth/auth.server";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  validateSearch: z.object({
    desktop: z.boolean().optional().default(false),
    error: z.string().optional().default(""),
    returnTo: z.string().optional().default("/"),
  }),
  beforeLoad: async ({ search }) => {
    if (!search.error) {
      await initiateLogin({ data: { returnTo: search.returnTo } });
    }
  },
});

function RouteComponent() {
  const { error } = Route.useSearch();

  if (error) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center'>
        <div className='max-w-md rounded-lg border border-destructive bg-destructive/10 p-6'>
          <h2 className='mb-2 text-xl font-semibold text-destructive'>
            Sign In Failed
          </h2>
          <p className='text-sm text-muted-foreground'>{error}</p>
          <a
            href='/login'
            className='mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'>
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen flex-col items-center justify-center'>
      <Loader />
      <p className='mt-4 text-lg'>Redirecting to sign in...</p>
    </div>
  );
}
