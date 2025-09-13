import { Loader2 } from 'lucide-react';
import Logo from '@/components/layout/logo';
import useAbout from '@/hooks/use-about';
import { APP_NAME, GITHUB_REPO } from '@/lib/constants';

const Splash = () => {
  const { data, isLoading } = useAbout();
  const { version, tauriVersion } = data || {};

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Logo className="h-32 w-32" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-bold font-primary text-3xl">{APP_NAME}</h1>
        {data && (
          <>
            <span className="flex gap-1 font-medium font-mono">
              Version {version}
              <span className="font-medium font-sans text-gray-400">
                (
                <span
                  className="cursor-pointer text-primary"
                  onClick={() =>
                    open(`${GITHUB_REPO}/releases/tag/v${version}`)
                  }
                >
                  release notes
                </span>
                )
              </span>
            </span>
            <span className="font-medium font-mono text-gray-400 text-xs">
              Tauri version: {tauriVersion}
            </span>
          </>
        )}
      </div>
      {isLoading && <Loader2 className="h-8 w-8 animate-spin" />}
    </div>
  );
};

export default Splash;
