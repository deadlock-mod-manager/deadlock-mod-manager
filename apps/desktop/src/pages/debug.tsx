import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { TrashIcon } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { usePersistedStore } from "@/lib/store";

const State = () => {
  const { localMods } = usePersistedStore();
  return (
    <pre className='h-[250px] w-full overflow-auto'>
      {JSON.stringify(localMods, null, 2)}
    </pre>
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
        <h2 className='text-lg font-semibold'>State:</h2>
        <State />
      </div>
    </div>
  );
};

export default Debug;
