import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { generateFallbackModSVG } from "@/lib/file-patterns";

export type ModMetadata = {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
  imageSrc?: string;
};

export type ModMetadataFormProps = {
  initial?: Partial<ModMetadata>;
  title?: string;
  description?: string;
  hideCardChrome?: boolean;
};

export type ModMetadataFormHandle = {
  validateAndGet: () => Promise<ModMetadata | null>;
  reset: () => void;
};

const DEFAULT_IMAGE = "/assets/mod-placeholder.png";

const generateFallbackSVG = (): string => {
  const rawSvg = generateFallbackModSVG();
  return `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
};

// Define regex patterns at top level for performance
const IMAGE_FILE_EXTENSION_REGEX = /\.(jpe?g|png|webp|gif|svg)$/i;
const IMAGE_MIME_TYPE_REGEX = /^image\//;

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  author: z
    .string()
    .max(128, "Too long")
    .optional()
    .or(z.literal("").optional()),
  description: z
    .string()
    .max(4000, "Too long")
    .optional()
    .or(z.literal("").optional()),
  link: z
    .string()
    .url("Invalid URL")
    .refine((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only HTTP and HTTPS URLs are allowed")
    .optional()
    .or(z.literal("").optional()),
  imageFile: z
    .instanceof(File)
    .refine((file) => {
      // Validate file type
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/svg+xml",
      ];
      return (
        allowedTypes.includes(file.type) ||
        IMAGE_FILE_EXTENSION_REGEX.test(file.name)
      );
    }, "File must be a valid image (JPEG, PNG, WebP, GIF, or SVG)")
    .refine((file) => {
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      return file.size <= maxSize;
    }, "File size must be less than 10MB")
    .optional(),
});

type FormValues = z.infer<typeof schema>;

const Inner = React.forwardRef<ModMetadataFormHandle, ModMetadataFormProps>(
  function ModMetadataForm(
    { initial, title, description, hideCardChrome = false },
    ref,
  ) {
    const { t } = useTranslation();

    const actualTitle = title || t("modForm.title");
    const actualDescription = description || t("modForm.description");

    const [preview, setPreview] = useState<string | undefined>(undefined);
    const [imgOk, setImgOk] = useState(true);
    const fileRef = useRef<HTMLInputElement>(null);

    const form = useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        name: initial?.name ?? "",
        author: initial?.author ?? t("modForm.unknownAuthor"),
        description: initial?.description ?? "",
        link: initial?.link ?? "",
        imageFile: initial?.imageFile ?? undefined,
      },
    });

    const resolvedDefault = useMemo(() => DEFAULT_IMAGE, []);
    useEffect(() => {
      const sub = form.watch((_, { name }) => {
        if (name === "imageFile") {
          const f = form.getValues("imageFile") as File | null | undefined;
          if (f instanceof File) {
            const url = URL.createObjectURL(f);
            setPreview(url);
            setImgOk(true);
            return () => URL.revokeObjectURL(url);
          }
          if (initial?.imageSrc) {
            setPreview(initial.imageSrc);
            setImgOk(true);
          } else {
            setPreview(resolvedDefault);
            setImgOk(true);
          }
        }
      });
      const initF = form.getValues("imageFile") as File | null | undefined;
      if (initF instanceof File) {
        const url = URL.createObjectURL(initF);
        setPreview(url);
        setImgOk(true);
        return () => URL.revokeObjectURL(url);
      }
      if (initial?.imageSrc) {
        setPreview(initial.imageSrc);
      } else {
        setPreview(resolvedDefault);
      }
      return () => sub.unsubscribe();
    }, [form, initial?.imageSrc, resolvedDefault]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        form.setValue("imageFile", undefined);
        setPreview(resolvedDefault);
        setImgOk(true);
        return;
      }
      const ok =
        IMAGE_MIME_TYPE_REGEX.test(file.type) ||
        IMAGE_FILE_EXTENSION_REGEX.test(file.name);
      if (!ok) {
        toast.error(t("addMods.unsupportedImageType"));
        e.currentTarget.value = "";
        return;
      }
      form.setValue("imageFile", file, { shouldValidate: true });
    };

    const clearImage = useCallback(() => {
      form.setValue("imageFile", undefined, { shouldValidate: true });
      setPreview(resolvedDefault);
      setImgOk(true);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }, [form, resolvedDefault]);

    useImperativeHandle(
      ref,
      () => ({
        validateAndGet: async () => {
          const valid = await form.trigger();
          if (!valid) {
            return null;
          }
          const values = form.getValues();
          const meta: ModMetadata = {
            name: values.name.trim(),
            author: values.author?.trim() || undefined,
            description: values.description?.trim() || undefined,
            link: values.link?.trim() || undefined,
            imageFile:
              values.imageFile instanceof File ? values.imageFile : null,
            imageSrc: preview && imgOk ? preview : generateFallbackSVG(),
          };
          return meta;
        },
        reset: () => {
          form.reset({
            name: initial?.name ?? "",
            author: initial?.author ?? "Unknown",
            description: initial?.description ?? "",
            link: initial?.link ?? "",
            imageFile: undefined,
          });
          clearImage();
        },
      }),
      [form, preview, imgOk, initial, clearImage],
    );

    const Body = (
      <div className='grid grid-cols-1 gap-6 md:grid-cols-12'>
        {}
        <div className='md:col-span-4'>
          <div className='aspect-video w-full overflow-hidden rounded-md border bg-muted'>
            <img
              alt={t("modForm.modPreview")}
              className='h-full w-full object-cover'
              onError={() => {
                setImgOk(false);
                setPreview(generateFallbackSVG());
              }}
              src={preview}
            />
          </div>
          <div className='mt-3 flex items-center gap-2'>
            <input
              accept='image/*,.png,.jpg,.jpeg,.webp,.gif,.svg'
              className='hidden'
              onChange={handleImageChange}
              ref={fileRef}
              type='file'
            />
            <Button onClick={() => fileRef.current?.click()} type='button'>
              Choose image
            </Button>
            <Button onClick={clearImage} type='button' variant='secondary'>
              Use default
            </Button>
          </div>
        </div>

        {}
        <div className='space-y-4 md:col-span-8'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("modForm.modNamePlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='author'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Author</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("modForm.authorPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='link'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("ui.placeholders.websiteUrl")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <textarea
                    className='w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:ring-2 focus-visible:ring-ring'
                    placeholder={t("ui.placeholders.shortDescription")}
                    rows={6}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    );

    if (hideCardChrome) {
      return (
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}>
            {Body}
          </form>
        </Form>
      );
    }

    return (
      <Card className='w-full border-0 shadow'>
        <CardHeader>
          <CardTitle>{actualTitle}</CardTitle>
          <CardDescription>{actualDescription}</CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}>
              {Body}
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  },
);

export default Inner;
