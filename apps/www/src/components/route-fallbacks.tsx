import { Button } from "@deadlock-mods/ui/components/button";
import * as Sentry from "@sentry/tanstackstart-react";
import {
  type ErrorComponentProps,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { GITHUB_REPO } from "@/lib/constants";

const CHUNK_RELOAD_KEY = "dmm:chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/**
 * A deploy replaces the hashed JS chunks, so a tab (or a crawler) holding the
 * previous HTML can no longer load the code for the next route.
 */
const isChunkLoadError = (error: Error) =>
  /dynamically imported module|importing a module script failed|unable to preload css|loading (css )?chunk .* failed|is not a valid javascript mime type/i.test(
    error.message,
  );

/** Reloads once to pick up the current build; returns false if it already tried. */
const reloadForNewBuild = () => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable (privacy modes, some crawlers); reload anyway.
  }
  window.location.reload();
  return true;
};

export function RouteErrorComponent({
  error: thrown,
  reset,
}: ErrorComponentProps) {
  const router = useRouter();
  const error = thrown instanceof Error ? thrown : new Error(String(thrown));
  const staleBuild = isChunkLoadError(error);

  useEffect(() => {
    if (staleBuild && reloadForNewBuild()) return;
    Sentry.captureException(thrown);
  }, [thrown, staleBuild]);

  const retry = () => {
    reset();
    router.invalidate();
  };

  return (
    <section className='mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-24 text-center'>
      <h1 className='font-bold font-primary text-3xl'>
        This page didn't load properly
      </h1>
      <p className='mt-4 text-muted-foreground'>
        {staleBuild
          ? "The site was just updated. Reload to get the latest version."
          : "Something on our side failed while loading this page. Try again, or head back home."}
      </p>
      {import.meta.env.DEV && (
        <pre className='mt-6 max-w-full overflow-auto rounded-md border bg-card p-4 text-left text-destructive text-xs'>
          {error.message}
        </pre>
      )}
      <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
        <Button
          onClick={staleBuild ? () => window.location.reload() : retry}
          size='lg'>
          {staleBuild ? "Reload" : "Try again"}
        </Button>
        <Button asChild size='lg' variant='ghost'>
          <Link to='/'>Go home</Link>
        </Button>
      </div>
      <p className='mt-8 text-muted-foreground text-sm'>
        Still broken?{" "}
        <a
          className='text-primary underline underline-offset-4'
          href={`${GITHUB_REPO}/issues`}
          rel='noopener noreferrer'
          target='_blank'>
          Let us know on GitHub
        </a>
        .
      </p>
    </section>
  );
}

export function NotFoundComponent() {
  return (
    <section className='mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-24 text-center'>
      <p className='font-bold font-primary text-6xl text-primary'>404</p>
      <h1 className='mt-4 font-bold font-primary text-3xl'>Page not found</h1>
      <p className='mt-4 text-muted-foreground'>
        This page doesn't exist or has moved.
      </p>
      <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
        <Button asChild size='lg'>
          <Link to='/'>Go home</Link>
        </Button>
        <Button asChild size='lg' variant='ghost'>
          <Link to='/download'>Download the app</Link>
        </Button>
      </div>
    </section>
  );
}
