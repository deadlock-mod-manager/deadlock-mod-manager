import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { Check, Copy, Loader2 } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

interface DesktopCallbackStatusProps {
  code: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export function DesktopCallbackStatus({
  code,
  state,
  error,
  errorDescription,
}: DesktopCallbackStatusProps) {
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  const deepLinkUrl = useMemo(
    () =>
      state
        ? `deadlock-mod-manager://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        : `deadlock-mod-manager://auth/callback?code=${encodeURIComponent(code)}`,
    [state, code],
  );

  useEffect(() => {
    if (error) return;
    window.location.href = deepLinkUrl;
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [error, deepLinkUrl]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleRetryDeepLink = () => {
    window.location.href = deepLinkUrl;
    setShowFallback(false);
    setTimeout(() => {
      setShowFallback(true);
    }, 3000);
  };

  if (error) {
    return (
      <Card>
        <CardContent className='pt-6 space-y-4'>
          <Alert variant='destructive'>
            <AlertDescription>
              <strong>Authentication Failed</strong>
              <p className='mt-2'>{errorDescription || error}</p>
            </AlertDescription>
          </Alert>
          <Button asChild className='w-full'>
            <Link to='/login'>Try Again</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className='pt-6'>
        {!showFallback ? (
          <div className='text-center space-y-4'>
            <Loader2 className='mx-auto h-12 w-12 animate-spin text-primary' />
            <div>
              <h2 className='text-lg font-semibold'>Opening Desktop App...</h2>
              <p className='text-muted-foreground text-sm'>
                Please wait while we redirect you to the app.
              </p>
            </div>
          </div>
        ) : (
          <div className='space-y-4'>
            <Alert>
              <AlertDescription className='text-center'>
                Authentication successful!
              </AlertDescription>
            </Alert>

            <div>
              <h3 className='font-semibold mb-2'>App didn't open?</h3>
              <p className='text-muted-foreground text-sm mb-4'>
                If the desktop app didn't open automatically, you can copy the
                code below and paste it in the app.
              </p>

              <div className='relative'>
                <div className='bg-muted rounded-md p-4 font-mono text-sm break-all select-all'>
                  {code}
                </div>
                {copied && (
                  <div className='absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs'>
                    Copied!
                  </div>
                )}
              </div>

              <Button
                onClick={handleCopyCode}
                className='w-full mt-4'
                variant='outline'>
                {copied ? (
                  <>
                    <Check className='h-4 w-4' />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className='h-4 w-4' />
                    Copy Code
                  </>
                )}
              </Button>

              <div className='flex gap-2 mt-2'>
                <Button
                  onClick={handleRetryDeepLink}
                  variant='outline'
                  className='flex-1'>
                  Try Opening App Again
                </Button>
              </div>

              <div className='mt-4'>
                <ol className='text-muted-foreground text-sm list-decimal list-inside space-y-1'>
                  <li>Open the Deadlock Mod Manager desktop app</li>
                  <li>Click "Sign In" and then "Enter Code Manually"</li>
                  <li>Paste the code above and click "Submit"</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
