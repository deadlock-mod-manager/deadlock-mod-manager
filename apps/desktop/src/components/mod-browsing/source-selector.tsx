import { Button } from "@deadlock-mods/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useNativeSources } from "@/lib/mod-sources";

interface SourceSelectorProps {
  value: string;
  onChange: (sourceKey: string) => void;
}

export const SourceSelector = ({ value, onChange }: SourceSelectorProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sources = useNativeSources();
  return (
    <div className='flex shrink-0 items-center gap-2'>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className='h-9 w-40'
          aria-label={t("modSources.selectSource")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='gamebanana'>GameBanana</SelectItem>
          {sources.data
            ?.filter((source) => !source.removed && source.enabled)
            .map((source) => (
              <SelectItem key={source.key} value={source.key}>
                {source.descriptor.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button
        size='sm'
        variant='link'
        onClick={() => navigate("/settings", { state: { activeTab: "mods" } })}>
        {t("modSources.manage")}
      </Button>
    </div>
  );
};
