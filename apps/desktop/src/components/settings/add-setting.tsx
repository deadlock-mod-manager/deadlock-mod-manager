import {
  CustomSettingType,
  customSettingTypeHuman,
} from "@deadlock-mods/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersistedStore } from "@/lib/store";
import {
  type CreateSettingSchema,
  createSettingSchema,
} from "@/lib/validation/create-setting";

const AddSettingDialog = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { createSetting } = usePersistedStore();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateSettingSchema>({
    resolver: zodResolver(createSettingSchema),
    defaultValues: {
      key: "",
      value: "",
      type: CustomSettingType.LAUNCH_OPTION,
      description: "",
    },
  });

  const onSubmit = (values: CreateSettingSchema) => {
    createSetting(values);
    toast.success(t("settings.settingCreated"));
    setOpen(false);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {children}
      </DialogTrigger>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{t("settings.createCustomSetting")}</DialogTitle>
          <DialogDescription>
            {t("settings.createCustomSettingDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className='space-y-4' onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name='key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.key")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("settings.keyPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.keyDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='value'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.value")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("settings.valuePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.settingType")}</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("settings.selectType")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(CustomSettingType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {customSettingTypeHuman[type].title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.description")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("settings.description")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type='submit'>
                <PlusCircle />
                {t("settings.addSetting")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSettingDialog;
