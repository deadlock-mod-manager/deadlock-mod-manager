import type { ModDto } from "@deadlock-mods/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { AlertTriangle, ExternalLink, Flag } from "@deadlock-mods/ui/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useCreateReport } from "@/hooks/use-create-report";
import { useHardwareId } from "@/hooks/use-hardware-id";

const reportFormSchema = z.object({
  type: z.enum(["broken", "outdated", "malicious", "inappropriate", "other"]),
  reason: z
    .string()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must be less than 500 characters"),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .optional(),
});

type ReportFormData = z.infer<typeof reportFormSchema>;

interface ReportDialogProps {
  mod: Pick<ModDto, "id" | "name" | "author" | "remoteId">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReportDialog = ({
  mod,
  open,
  onOpenChange,
}: ReportDialogProps) => {
  const { t } = useTranslation();
  const { hardwareId } = useHardwareId();
  const { mutate: createReport, isPending } = useCreateReport();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      type: "broken",
      reason: "",
      description: "",
    },
  });

  const onSubmit = (data: ReportFormData) => {
    createReport(
      {
        modId: mod.id,
        type: data.type,
        reason: data.reason,
        description: data.description || undefined,
        reporterHardwareId: hardwareId || undefined,
      },
      {
        onSuccess: (response) => {
          if (response.status === "success") {
            setIsSubmitted(true);
            toast.success(t("reports.reportSubmitted"));
            form.reset();
          } else {
            toast.error(response.error || t("reports.reportFailed"));
          }
        },
        onError: () => {
          toast.error(t("reports.reportFailed"));
        },
      },
    );
  };

  const handleClose = () => {
    if (!isPending) {
      setIsSubmitted(false);
      form.reset();
      onOpenChange(false);
    }
  };

  const handleOpenGameBananaIssues = async () => {
    if (!mod.remoteId) return;
    try {
      await openExternal(`https://gamebanana.com/mods/issues/${mod.remoteId}`);
    } catch (error) {
      toast.error(t("notifications.failedToOpenForumPost"));
    }
  };

  const reportTypes = [
    { value: "broken", label: t("reports.types.broken") },
    { value: "outdated", label: t("reports.types.outdated") },
    { value: "malicious", label: t("reports.types.malicious") },
    { value: "inappropriate", label: t("reports.types.inappropriate") },
    { value: "other", label: t("reports.types.other") },
  ];

  if (isSubmitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t("reports.thankYou")}</DialogTitle>
            <DialogDescription>
              {t("reports.submissionConfirmation")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t("reports.reportMod")}</DialogTitle>
          <DialogDescription>
            {t("reports.reportDescription", {
              modName: mod.name,
              author: mod.author,
            })}
          </DialogDescription>
        </DialogHeader>

        {mod.remoteId && (
          <Alert variant='warning' className='mb-4'>
            <AlertTriangle className='h-4 w-4' />
            <div className='flex-1 space-y-2'>
              <AlertTitle className='font-semibold leading-5'>
                {t("reports.gameBananaDisclaimer")}
              </AlertTitle>
              <AlertDescription className='text-sm'>
                {t("reports.gameBananaFallback")}
              </AlertDescription>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                icon={<ExternalLink className='h-4 w-4' />}
                onClick={handleOpenGameBananaIssues}
                className='mt-2'>
                {t("reports.openGameBananaIssues")}
              </Button>
            </div>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reports.type")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("reports.selectType")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {reportTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='reason'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reports.reason")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("reports.reasonPlaceholder")}
                      className='min-h-[80px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("reports.reasonDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("reports.additionalDetails")} ({t("common.optional")})
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("reports.detailsPlaceholder")}
                      className='min-h-[100px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("reports.detailsDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type='button' variant='outline' onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button
                type='submit'
                disabled={isPending}
                isLoading={isPending}
                icon={<Flag className='h-4 w-4' />}>
                {isPending
                  ? t("reports.submitting")
                  : t("reports.submitReport")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
