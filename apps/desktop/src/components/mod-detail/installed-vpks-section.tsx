import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { HardDrive } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface InstalledVpksSectionProps {
  vpks: string[];
}

export const InstalledVpksSection = ({ vpks }: InstalledVpksSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <HardDrive className='h-4 w-4' />
          {t("modDetail.activeVpkFiles")}
        </CardTitle>
        <CardDescription>
          {t("modDetail.activeVpkFilesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-wrap gap-2'>
          {vpks.map((vpk) => (
            <div
              key={vpk}
              className='rounded-md bg-muted/30 px-3 py-1.5 font-mono text-sm'>
              {vpk}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
