import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { SocialButtons } from "./social-buttons";
import { SteamLoginForm } from "./steam-login-form";

interface LoginPageContentProps {
  callbackURL?: string;
  steamErrorCallbackURL?: string;
  error?: string;
}

export function LoginPageContent({
  callbackURL,
  steamErrorCallbackURL,
  error,
}: LoginPageContentProps) {
  const [showSteamForm, setShowSteamForm] = useState(false);
  const [discordError, setDiscordError] = useState<string>();

  const handleDiscordClick = async () => {
    setDiscordError(undefined);
    await authClient.signIn.social({
      provider: "discord",
      callbackURL,
      fetchOptions: {
        onError(ctx) {
          setDiscordError(ctx.error.message);
        },
      },
    });
  };

  if (showSteamForm) {
    return (
      <SteamLoginForm
        callbackURL={callbackURL}
        errorCallbackURL={steamErrorCallbackURL}
        onBack={() => setShowSteamForm(false)}
      />
    );
  }

  return (
    <div className='space-y-4'>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {discordError && (
        <Alert variant='destructive'>
          <AlertDescription>{discordError}</AlertDescription>
        </Alert>
      )}
      <SocialButtons
        onSteamClick={() => setShowSteamForm(true)}
        onDiscordClick={handleDiscordClick}
      />
    </div>
  );
}
