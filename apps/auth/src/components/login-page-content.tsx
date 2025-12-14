import { Separator } from "@deadlock-mods/ui/components/separator";
import { useState } from "react";
import { LoginForm } from "./login-form";
import { SocialButtons } from "./social-buttons";
import { SteamLoginForm } from "./steam-login-form";

interface LoginPageContentProps {
  callbackURL?: string;
  error?: string;
  githubUrl: string;
  steamErrorCallbackURL?: string;
}

export function LoginPageContent({
  callbackURL,
  error,
  githubUrl,
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

  return (
    <>
      <LoginForm callbackURL={callbackURL} error={error} />

      <div className='my-6'>
        <Separator />
        <div className='relative -mt-3 text-center'>
          <span className='bg-card px-2 text-muted-foreground text-sm'>
            Or continue with
          </span>
        </div>
      </div>

      <SocialButtons
        githubUrl={githubUrl}
        onSteamClick={() => setShowSteamForm(true)}
      />
    </>
  );
}
