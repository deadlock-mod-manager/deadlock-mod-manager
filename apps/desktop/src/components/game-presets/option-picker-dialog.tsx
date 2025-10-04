import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Option } from "@/types/game-presets";

type OptionPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allOptions: Option[];
  selectedOptionIds: string[];
  onAdd: (optionIds: string[]) => void;
};

export const OptionPickerDialog = ({
  open,
  onOpenChange,
  allOptions,
  selectedOptionIds,
  onAdd,
}: OptionPickerDialogProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>([]);

  const availableOptions = allOptions.filter(
    (opt) => !selectedOptionIds.includes(opt.id),
  );

  const filteredOptions = availableOptions.filter(
    (opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.varName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleToggle = (optionId: string) => {
    if (localSelected.includes(optionId)) {
      setLocalSelected(localSelected.filter((id) => id !== optionId));
    } else {
      setLocalSelected([...localSelected, optionId]);
    }
  };

  const handleAdd = () => {
    onAdd(localSelected);
    setLocalSelected([]);
    setSearchQuery("");
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setLocalSelected([]);
          setSearchQuery("");
        }
        onOpenChange(open);
      }}
      open={open}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t("gamePresets.addOption")}</DialogTitle>
          <DialogDescription>
            {t("gamePresets.optionPickerDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <Input
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("gamePresets.searchOptions")}
            value={searchQuery}
          />
          <div className='max-h-96 overflow-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-12' />
                  <TableHead>{t("gamePresets.label")}</TableHead>
                  <TableHead>{t("gamePresets.varName")}</TableHead>
                  <TableHead>{t("gamePresets.type")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOptions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className='text-center text-muted-foreground'
                      colSpan={4}>
                      {t("gamePresets.noOptionsAvailable")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOptions.map((option) => (
                    <TableRow
                      key={option.id}
                      className='cursor-pointer'
                      onClick={() => handleToggle(option.id)}>
                      <TableCell>
                        <input
                          checked={localSelected.includes(option.id)}
                          className='cursor-pointer'
                          onChange={() => handleToggle(option.id)}
                          type='checkbox'
                        />
                      </TableCell>
                      <TableCell>{option.label}</TableCell>
                      <TableCell className='font-mono text-sm'>
                        {option.varName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            option.valueType === "number"
                              ? "default"
                              : "secondary"
                          }>
                          {option.valueType}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='outline'>
            {t("common.cancel")}
          </Button>
          <Button disabled={localSelected.length === 0} onClick={handleAdd}>
            {t("gamePresets.addSelected")} ({localSelected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

