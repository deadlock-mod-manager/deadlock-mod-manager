import Logo from '@/components/logo';
import useAbout from '@/hooks/use-about';
import { APP_NAME, GITHUB_REPO } from '@/lib/constants';
import { Loader2 } from 'lucide-react';

const Splash = () => {
  const { data, isLoading } = useAbout();
  const { version, tauriVersion } = data || {};
  return (
    <div className="flex h-screen w-screen items-center justify-center flex-col gap-4">
      <Logo className="h-32 w-32" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold font-primary">{APP_NAME}</h1>
        {data && (
          <>
            <span className="flex gap-1 font-mono font-medium">
              Version {version}
              <span className="font-sans font-medium text-gray-400">
                (
                <span
                  className="cursor-pointer text-primary"
                  onClick={() => open(`${GITHUB_REPO}/releases/tag/v${version}`)}
                >
                  release notes
                </span>
                )
              </span>
            </span>
            <span className="font-mono text-xs font-medium text-gray-400">Tauri version: {tauriVersion}</span>
          </>
        )}
      </div>
      {isLoading && <Loader2 className="h-8 w-8 animate-spin" />}
    </div>
  );
};

export default Splash;
