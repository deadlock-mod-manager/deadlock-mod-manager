import { useState } from "react";
import { SocialButtons } from "./social-buttons";
import { SteamLoginForm } from "./steam-login-form";

interface LoginPageContentProps {
  callbackURL?: string;
  steamErrorCallbackURL?: string;
}

export function LoginPageContent({
  callbackURL,
  steamErrorCallbackURL,
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

  return <SocialButtons onSteamClick={() => setShowSteamForm(true)} />;
}
