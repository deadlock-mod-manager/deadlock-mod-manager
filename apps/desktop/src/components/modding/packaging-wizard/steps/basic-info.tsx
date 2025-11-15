import { Button } from "@deadlock-mods/ui/components/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { usePersistedStore } from "@/lib/store";

const BasicInfoStep = () => {
  const form = useFormContext();
  const { basicInfo, updateBasicInfo } = usePersistedStore();
  const [screenshotInput, setScreenshotInput] = useState("");

  useEffect(() => {
    if (basicInfo) {
      form.setValue("name", basicInfo.name || "");
      form.setValue("displayName", basicInfo.displayName || "");
      form.setValue("version", basicInfo.version || "");
      form.setValue("description", basicInfo.description || "");
      form.setValue("gameVersion", basicInfo.gameVersion || "");
      form.setValue("license", basicInfo.license || "");
      form.setValue("homepage", basicInfo.homepage || "");
      form.setValue("repository", basicInfo.repository || "");
      form.setValue("readme", basicInfo.readme || "");
      form.setValue("screenshots", basicInfo.screenshots || []);
    }
  }, [basicInfo, form.setValue]);

  const screenshots = form.watch("screenshots") || [];

  const handleAddScreenshot = () => {
    if (!screenshotInput.trim()) return;

    const currentScreenshots = form.getValues("screenshots") || [];
    form.setValue("screenshots", [...currentScreenshots, screenshotInput]);
    setScreenshotInput("");
  };

  const handleRemoveScreenshot = (index: number) => {
    const currentScreenshots = form.getValues("screenshots") || [];
    form.setValue(
      "screenshots",
      currentScreenshots.filter((_: string, i: number) => i !== index),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentScreenshots = form.getValues("screenshots") || [];
    const filePath = (file as File & { path?: string }).path || file.name;
    form.setValue("screenshots", [...currentScreenshots, filePath]);
    e.target.value = "";
  };

  return (
    <div className='space-y-6'>
      <FormField
        control={form.control}
        name='name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Package Name *</FormLabel>
            <FormControl>
              <Input placeholder='my-awesome-mod' {...field} />
            </FormControl>
            <FormDescription>
              Unique identifier (kebab-case, a-z0-9-)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='displayName'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Display Name *</FormLabel>
            <FormControl>
              <Input placeholder='My Awesome Mod' {...field} />
            </FormControl>
            <FormDescription>
              Human-readable name shown to users
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='version'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Version *</FormLabel>
            <FormControl>
              <Input placeholder='1.0.0' {...field} />
            </FormControl>
            <FormDescription>Semantic version (e.g., 1.0.0)</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='description'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description *</FormLabel>
            <FormControl>
              <Textarea
                placeholder='A brief description of your mod (max 500 characters)'
                className='min-h-[100px]'
                maxLength={500}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Short description (max 500 characters)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='gameVersion'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Game Version</FormLabel>
            <FormControl>
              <Input placeholder='>=1.0.0' {...field} />
            </FormControl>
            <FormDescription>
              Compatible Deadlock version constraint (optional)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='license'
        render={({ field }) => (
          <FormItem>
            <FormLabel>License</FormLabel>
            <FormControl>
              <Input placeholder='MIT' {...field} />
            </FormControl>
            <FormDescription>
              SPDX license identifier (optional)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='homepage'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Homepage</FormLabel>
            <FormControl>
              <Input type='url' placeholder='https://example.com' {...field} />
            </FormControl>
            <FormDescription>Project homepage URL (optional)</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='repository'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Repository</FormLabel>
            <FormControl>
              <Input
                type='url'
                placeholder='https://github.com/user/repo'
                {...field}
              />
            </FormControl>
            <FormDescription>
              Source code repository URL (optional)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='readme'
        render={({ field }) => (
          <FormItem>
            <FormLabel>README Path</FormLabel>
            <FormControl>
              <Input placeholder='README.md' {...field} />
            </FormControl>
            <FormDescription>Path to README file (optional)</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='space-y-2'>
        <FormLabel>Screenshots</FormLabel>
        <FormDescription>
          Add screenshots as file paths or URLs (optional)
        </FormDescription>
        <div className='flex gap-2'>
          <Input
            type='text'
            placeholder='https://example.com/screenshot.jpg or path/to/image.png'
            value={screenshotInput}
            onChange={(e) => setScreenshotInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddScreenshot();
              }
            }}
          />
          <Button type='button' variant='outline' onClick={handleAddScreenshot}>
            Add URL
          </Button>
        </div>
        <div className='flex gap-2'>
          <input
            type='file'
            accept='image/*'
            onChange={handleFileUpload}
            className='hidden'
            id='screenshot-file-input'
          />
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              document.getElementById("screenshot-file-input")?.click()
            }>
            Upload Image
          </Button>
        </div>

        {screenshots.length > 0 && (
          <div className='space-y-2 mt-3'>
            {screenshots.map((screenshot: string, index: number) => (
              <div
                key={index}
                className='flex items-center justify-between gap-2 rounded-md border p-2'>
                <p className='truncate text-sm flex-1'>{screenshot}</p>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => handleRemoveScreenshot(index)}
                  className='h-8 w-8 shrink-0'>
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BasicInfoStep;
