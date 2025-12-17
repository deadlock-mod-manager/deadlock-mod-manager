import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { LoginPageContent } from "../components/login-page-content";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: z.object({
    returnTo: z.string().optional().default("/"),
    error: z.string().optional().default(""),
    redirect_uri: z.string().optional(),
    client_id: z.string().optional(),
    state: z.string().optional(),
    code_challenge: z.string().optional(),
    code_challenge_method: z.string().optional(),
    response_type: z.string().optional(),
    scope: z.string().optional(),
  }),
});

function LoginPage() {
  const search = Route.useSearch();
  const {
    returnTo = "/",
    error,
    redirect_uri,
    client_id,
    state,
    code_challenge,
    code_challenge_method,
    response_type,
    scope,
  } = search;

  const baseURL = typeof window !== "undefined" ? window.location.origin : "";

  const hasOidcParams =
    !!redirect_uri || !!client_id || !!state || !!code_challenge;

  let callbackURL: string | undefined;
  let errorCallbackURL: string | undefined;

  if (hasOidcParams) {
    const oidcAuthorizeParams = new URLSearchParams();
    if (redirect_uri) oidcAuthorizeParams.set("redirect_uri", redirect_uri);
    if (client_id) oidcAuthorizeParams.set("client_id", client_id);
    if (state) oidcAuthorizeParams.set("state", state);
    if (code_challenge)
      oidcAuthorizeParams.set("code_challenge", code_challenge);
    if (code_challenge_method)
      oidcAuthorizeParams.set("code_challenge_method", code_challenge_method);
    if (response_type) oidcAuthorizeParams.set("response_type", response_type);
    if (scope) oidcAuthorizeParams.set("scope", scope);
    if (returnTo && returnTo !== "/") {
      oidcAuthorizeParams.set("returnTo", returnTo);
    }

    const oidcAuthorizeUrl = `${baseURL}/api/auth/oauth2/authorize?${oidcAuthorizeParams.toString()}`;
    callbackURL = oidcAuthorizeUrl;

    const errorParams = new URLSearchParams(oidcAuthorizeParams);
    errorParams.set("error", "steam_auth_failed");
    errorCallbackURL = `${baseURL}/login?${errorParams.toString()}`;
  } else {
    const isDefaultReturn = returnTo === "/";
    const absoluteReturnTo = returnTo.startsWith("http")
      ? returnTo
      : `${baseURL}${returnTo.startsWith("/") ? "" : "/"}${returnTo}`;
    const encodedReturnTo = returnTo ? encodeURIComponent(returnTo) : undefined;

    callbackURL = !isDefaultReturn ? absoluteReturnTo : undefined;
    errorCallbackURL = `${baseURL}/login?returnTo=${encodedReturnTo}&error=steam_auth_failed`;
  }

  return (
    <AuthLayout subtitle='Sign in to your account'>
      <div className='mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]'>
        <Card>
          <CardContent className='pt-6'>
            <LoginPageContent
              callbackURL={callbackURL}
              steamErrorCallbackURL={errorCallbackURL}
              error={error}
            />
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
