import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { Layer } from "@deadlock-mods/dmodpkg";
import type { WizardStepProps } from "../types";
import { EducationalCallout } from "../shared/educational-callout";
import { FileTree } from "../shared/file-tree";

export function LayersStep({
  form,
  onNext,
  onBack,
  zipFiles,
}: WizardStepProps) {
  const layers = form.watch("layers") ?? [];

  const addLayer = () => {
    const newLayer: Layer = {
      name: "",
      priority: layers.length,
      description: null,
      required: layers.length === 0,
    };
    form.setValue("layers", [...layers, newLayer]);
  };

  const updateLayer = (index: number, updates: Partial<Layer>) => {
    const updated = layers.map((layer, i) =>
      i === index ? { ...layer, ...updates } : layer,
    );
    form.setValue("layers", updated);
  };

  const removeLayer = (index: number) => {
    form.setValue(
      "layers",
      layers.filter((_, i) => i !== index),
    );
  };

  return (
    <div className='space-y-6'>
      <EducationalCallout title='What are Layers?'>
        <p className='mb-2'>
          Layers define groups of files within your mod that can be installed
          independently. Every mod needs at least one layer (typically called
          &quot;base&quot;).
        </p>
        <ul className='list-inside list-disc space-y-1'>
          <li>
            <strong>Priority</strong> controls which layer&apos;s files win when
            two layers include the same file path. Higher priority wins.
          </li>
          <li>
            <strong>Required</strong> layers are always installed. Optional
            layers can be toggled by the user (e.g. HD textures, alternate
            sounds).
          </li>
          <li>
            Layer names are referenced by variants to control which files are
            active for each variant option.
          </li>
        </ul>
      </EducationalCallout>

      {layers.length === 0 && (
        <div className='rounded-lg border border-dashed p-6 text-center'>
          <p className='mb-3 text-muted-foreground text-sm'>
            No layers defined yet. Add at least one layer to continue.
          </p>
          <Button onClick={addLayer}>
            <Plus className='mr-2 h-4 w-4' />
            Add Base Layer
          </Button>
        </div>
      )}

      {layers.map((layer, index) => (
        <div
          key={`${layer.name || "layer"}-${index}`}
          className='rounded-lg border p-4 space-y-3'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <GripVertical className='h-4 w-4 text-muted-foreground' />
              <span className='font-medium text-sm'>Layer {index + 1}</span>
            </div>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7'
              onClick={() => removeLayer(index)}
              disabled={layers.length === 1}>
              <Trash2 className='h-3.5 w-3.5' />
            </Button>
          </div>

          <div className='grid gap-3 md:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Name</Label>
              <Input
                placeholder='e.g. base, hd-textures'
                value={layer.name}
                onChange={(e) =>
                  updateLayer(index, {
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-_]/g, "-"),
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Priority</Label>
              <Input
                type='number'
                value={layer.priority}
                onChange={(e) =>
                  updateLayer(index, { priority: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder='What does this layer contain?'
              rows={2}
              value={layer.description ?? ""}
              onChange={(e) =>
                updateLayer(index, {
                  description: e.target.value || null,
                })
              }
            />
          </div>

          <div className='flex items-center gap-2'>
            <Checkbox
              id={`layer-required-${index}`}
              checked={layer.required}
              onCheckedChange={(checked) =>
                updateLayer(index, { required: checked === true })
              }
            />
            <Label
              htmlFor={`layer-required-${index}`}
              className='cursor-pointer text-sm'>
              Required (always installed)
            </Label>
          </div>
        </div>
      ))}

      {layers.length > 0 && (
        <Button variant='outline' onClick={addLayer}>
          <Plus className='mr-2 h-4 w-4' />
          Add Layer
        </Button>
      )}

      {zipFiles.length > 0 && (
        <div className='space-y-2'>
          <Label className='text-muted-foreground'>
            Zip Contents (for reference)
          </Label>
          <FileTree files={zipFiles} maxHeight='200px' />
        </div>
      )}

      <div className='flex justify-between'>
        <Button variant='outline' onClick={onBack}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
        <Button onClick={onNext} disabled={layers.length === 0}>
          Continue
          <ArrowRight className='ml-2 h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
