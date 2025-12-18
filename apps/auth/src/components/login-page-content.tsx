import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { useState } from "react";
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
      <SocialButtons onSteamClick={() => setShowSteamForm(true)} />
    </div>
  );
}
