import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ExternalLinkIcon,
  LoaderIcon,
  LogInIcon,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, oidcListenerManager } from "@/hooks/use-auth";
import { initiateOIDCLogin } from "@/lib/auth/oidc";

type AuthStep = "idle" | "redirecting" | "code-entry";

const FALLBACK_TIMEOUT_MS = 5000;

const AuthModal = () => {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<AuthStep>("idle");
  const [code, setCode] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
    setStep("idle");
    setCode("");
  };

  const exchangeCodeMutation = useMutation({
    mutationFn: (code: string) => oidcListenerManager.handleCodeExchange(code),
    meta: { skipGlobalErrorHandler: true },
  });

  useEffect(() => {
    if (isAuthenticated && isOpen) {
      handleClose();
    }
  }, [isAuthenticated, isOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (isAuthenticated) {
    return null;
  }

  const handleSignInClick = () => {
    setIsOpen(true);
    setStep("redirecting");

    initiateOIDCLogin();

    timeoutRef.current = setTimeout(() => {
      setStep("code-entry");
    }, FALLBACK_TIMEOUT_MS);
  };

  const handleCodeSubmit = () => {
    if (!code.trim()) {
      toast.error(t("auth.pleaseEnterCode"));
      return;
    }

    exchangeCodeMutation.mutate(code.trim());
  };

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        icon={<LogInIcon className='size-4' />}
        disabled={isLoading}
        onClick={handleSignInClick}>
        {t("auth.signIn")}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className='sm:max-w-[425px]'>
          {step === "redirecting" && (
            <>
              <DialogHeader>
                <DialogTitle>Signing In</DialogTitle>
                <DialogDescription>
                  Opening your browser to sign in...
                </DialogDescription>
              </DialogHeader>
              <div className='flex flex-col items-center gap-4 py-8'>
                <div className='flex items-center gap-3 text-muted-foreground'>
                  <LoaderIcon className='size-5 animate-spin' />
                  <span>Waiting for authentication...</span>
                </div>
                <p className='text-center text-sm text-muted-foreground'>
                  Complete the sign-in process in your browser. This dialog will
                  update automatically.
                </p>
              </div>
              <DialogFooter>
                <Button variant='outline' onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant='ghost'
                  onClick={() => setStep("code-entry")}
                  icon={<ExternalLinkIcon className='size-4' />}>
                  Enter Code Manually
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "code-entry" && (
            <>
              <DialogHeader>
                <DialogTitle>Enter Authentication Code</DialogTitle>
                <DialogDescription>
                  Copy the code shown in your browser after signing in and paste
                  it below.
                </DialogDescription>
              </DialogHeader>
              <div className='grid gap-4 py-4'>
                <div className='grid gap-2'>
                  <Label htmlFor='auth-code'>
                    {t("auth.authorizationCodeLabel")}
                  </Label>
                  <Input
                    id='auth-code'
                    placeholder={t("auth.pasteCodePlaceholder")}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCodeSubmit();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant='outline' onClick={handleClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleCodeSubmit}
                  disabled={exchangeCodeMutation.isPending}>
                  {exchangeCodeMutation.isPending
                    ? t("auth.signingIn")
                    : t("auth.signIn")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AuthModal;
