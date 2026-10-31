import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { useState } from "react";
import { SocialButtons } from "./social-buttons";
import { SteamLoginForm } from "./steam-login-form";

const ERROR_MESSAGES = new Map([
  [
    "email_in_use",
    "That email already belongs to another account. Sign in the way you did before, or use a different email.",
  ],
  ["invalid_email", "Enter a valid email address."],
  ["email_required", "Enter an email address to sign in with Steam."],
]);

const DEFAULT_ERROR_MESSAGE = "Sign-in failed. Please try again.";

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
          <AlertDescription>
            {ERROR_MESSAGES.get(error) ?? DEFAULT_ERROR_MESSAGE}
          </AlertDescription>
        </Alert>
      )}
      <SocialButtons
        callbackURL={callbackURL}
        onSteamClick={() => setShowSteamForm(true)}
      />
    </div>
  );
}
