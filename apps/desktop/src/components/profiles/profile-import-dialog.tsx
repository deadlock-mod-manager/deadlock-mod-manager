import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImportIcon, Package, Save, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries } from "react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getMod, getProfile } from "@/lib/api";

const formSchema = z.object({
  profileId: z.string().min(1),
});

const ProfileModCard = ({ mod }: { mod: ModDto }) => {
  return (
    <div className='flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors'>
      <div className='relative h-12 w-12 overflow-hidden rounded-lg border border-primary/20 flex-shrink-0'>
        {mod.images && mod.images.length > 0 ? (
          <img
            alt={`${mod.name} preview`}
            className='h-full w-full object-cover'
            src={mod.images[0]}
          />
        ) : (
          <div className='h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5'>
            <Package className='h-4 w-4 text-primary' />
          </div>
        )}
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-foreground truncate'>
          {mod.name}
        </p>
        <p className='text-xs text-muted-foreground truncate'>
          by {mod.author}
        </p>
      </div>
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        <Badge variant='outline' className='text-xs'>
          {mod.category}
        </Badge>
      </div>
    </div>
  );
};

const ModCardSkeleton = () => {
  return (
    <div className='flex items-center gap-3 p-3 rounded-lg border bg-card'>
      <Skeleton className='h-12 w-12 rounded-lg' />
      <div className='flex-1 space-y-1'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-3 w-24' />
      </div>
      <Skeleton className='h-5 w-16 rounded-full' />
    </div>
  );
};

const ImportForm = ({
  form,
  onSubmit,
  isLoading,
  profileId,
  onCancel,
}: {
  form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  isLoading: boolean;
  profileId: string;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();

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

const FallbackModCard = ({ mod }: { mod: { remoteId: string } }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-3 p-3 rounded-lg border bg-card'>
      <div className='h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0'>
        <Package className='h-4 w-4 text-muted-foreground' />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-foreground truncate'>
          {mod.remoteId}
        </p>
        <p className='text-xs text-muted-foreground'>
          {t("profiles.modNotFound")}
        </p>
      </div>
      <Badge variant='outline' className='text-xs'>
        Unknown
      </Badge>
    </div>
  );
};

const ModsList = ({
  importedProfile,
  modsLoading,
  modsData,
}: {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
}) => {
  const { t } = useTranslation();

  if (importedProfile.payload.mods.length === 0) {
    return (
      <p className='text-sm text-muted-foreground text-center py-4'>
        {t("profiles.noModsIncluded")}
      </p>
    );
  }

  const failedMods = importedProfile.payload.mods.filter(
    (profileMod) =>
      !modsData.some((mod) => mod.remoteId === profileMod.remoteId),
  );

  return (
    <>
      {modsLoading
        ? importedProfile.payload.mods.map((mod) => (
            <ModCardSkeleton key={mod.remoteId} />
          ))
        : modsData.map((mod) => (
            <ProfileModCard key={mod.remoteId} mod={mod} />
          ))}

      {!modsLoading &&
        failedMods.length > 0 &&
        failedMods.map((mod) => (
          <FallbackModCard key={mod.remoteId} mod={mod} />
        ))}
    </>
  );
};

const ImportOptions = ({
  onCreateNew,
  onOverride,
}: {
  onCreateNew: () => void;
  onOverride: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <p className='text-sm text-muted-foreground mb-3'>
        {t("profiles.importOptionsDescription")}
      </p>
      <div className='flex flex-col gap-2'>
        <Button
          onClick={onCreateNew}
          className='justify-start'
          variant='outline'>
          <UserPlus className='h-4 w-4 mr-2' />
          {t("profiles.createNewProfile")}
        </Button>
        <Button
          onClick={onOverride}
          className='justify-start'
          variant='outline'>
          <Save className='h-4 w-4 mr-2' />
          {t("profiles.overrideExisting")}
        </Button>
      </div>
    </div>
  );
};

const ProfilePreview = ({
  importedProfile,
  modsLoading,
  modsData,
  onCreateNew,
  onOverride,
  onCancel,
}: {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
  onCreateNew: () => void;
  onOverride: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <Package className='h-5 w-5' />
              <CardTitle>Imported Profile</CardTitle>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <h4 className='text-sm font-medium mb-3'>
                {t("profiles.includedMods")} (
                {importedProfile.payload.mods.length})
              </h4>
              <div className='space-y-2 max-h-64 overflow-y-auto'>
                <ModsList
                  importedProfile={importedProfile}
                  modsLoading={modsLoading}
                  modsData={modsData}
                />
              </div>
            </div>

            <Separator />

            <ImportOptions onCreateNew={onCreateNew} onOverride={onOverride} />
          </CardContent>
        </Card>
      </div>

      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
};

export const ProfileImportDialog = () => {
  const [open, setOpen] = useState(false);
  const [importedProfile, setImportedProfile] = useState<SharedProfile | null>(
    null,
  );
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      profileId: "",
    },
  });

  const profileId = form.watch("profileId");

  const { isLoading, mutate } = useMutation(
    () => getProfile(profileId.trim()),
    {
      mutationKey: ["profile", profileId.trim()],
      onSuccess: (data) => {
        setImportedProfile(data);
        toast.success(t("profiles.importSuccess"));
      },
      onError: () => {
        toast.error(t("profiles.importError"));
        setImportedProfile(null);
      },
    },
  );

  // Fetch mod details for each mod in the imported profile
  const modQueries = useQueries(
    importedProfile?.payload.mods.map((mod) => ({
      queryKey: ["mod", mod.remoteId],
      queryFn: () => getMod(mod.remoteId),
      enabled: !!importedProfile,
    })) || [],
  );

  const modsLoading = modQueries.some((query) => query.isLoading);
  const modsData = modQueries
    .map((query) => query.data)
    .filter(Boolean) as ModDto[];

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!values.profileId?.trim()) {
      toast.error(t("profiles.profileIdRequired"));
      return;
    }
    return mutate();
  };

  const handleCancel = () => {
    form.reset();
    setImportedProfile(null);
    setOpen(false);
  };

  const handleCreateNewProfile = () => {
    // TODO: Implement create new profile logic
    toast.success(t("profiles.createSuccess"));
    handleCancel();
  };

  const handleOverrideProfile = () => {
    // TODO: Implement override existing profile logic
    toast.success(t("profiles.overrideSuccess"));
    handleCancel();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant='outline' icon={<ImportIcon />}>
          {t("profiles.import")}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[600px]'>
        <DialogHeader>
          <DialogTitle>
            {importedProfile
              ? t("profiles.importPreview")
              : t("profiles.import")}
          </DialogTitle>
          <DialogDescription>
            {importedProfile
              ? t("profiles.importPreviewDescription")
              : t("profiles.importDescription")}
          </DialogDescription>
        </DialogHeader>

        {importedProfile ? (
          <ProfilePreview
            importedProfile={importedProfile}
            modsLoading={modsLoading}
            modsData={modsData}
            onCreateNew={handleCreateNewProfile}
            onOverride={handleOverrideProfile}
            onCancel={handleCancel}
          />
        ) : (
          <ImportForm
            form={form}
            onSubmit={onSubmit}
            isLoading={isLoading}
            profileId={profileId}
            onCancel={handleCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
