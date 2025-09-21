import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
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

const formSchema = z.object({
  profileId: z.string().min(1),
});

export type ProfileImportFormData = z.infer<typeof formSchema>;

interface ProfileImportFormProps {
  onSubmit: (values: ProfileImportFormData) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export const ProfileImportForm = ({
  onSubmit,
  onCancel,
  isLoading,
}: ProfileImportFormProps) => {
  const { t } = useTranslation();
  const form = useForm<ProfileImportFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      profileId: "",
    },
  });

  const profileId = form.watch("profileId");

  return (
    <>
      <Form {...form}>
        <form
          id='profile-import-form'
          onSubmit={form.handleSubmit(onSubmit)}
          className='space-y-4'>
          <FormField
            control={form.control}
            name='profileId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("profiles.profileId")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("profiles.profileIdPlaceholder")}
                    maxLength={50}
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("profiles.importDescription")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      <DialogFooter>
        <Button variant='outline' onClick={onCancel} disabled={isLoading}>
          {t("common.cancel")}
        </Button>
        <Button
          type='submit'
          form='profile-import-form'
          disabled={!profileId?.trim() || isLoading}>
          {isLoading ? t("profiles.importing") : t("profiles.import")}
        </Button>
      </DialogFooter>
    </>
  );
};
