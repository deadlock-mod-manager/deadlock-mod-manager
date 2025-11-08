import type { AnnouncementDto } from "@deadlock-mods/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { RichTextEditor } from "@deadlock-mods/ui/components/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/dashboard/page-header";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

const announcementFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content must be less than 10000 characters"),
  iconUrl: z
    .union([z.string().url("Icon URL must be a valid URL"), z.literal("")])
    .optional(),
  linkUrl: z
    .union([z.string().url("Link URL must be a valid URL"), z.literal("")])
    .optional(),
  linkLabel: z
    .string()
    .max(50, "Link label must be less than 50 characters")
    .optional()
    .or(z.literal("")),
  category: z.enum(["maintenance", "downtime", "info"]),
  status: z.enum(["draft", "published", "archived"]),
});

type AnnouncementFormData = z.infer<typeof announcementFormSchema>;

export const Route = createFileRoute("/dashboard/announcements")({
  component: DashboardAnnouncementsPage,
  head: () =>
    seo({
      title: "Announcements Management | Deadlock Mod Manager",
      noindex: true,
    }),
});

function DashboardAnnouncementsPage() {
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<AnnouncementDto | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] =
    useState<AnnouncementDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: announcements, refetch } = useQuery(
    orpc.listAllAnnouncements.queryOptions(),
  );

  const createMutation = useMutation(orpc.createAnnouncement.mutationOptions());
  const updateMutation = useMutation(orpc.updateAnnouncement.mutationOptions());
  const deleteMutation = useMutation(orpc.deleteAnnouncement.mutationOptions());
  const publishMutation = useMutation(
    orpc.publishAnnouncement.mutationOptions(),
  );
  const archiveMutation = useMutation(
    orpc.archiveAnnouncement.mutationOptions(),
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
    control,
  } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      content: "",
      iconUrl: "",
      linkUrl: "",
      linkLabel: "",
      category: "info",
      status: "draft",
    },
  });

  const status = watch("status");
  const category = watch("category");

  const openCreateDialog = () => {
    reset({
      title: "",
      content: "",
      iconUrl: "",
      linkUrl: "",
      linkLabel: "",
      category: "info",
      status: "draft",
    });
    setEditingAnnouncement(null);
    setDialogOpen(true);
  };

  const openEditDialog = (announcement: AnnouncementDto) => {
    reset({
      title: announcement.title,
      content: announcement.content,
      iconUrl: announcement.iconUrl || "",
      linkUrl: announcement.linkUrl || "",
      linkLabel: announcement.linkLabel || "",
      category: announcement.category,
      status: announcement.status,
    });
    setEditingAnnouncement(announcement);
    setDialogOpen(true);
  };

  const onSubmit = async (data: AnnouncementFormData) => {
    try {
      const submitData = {
        ...data,
        iconUrl:
          data.iconUrl === "" || data.iconUrl === null
            ? undefined
            : data.iconUrl,
        linkUrl:
          data.linkUrl === "" || data.linkUrl === null
            ? undefined
            : data.linkUrl,
        linkLabel:
          data.linkLabel === "" || data.linkLabel === null
            ? undefined
            : data.linkLabel,
      };
      if (editingAnnouncement) {
        await updateMutation.mutateAsync({
          id: editingAnnouncement.id,
          ...submitData,
        });
        toast.success("Announcement updated successfully");
      } else {
        await createMutation.mutateAsync(submitData);
        toast.success("Announcement created successfully");
      }
      setDialogOpen(false);
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save announcement",
      );
    }
  };

  const handleDelete = async () => {
    if (!announcementToDelete) return;

    try {
      await deleteMutation.mutateAsync({ id: announcementToDelete.id });
      toast.success("Announcement deleted successfully");
      setDeleteDialogOpen(false);
      setAnnouncementToDelete(null);
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete announcement",
      );
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishMutation.mutateAsync({ id });
      toast.success("Announcement published successfully");
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to publish announcement",
      );
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync({ id });
      toast.success("Announcement archived successfully");
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to archive announcement",
      );
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "published":
        return "default";
      case "draft":
        return "secondary";
      case "archived":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case "maintenance":
        return "default";
      case "downtime":
        return "destructive";
      case "info":
        return "secondary";
      default:
        return "secondary";
    }
  };

  return (
    <>
      <div className='flex items-center justify-between'>
        <PageHeader
          title='Announcements Management'
          description='Create and manage announcements for the mod manager homepage'
        />
        <Button onClick={openCreateDialog}>Create Announcement</Button>
      </div>
      <Card>
        <CardContent>
          {announcements && announcements.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              No announcements yet. Create your first one!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icon</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements?.map((announcement) => (
                  <TableRow key={announcement.id}>
                    <TableCell>
                      {announcement.iconUrl ? (
                        <img
                          alt={announcement.title}
                          className='h-8 w-8 rounded object-cover'
                          src={announcement.iconUrl}
                        />
                      ) : (
                        <div className='h-8 w-8 rounded bg-muted flex items-center justify-center'>
                          <PhosphorIcons.Megaphone
                            className='size-4'
                            weight='duotone'
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {announcement.title}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          getCategoryBadgeVariant(announcement.category) as
                            | "default"
                            | "secondary"
                            | "destructive"
                            | "outline"
                        }>
                        {announcement.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          getStatusBadgeVariant(announcement.status) as
                            | "default"
                            | "secondary"
                            | "outline"
                        }>
                        {announcement.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {announcement.createdAt
                        ? format(new Date(announcement.createdAt), "PPp")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {announcement.updatedAt
                        ? format(new Date(announcement.updatedAt), "PPp")
                        : "-"}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        {announcement.status === "draft" && (
                          <Button
                            onClick={() => handlePublish(announcement.id)}
                            size='sm'
                            variant='outline'>
                            Publish
                          </Button>
                        )}
                        {announcement.status === "published" && (
                          <Button
                            onClick={() => handleArchive(announcement.id)}
                            size='sm'
                            variant='outline'>
                            Archive
                          </Button>
                        )}
                        <Button
                          onClick={() => openEditDialog(announcement)}
                          size='sm'
                          variant='outline'>
                          Edit
                        </Button>
                        <Button
                          onClick={() => {
                            setAnnouncementToDelete(announcement);
                            setDeleteDialogOpen(true);
                          }}
                          size='sm'
                          variant='destructive'>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement
                ? "Edit Announcement"
                : "Create Announcement"}
            </DialogTitle>
            <DialogDescription>
              {editingAnnouncement
                ? "Update the announcement details below."
                : "Fill in the details to create a new announcement."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className='space-y-4 py-4'>
              <div className='space-y-2'>
                <Label htmlFor='title'>Title</Label>
                <Input
                  id='title'
                  {...register("title")}
                  placeholder='Enter announcement title'
                />
                {errors.title && (
                  <p className='text-destructive text-sm'>
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='iconUrl'>Icon URL (optional)</Label>
                <Input
                  id='iconUrl'
                  {...register("iconUrl")}
                  placeholder='https://example.com/icon.png'
                  type='url'
                />
                {errors.iconUrl && (
                  <p className='text-destructive text-sm'>
                    {errors.iconUrl.message}
                  </p>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='linkUrl'>Link URL (optional)</Label>
                <Input
                  id='linkUrl'
                  {...register("linkUrl")}
                  placeholder='https://example.com'
                  type='url'
                />
                {errors.linkUrl && (
                  <p className='text-destructive text-sm'>
                    {errors.linkUrl.message}
                  </p>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='linkLabel'>Link Label (optional)</Label>
                <Input
                  id='linkLabel'
                  {...register("linkLabel")}
                  placeholder='Learn More'
                  maxLength={50}
                />
                {errors.linkLabel && (
                  <p className='text-destructive text-sm'>
                    {errors.linkLabel.message}
                  </p>
                )}
                <p className='text-muted-foreground text-xs'>
                  Text to display on the link button. If left empty, "Learn
                  More" will be used.
                </p>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='content'>Content</Label>
                <Controller
                  control={control}
                  name='content'
                  render={({ field }) => (
                    <RichTextEditor
                      content={field.value}
                      minHeight='200px'
                      onChange={field.onChange}
                      placeholder='Enter announcement content...'
                    />
                  )}
                />
                {errors.content && (
                  <p className='text-destructive text-sm'>
                    {errors.content.message}
                  </p>
                )}
                <p className='text-muted-foreground text-xs'>
                  Use the toolbar to format your text with bold, italic, lists,
                  headings, and more.
                </p>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='category'>Category</Label>
                <Select
                  onValueChange={(value) =>
                    setValue(
                      "category",
                      value as "maintenance" | "downtime" | "info",
                    )
                  }
                  value={category}>
                  <SelectTrigger id='category'>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='info'>Info</SelectItem>
                    <SelectItem value='maintenance'>Maintenance</SelectItem>
                    <SelectItem value='downtime'>Downtime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='status'>Status</Label>
                <Select
                  onValueChange={(value) =>
                    setValue(
                      "status",
                      value as "draft" | "published" | "archived",
                    )
                  }
                  value={status}>
                  <SelectTrigger id='status'>
                    <SelectValue placeholder='Select status' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='draft'>Draft</SelectItem>
                    <SelectItem value='published'>Published</SelectItem>
                    <SelectItem value='archived'>Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => setDialogOpen(false)}
                type='button'
                variant='outline'>
                Cancel
              </Button>
              <Button disabled={isSubmitting} type='submit'>
                {editingAnnouncement ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              announcement "{announcementToDelete?.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setAnnouncementToDelete(null);
              }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
