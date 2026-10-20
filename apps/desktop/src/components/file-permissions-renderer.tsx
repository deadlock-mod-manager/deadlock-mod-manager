import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import { LockOpenIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { makeFileWritable, setWritablePrompt } from "@/lib/file-permissions";

type Request = { path: string; resolve: (repaired: boolean) => void };

export const FilePermissionsRenderer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const finish = (repaired: boolean) => {
    pending.current?.resolve(repaired);
    pending.current = null;
    setRequest(null);
  };
  const repair = useMutation({
    mutationFn: makeFileWritable,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filesystem-writable"] });
      finish(true);
    },
    meta: { skipGlobalErrorHandler: true },
    retry: false,
  });
  const { reset } = repair;

  useEffect(() => {
    setWritablePrompt((path) => {
      if (pending.current) return Promise.resolve(false);
      reset();
      return new Promise<boolean>((resolve) => {
        const next = { path, resolve };
        pending.current = next;
        setRequest(next);
      });
    });
    return () => {
      setWritablePrompt(null);
      pending.current?.resolve(false);
    };
  }, [reset]);

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !repair.isPending) finish(false);
      }}>
      <AlertDialogContent
        data-testid='readonly-file-dialog'
        onEscapeKeyDown={(event) => {
          if (repair.isPending) event.preventDefault();
        }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("filePermissions.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("filePermissions.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p
          className='break-all font-mono text-sm'
          data-testid='readonly-file-path'>
          {request?.path}
        </p>
        {repair.isError && (
          <p className='break-words text-sm text-destructive' role='alert'>
            {getErrorMessage(repair.error)}
          </p>
        )}
        <AlertDialogFooter>
          <Button
            variant='outline'
            disabled={repair.isPending}
            onClick={() => finish(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            data-testid='make-file-writable'
            icon={<LockOpenIcon className='h-4 w-4' />}
            disabled={repair.isPending || repair.isError}
            onClick={() => {
              if (request) repair.mutate(request.path);
            }}>
            {t("filePermissions.makeWritable")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
