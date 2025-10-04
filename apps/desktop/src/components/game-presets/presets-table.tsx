import { Copy, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Preset } from "@/types/game-presets";

type PresetsTableProps = {
  presets: Preset[];
  activePresetId: string | null;
  onToggle: (preset: Preset) => void;
  onEdit: (preset: Preset) => void;
  onDuplicate: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
};

export const PresetsTable = ({
  presets,
  activePresetId,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: PresetsTableProps) => {
  const { t } = useTranslation();

  return (
    <div className='overflow-auto rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-20'>{t("gamePresets.enabled")}</TableHead>
            <TableHead>{t("gamePresets.name")}</TableHead>
            <TableHead>{t("gamePresets.optionsCount")}</TableHead>
            <TableHead>{t("gamePresets.description")}</TableHead>
            <TableHead className='text-right'>
              {t("gamePresets.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <TableRow key={preset.id}>
                <TableCell>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => onToggle(preset)}
                  />
                </TableCell>
                <TableCell className='font-medium'>{preset.name}</TableCell>
                <TableCell>
                  <Badge variant='secondary'>
                    {Object.keys(preset.values).length}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {preset.description || "—"}
                </TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-2'>
                    <Button
                      aria-label='Edit preset'
                      onClick={() => onEdit(preset)}
                      size='sm'
                      variant='secondary'>
                      <Pencil className='h-3 w-3' />
                    </Button>
                    <Button
                      aria-label='Duplicate preset'
                      onClick={() => onDuplicate(preset)}
                      size='sm'
                      variant='secondary'>
                      <Copy className='h-3 w-3' />
                    </Button>
                    <Button
                      aria-label='Delete preset'
                      disabled={isActive}
                      onClick={() => onDelete(preset)}
                      size='sm'
                      variant='destructive'>
                      <Trash2 className='h-3 w-3' />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
