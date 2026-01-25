import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { useState } from "react";
import { LoginForm } from "./login-form";
import { SocialButtons } from "./social-buttons";
import { SteamLoginForm } from "./steam-login-form";

interface LoginPageContentProps {
  callbackURL?: string;
  steamErrorCallbackURL?: string;
  error?: string;
}

type LoginMode = "chooser" | "steam" | "devEmail";

export function LoginPageContent({
  callbackURL,
  steamErrorCallbackURL,
  error,
}: LoginPageContentProps) {
  const devFlagFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("dev") === "1"
      : false;
  const devLoginEnabled =
    import.meta.env.DEV ||
    import.meta.env.VITE_ENABLE_DEV_LOGIN === "true" ||
    devFlagFromQuery;
  const [mode, setMode] = useState<LoginMode>("chooser");

  if (mode === "steam") {
    return (
      <SteamLoginForm
        callbackURL={callbackURL}
        errorCallbackURL={steamErrorCallbackURL}
        onBack={() => setMode("chooser")}
      />
    );
  }

  if (mode === "devEmail" && devLoginEnabled) {
    return (
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => setMode("chooser")}>
            Back
          </Button>
        </div>
        <LoginForm callbackURL={callbackURL} error={error} />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <SocialButtons
        onSteamClick={() => setMode("steam")}
        showDevButton={devLoginEnabled}
        onDevClick={devLoginEnabled ? () => setMode("devEmail") : undefined}
      />
    </div>
  );
}
