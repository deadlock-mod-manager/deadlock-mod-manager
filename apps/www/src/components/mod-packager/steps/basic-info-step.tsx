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
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { WizardStepProps } from "../types";

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function BasicInfoStep({ form, onNext, onBack }: WizardStepProps) {
  const displayName = form.watch("display_name");

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <div className='space-y-4'>
          <FormField
            control={form.control}
            name='display_name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder='My Awesome Mod'
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      if (
                        !form.getValues("name") ||
                        form.getValues("name") ===
                          generateSlug(displayName ?? "")
                      ) {
                        form.setValue("name", generateSlug(e.target.value));
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>
                  The human-readable name shown to users
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Package Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder='my-awesome-mod'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Unique kebab-case identifier (a-z, 0-9, hyphens only)
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
                <FormLabel>Version</FormLabel>
                <FormControl>
                  <Input
                    placeholder='1.0.0'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>Semantic version (e.g. 1.0.0)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='A short description of what your mod does...'
                    rows={3}
                    maxLength={500}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  {(field.value ?? "").length}/500 characters
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='game_version'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Game Version (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder='e.g. >=1.0.0'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Compatible game version constraint
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
