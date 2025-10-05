import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/auth/desktop-callback")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const handleDesktopCallback = async () => {
      try {
        const session = await authClient.getSession();

        if (!session.data) {
          setStatus("error");
          setErrorMessage(
            "No active session found. Please try logging in again.",
          );
          return;
        }

        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL || "http://localhost:9000"}/auth/desktop/session`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to get session token");
        }

        const data = (await response.json()) as { token: string };

        const deepLink = `deadlock-mod-manager://auth-callback?token=${encodeURIComponent(data.token)}`;

        window.location.href = deepLink;

        setStatus("success");

        setTimeout(() => {
          navigate({ to: "/" });
        }, 3000);
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        );
      }
    };

    handleDesktopCallback();
  }, [navigate]);

  if (status === "loading") {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center'>
        <Loader />
        <p className='mt-4 text-lg'>Completing authentication...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center'>
        <div className='max-w-md rounded-lg border border-destructive bg-destructive/10 p-6'>
          <h2 className='mb-2 text-xl font-semibold text-destructive'>
            Authentication Failed
          </h2>
          <p className='text-sm text-muted-foreground'>{errorMessage}</p>
          <button
            type='button'
            onClick={() => navigate({ to: "/login" })}
            className='mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen flex-col items-center justify-center'>
      <div className='max-w-md rounded-lg border border-primary bg-primary/10 p-6'>
        <h2 className='mb-2 text-xl font-semibold text-primary'>Success!</h2>
        <p className='text-sm text-muted-foreground'>
          You have been authenticated. Returning to the desktop app...
        </p>
        <p className='mt-4 text-xs text-muted-foreground'>
          If the app doesn't open automatically, you can close this window.
        </p>
      </div>
    </div>
  );
}
