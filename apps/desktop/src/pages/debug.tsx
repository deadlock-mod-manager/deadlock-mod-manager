import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { TrashIcon } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { usePersistedStore } from "@/lib/store";

type DeepLinkDebugInfo = {
  debug_mode: boolean;
  target_os: string;
  registered_schemes: string[];
  registry_status: Record<string, string>;
};

const State = () => {
  const { localMods } = usePersistedStore();
  return (
    <pre className='h-[250px] w-full overflow-auto'>
      {JSON.stringify(localMods, null, 2)}
    </pre>
  );
};

const DeepLinkDebug = () => {
  const [info, setInfo] = useState<DeepLinkDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DeepLinkDebugInfo>(
        "get_deep_link_debug_info",
      );
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchInfo is stable and should only run on mount
  useEffect(() => {
    fetchInfo();
  }, []);

  if (loading) {
    return (
      <div className='text-muted-foreground'>Loading deep link info...</div>
    );
  }

  if (error) {
    return <div className='text-destructive'>Error: {error}</div>;
  }

  if (!info) {
    return null;
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <span className='font-medium'>Debug Mode:</span>
        <span
          className={info.debug_mode ? "text-yellow-500" : "text-green-500"}>
          {info.debug_mode ? "Yes" : "No"}
        </span>
      </div>
      <div className='flex items-center gap-2'>
        <span className='font-medium'>Target OS:</span>
        <span>{info.target_os}</span>
      </div>
      <div>
        <span className='font-medium'>Registry Status:</span>
        <div className='mt-1 space-y-1 pl-4'>
          {Object.entries(info.registry_status).map(([scheme, status]) => (
            <div key={scheme} className='flex items-center gap-2'>
              <code className='bg-muted px-1 rounded text-sm'>{scheme}://</code>
              <span
                className={
                  status === "REGISTERED" ? "text-green-500" : "text-red-500"
                }>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Button onClick={fetchInfo} size='sm' variant='outline' className='mt-2'>
        Refresh
      </Button>
    </div>
  );
};

const Debug = () => {
  const { t } = useTranslation();
  const { clearMods } = usePersistedStore();
  const confirm = useConfirm();

  const clearModsState = async () => {
    if (!(await confirm(t("debug.confirmClearModsState")))) {
      return;
    }
    clearMods();
    toast.success(t("debug.modsStateCleared"));
  };

  return (
    <div className='p-4 space-y-4'>
      <h1 className='text-2xl font-bold'>{t("debug.title")}</h1>

      <div className='space-y-2'>
        <h2 className='text-lg font-semibold'>Actions:</h2>
        <div className='flex gap-2'>
          <Button onClick={() => toast("Hello, world!")}>Toast</Button>
          <Button onClick={clearModsState} variant='destructive'>
            <TrashIcon className='h-4 w-4 mr-2' />
            {t("debug.clearModsState")}
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        <h2 className='text-lg font-semibold'>Deep Link Status:</h2>
        <DeepLinkDebug />
      </div>

      <div className='space-y-2'>
        <h2 className='text-lg font-semibold'>State:</h2>
        <State />
      </div>
    </div>
  );
};

export default Debug;
