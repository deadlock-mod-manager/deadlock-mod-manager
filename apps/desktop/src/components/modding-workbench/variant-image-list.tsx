import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { ModdingImageInput } from "@/types/generated/ModdingImageInput";
export const VariantImageList = ({
  directory,
  excluded,
  disabled,
  onExclude,
}: {
  directory: string;
  excluded: string[];
  disabled: boolean;
  onExclude: (path: string, excluded: boolean) => void;
}) => {
  const { t } = useTranslation();
  const inputs = useQuery({
    queryKey: ["workbench-variant-inputs", directory],
    queryFn: () =>
      invoke<ModdingImageInput[]>("list_modding_variant_inputs", { directory }),
  });
  return (
    <div className='max-h-56 overflow-auto pl-6'>
      {inputs.error ? (
        <p role='alert' className='text-xs text-destructive'>
          {inputs.error.message}
        </p>
      ) : inputs.isPending ? (
        <p className='text-xs'>{t("common.loading")}</p>
      ) : (
        inputs.data.map((input) => (
          <label key={input.path} className='flex gap-2 py-1 font-mono text-xs'>
            <input
              type='checkbox'
              disabled={disabled}
              checked={!excluded.includes(input.path)}
              onChange={(event) => onExclude(input.path, !event.target.checked)}
            />
            {input.path}
          </label>
        ))
      )}
    </div>
  );
};
