import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Option } from "@/types/game-presets";

type OptionsTableProps = {
  options: Option[];
  onEdit: (option: Option) => void;
  onDelete: (option: Option) => void;
};

export const OptionsTable = ({
  options,
  onEdit,
  onDelete,
}: OptionsTableProps) => {
  const { t } = useTranslation();

  return (
    <div className='max-h-[600px] overflow-auto rounded-md border'>
      <Table>
        <TableHeader className='sticky top-0 bg-background'>
          <TableRow>
            <TableHead>{t("gamePresets.varName")}</TableHead>
            <TableHead>{t("gamePresets.label")}</TableHead>
            <TableHead>{t("gamePresets.type")}</TableHead>
            <TableHead>{t("gamePresets.constraints")}</TableHead>
            <TableHead className='text-right'>
              {t("gamePresets.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => (
            <TableRow key={option.id}>
              <TableCell className='font-mono text-sm'>
                {option.varName}
              </TableCell>
              <TableCell>{option.label}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    option.valueType === "number" ? "default" : "secondary"
                  }>
                  {option.valueType}
                </Badge>
              </TableCell>
              <TableCell className='text-muted-foreground text-sm'>
                {option.valueType === "number"
                  ? `${option.min} - ${option.max}`
                  : option.stringAllowed?.join(", ")}
              </TableCell>
              <TableCell className='text-right'>
                <div className='flex justify-end gap-2'>
                  <Button
                    aria-label='Edit option'
                    onClick={() => onEdit(option)}
                    size='sm'
                    variant='secondary'>
                    <Pencil className='h-3 w-3' />
                  </Button>
                  <Button
                    aria-label='Delete option'
                    onClick={() => onDelete(option)}
                    size='sm'
                    variant='destructive'>
                    <Trash2 className='h-3 w-3' />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
