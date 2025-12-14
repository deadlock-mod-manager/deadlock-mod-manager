import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { LoginPageContent } from "../components/login-page-content";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: z
    .object({
      returnTo: z.string().optional().default("/"),
      error: z.string().optional().default(""),
    })
    .transform(({ returnTo, error }) => ({
      returnTo: returnTo ? decodeURIComponent(returnTo) : "/",
      error: error ? decodeURIComponent(error) : undefined,
    })),
});

function LoginPage() {
  const { returnTo, error } = Route.useSearch();
  const baseURL = typeof window !== "undefined" ? window.location.origin : "";

  const isDefaultReturn = returnTo === "/";
  const absoluteReturnTo = returnTo.startsWith("http")
    ? returnTo
    : `${baseURL}${returnTo.startsWith("/") ? "" : "/"}${returnTo}`;
  const encodedReturnTo = returnTo ? encodeURIComponent(returnTo) : undefined;
  const absoluteErrorCallback = `${baseURL}/login?returnTo=${encodedReturnTo}&error=steam_auth_failed`;

  return (
    <AuthLayout subtitle='Sign in to your account'>
      <div className='mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]'>
        <Card>
          <CardContent className='pt-6'>
            <LoginPageContent
              callbackURL={!isDefaultReturn ? absoluteReturnTo : undefined}
              error={error ? decodeURIComponent(error) : undefined}
              githubUrl={
                isDefaultReturn
                  ? "/api/auth/sign-in/social?provider=github"
                  : `/api/auth/sign-in/social?provider=github&callbackURL=${encodeURIComponent(absoluteReturnTo)}`
              }
              steamErrorCallbackURL={absoluteErrorCallback}
            />
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
