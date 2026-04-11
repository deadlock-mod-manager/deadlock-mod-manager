import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { useState } from "react";
import type { WizardStepProps } from "../types";

export function AdvancedStep({ form, onNext, onBack }: WizardStepProps) {
  const screenshots = form.watch("screenshots") ?? [];
  const [newScreenshot, setNewScreenshot] = useState("");

  const addScreenshot = () => {
    if (!newScreenshot.trim()) return;
    form.setValue("screenshots", [...screenshots, newScreenshot.trim()]);
    setNewScreenshot("");
  };

  const removeScreenshot = (value: string) => {
    form.setValue(
      "screenshots",
      screenshots.filter((s) => s !== value),
    );
  };

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <div className='space-y-4'>
          <FormField
            control={form.control}
            name='load_priority'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Load Priority (optional)</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    placeholder='0'
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  Suggested install/load order. Higher values load later (and
                  override earlier mods). Leave empty for default priority.
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
                <FormLabel>Readme Path (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder='e.g. README.md'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Path to a readme file within your mod archive
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Screenshots */}
          <div className='space-y-3'>
            <FormLabel>Screenshots (optional)</FormLabel>
            <FormDescription>
              Paths or URLs to screenshot images for your mod
            </FormDescription>
            {screenshots.length > 0 && (
              <div className='space-y-1.5'>
                {screenshots.map((screenshot) => (
                  <div
                    key={screenshot}
                    className='flex items-center gap-2 rounded border px-3 py-1.5'>
                    <span className='flex-1 truncate text-sm'>
                      {screenshot}
                    </span>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-6 w-6'
                      onClick={() => removeScreenshot(screenshot)}>
                      <X className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className='flex gap-2'>
              <Input
                placeholder='Path or URL to screenshot'
                value={newScreenshot}
                onChange={(e) => setNewScreenshot(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addScreenshot();
                  }
                }}
              />
              <Button
                variant='outline'
                size='icon'
                onClick={addScreenshot}
                disabled={!newScreenshot.trim()}>
                <Plus className='h-4 w-4' />
              </Button>
            </div>
          </div>

          {/* Schema Version - read-only */}
          <div className='rounded-lg border bg-accent/10 p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='font-medium text-sm'>Schema Version</p>
                <p className='text-muted-foreground text-xs'>
                  Automatically set. Used for forward compatibility.
                </p>
              </div>
              <Badge variant='secondary'>1</Badge>
            </div>
          </div>
        </div>
      </Form>

      <div className='flex justify-between'>
        <Button variant='outline' onClick={onBack}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
        <Button onClick={onNext}>
          Continue
          <ArrowRight className='ml-2 h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
