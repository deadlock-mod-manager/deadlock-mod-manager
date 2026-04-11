import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import type { Conflict, Dependency } from "@deadlock-mods/dmodpkg";
import type { WizardStepProps } from "../types";
import { ModPicker } from "../shared/mod-picker";

export function DependenciesStep({ form, onNext, onBack }: WizardStepProps) {
  const dependencies = form.watch("dependencies") ?? [];
  const conflicts = form.watch("conflicts") ?? [];

  const allUsedIds = [
    ...dependencies.map((d) => d.remote_id),
    ...conflicts.map((c) => c.remote_id),
  ];

  const addDependency = (mod: { remoteId: string; name: string }) => {
    const dep: Dependency = {
      remote_id: mod.remoteId,
      name: mod.name,
      version: null,
      optional: null,
    };
    form.setValue("dependencies", [...dependencies, dep]);
  };

  const updateDependency = (index: number, updates: Partial<Dependency>) => {
    const updated = dependencies.map((dep, i) =>
      i === index ? { ...dep, ...updates } : dep,
    );
    form.setValue("dependencies", updated);
  };

  const removeDependency = (index: number) => {
    form.setValue(
      "dependencies",
      dependencies.filter((_, i) => i !== index),
    );
  };

  const addConflict = (mod: { remoteId: string; name: string }) => {
    const conflict: Conflict = {
      remote_id: mod.remoteId,
      name: mod.name,
    };
    form.setValue("conflicts", [...conflicts, conflict]);
  };

  const removeConflict = (index: number) => {
    form.setValue(
      "conflicts",
      conflicts.filter((_, i) => i !== index),
    );
  };

  return (
    <div className='space-y-6'>
      {/* Dependencies */}
      <div className='space-y-4'>
        <div>
          <h3 className='font-medium text-sm'>Dependencies</h3>
          <p className='text-muted-foreground text-xs mt-1'>
            Mods that this mod requires to work properly. Users will be prompted
            to install them.
          </p>
        </div>

        {dependencies.map((dep, index) => (
          <div
            key={dep.remote_id}
            className='flex items-start gap-3 rounded-lg border bg-accent/20 p-3'>
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='font-medium text-sm'>{dep.name}</span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-6 w-6'
                  onClick={() => removeDependency(index)}>
                  <Trash2 className='h-3.5 w-3.5' />
                </Button>
              </div>
              <div className='flex items-center gap-3'>
                <div className='flex-1'>
                  <Input
                    placeholder='Version constraint (e.g. >=1.0.0)'
                    value={dep.version ?? ""}
                    onChange={(e) =>
                      updateDependency(index, {
                        version: e.target.value || null,
                      })
                    }
                    className='h-8 text-xs'
                  />
                </div>
                <label className='flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground'>
                  <Checkbox
                    checked={dep.optional === true}
                    onCheckedChange={(checked) =>
                      updateDependency(index, {
                        optional: checked === true ? true : null,
                      })
                    }
                    className='h-3.5 w-3.5'
                  />
                  Optional
                </label>
              </div>
              <p className='text-muted-foreground text-xs'>
                ID: {dep.remote_id}
              </p>
            </div>
          </div>
        ))}

        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>Add a dependency:</p>
          <ModPicker
            value={null}
            onSelect={addDependency}
            excludeIds={allUsedIds}
            placeholder='Search for a mod to add as dependency...'
          />
        </div>
      </div>

      {/* Conflicts */}
      <div className='space-y-4'>
        <div>
          <h3 className='font-medium text-sm'>Conflicts</h3>
          <p className='text-muted-foreground text-xs mt-1'>
            Mods that are incompatible with this mod. Users will see a warning
            if both are installed.
          </p>
        </div>

        {conflicts.map((conflict, index) => (
          <div
            key={conflict.remote_id}
            className='flex items-center justify-between rounded-lg border bg-accent/20 p-3'>
            <div>
              <span className='font-medium text-sm'>{conflict.name}</span>
              <p className='text-muted-foreground text-xs'>
                ID: {conflict.remote_id}
              </p>
            </div>
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6'
              onClick={() => removeConflict(index)}>
              <Trash2 className='h-3.5 w-3.5' />
            </Button>
          </div>
        ))}

        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>Add a conflict:</p>
          <ModPicker
            value={null}
            onSelect={addConflict}
            excludeIds={allUsedIds}
            placeholder='Search for a mod to add as conflict...'
          />
        </div>
      </div>

      {/* Breaks on Update */}
      <Form {...form}>
        <FormField
          control={form.control}
          name='breaks_on_update'
          render={({ field }) => (
            <FormItem className='flex items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <FormLabel>Breaks on Game Update</FormLabel>
                <FormDescription>
                  Warn users that this mod may stop working after a Deadlock
                  game update
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) =>
                    field.onChange(checked ? true : null)
                  }
                />
              </FormControl>
            </FormItem>
          )}
        />
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
