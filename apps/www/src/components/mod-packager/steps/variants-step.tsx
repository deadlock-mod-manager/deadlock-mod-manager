import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from "lucide-react";
import type { Variant, VariantGroup } from "@deadlock-mods/dmodpkg";
import type { WizardStepProps } from "../types";
import { EducationalCallout } from "../shared/educational-callout";

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function VariantsStep({ form, onNext, onBack }: WizardStepProps) {
  const variantGroups = form.watch("variant_groups") ?? [];
  const layers = form.watch("layers") ?? [];
  const layerNames = layers.map((l) => l.name).filter(Boolean);

  const addGroup = () => {
    const newGroup: VariantGroup = {
      id: "",
      name: "",
      description: null,
      default: "",
      variants: [],
    };
    form.setValue("variant_groups", [...variantGroups, newGroup]);
  };

  const updateGroup = (index: number, updates: Partial<VariantGroup>) => {
    const updated = variantGroups.map((group, i) =>
      i === index ? { ...group, ...updates } : group,
    );
    form.setValue("variant_groups", updated);
  };

  const removeGroup = (index: number) => {
    form.setValue(
      "variant_groups",
      variantGroups.filter((_, i) => i !== index),
    );
  };

  const addVariant = (groupIndex: number) => {
    const group = variantGroups[groupIndex];
    const newVariant: Variant = {
      id: "",
      name: "",
      description: null,
      layers: [],
      preview_image: null,
      screenshots: [],
    };
    updateGroup(groupIndex, {
      variants: [...group.variants, newVariant],
    });
  };

  const updateVariant = (
    groupIndex: number,
    variantIndex: number,
    updates: Partial<Variant>,
  ) => {
    const group = variantGroups[groupIndex];
    const updatedVariants = group.variants.map((v, i) => {
      if (i !== variantIndex) return v;
      return Object.assign({}, v, updates);
    });
    updateGroup(groupIndex, { variants: updatedVariants });
  };

  const removeVariant = (groupIndex: number, variantIndex: number) => {
    const group = variantGroups[groupIndex];
    updateGroup(groupIndex, {
      variants: group.variants.filter((_, i) => i !== variantIndex),
    });
  };

  const toggleVariantLayer = (
    groupIndex: number,
    variantIndex: number,
    layerName: string,
  ) => {
    const variant = variantGroups[groupIndex].variants[variantIndex];
    const newLayers = variant.layers.includes(layerName)
      ? variant.layers.filter((l) => l !== layerName)
      : [...variant.layers, layerName];
    updateVariant(groupIndex, variantIndex, { layers: newLayers });
  };

  return (
    <div className='space-y-6'>
      <EducationalCallout title='What are Variant Groups?'>
        <p className='mb-2'>
          Variant groups let users choose between mutually exclusive options.
          For example, a skin mod might offer &quot;Red&quot;, &quot;Blue&quot;,
          and &quot;Green&quot; color variants.
        </p>
        <ul className='list-inside list-disc space-y-1'>
          <li>
            Each <strong>variant group</strong> represents one choice (e.g.
            &quot;Color&quot;). Only one variant per group can be active.
          </li>
          <li>
            Each <strong>variant</strong> activates specific layers. When a user
            selects &quot;Red&quot;, only the layers assigned to that variant
            are installed.
          </li>
          <li>
            Set a <strong>default</strong> variant that will be pre-selected for
            new users.
          </li>
          <li>
            Variant groups are optional. Skip this step if your mod doesn&apos;t
            have multiple options.
          </li>
        </ul>
      </EducationalCallout>

      {layerNames.length === 0 && (
        <div className='rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-500'>
          Define layers first (previous step) before creating variant groups.
          Variants reference layers to control which files are active.
        </div>
      )}

      {variantGroups.map((group, groupIndex) => (
        <div
          key={`${group.id || "group"}-${groupIndex}`}
          className='rounded-lg border p-4 space-y-4'>
          <div className='flex items-center justify-between'>
            <span className='font-medium text-sm'>
              Variant Group {groupIndex + 1}
            </span>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7'
              onClick={() => removeGroup(groupIndex)}>
              <Trash2 className='h-3.5 w-3.5' />
            </Button>
          </div>

          <div className='grid gap-3 md:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Name</Label>
              <Input
                placeholder='e.g. Color Variant'
                value={group.name}
                onChange={(e) => {
                  const name = e.target.value;
                  updateGroup(groupIndex, {
                    name,
                    id:
                      group.id === generateId(group.name)
                        ? generateId(name)
                        : group.id,
                  });
                }}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>ID</Label>
              <Input
                placeholder='e.g. color-variant'
                value={group.id}
                onChange={(e) =>
                  updateGroup(groupIndex, { id: e.target.value })
                }
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder='Describe what this choice affects...'
              rows={2}
              value={group.description ?? ""}
              onChange={(e) =>
                updateGroup(groupIndex, {
                  description: e.target.value || null,
                })
              }
            />
          </div>

          {/* Default variant selector */}
          {group.variants.length > 0 && (
            <div className='space-y-1.5'>
              <Label>Default Variant</Label>
              <Select
                value={group.default}
                onValueChange={(val) =>
                  updateGroup(groupIndex, { default: val })
                }>
                <SelectTrigger>
                  <SelectValue placeholder='Select default variant' />
                </SelectTrigger>
                <SelectContent>
                  {group.variants
                    .filter((v) => v.id)
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name || v.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Variants */}
          <div className='space-y-3 pl-4 border-l-2 border-border'>
            <Label className='text-muted-foreground text-xs uppercase tracking-wider'>
              Variants
            </Label>
            {group.variants.map((variant, variantIndex) => (
              <div
                key={`${variant.id || "variant"}-${variantIndex}`}
                className='rounded-lg border bg-card/50 p-3 space-y-3'>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground text-xs'>
                    Variant {variantIndex + 1}
                  </span>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-6 w-6'
                    onClick={() => removeVariant(groupIndex, variantIndex)}>
                    <Trash2 className='h-3 w-3' />
                  </Button>
                </div>

                <div className='grid gap-2 md:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label className='text-xs'>Name</Label>
                    <Input
                      placeholder='e.g. Red'
                      value={variant.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        updateVariant(groupIndex, variantIndex, {
                          name,
                          id:
                            variant.id === generateId(variant.name)
                              ? generateId(name)
                              : variant.id,
                        });
                      }}
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs'>ID</Label>
                    <Input
                      placeholder='e.g. red'
                      value={variant.id}
                      onChange={(e) =>
                        updateVariant(groupIndex, variantIndex, {
                          id: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className='space-y-1'>
                  <Label className='text-xs'>Description (optional)</Label>
                  <Input
                    placeholder='What does this variant look like?'
                    value={variant.description ?? ""}
                    onChange={(e) =>
                      updateVariant(groupIndex, variantIndex, {
                        description: e.target.value || null,
                      })
                    }
                  />
                </div>

                <div className='space-y-1'>
                  <Label className='text-xs'>Preview Image (optional)</Label>
                  <Input
                    placeholder='Path to preview image (e.g. previews/red.png)'
                    value={variant.preview_image ?? ""}
                    onChange={(e) =>
                      updateVariant(groupIndex, variantIndex, {
                        preview_image: e.target.value || null,
                      })
                    }
                  />
                </div>

                {/* Layer selection */}
                <div className='space-y-1.5'>
                  <Label className='text-xs'>Layers</Label>
                  {layerNames.length > 0 ? (
                    <div className='flex flex-wrap gap-2'>
                      {layerNames.map((layerName) => (
                        <label
                          key={layerName}
                          className='flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors hover:bg-accent/50'>
                          <Checkbox
                            checked={variant.layers.includes(layerName)}
                            onCheckedChange={() =>
                              toggleVariantLayer(
                                groupIndex,
                                variantIndex,
                                layerName,
                              )
                            }
                            className='h-3 w-3'
                          />
                          {layerName}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className='text-muted-foreground text-xs'>
                      No layers defined. Go back and create layers first.
                    </p>
                  )}
                  {variant.layers.length > 0 && (
                    <div className='flex flex-wrap gap-1 mt-1'>
                      {variant.layers.map((l) => (
                        <Badge
                          key={l}
                          variant='secondary'
                          className='text-xs gap-1'>
                          {l}
                          <button
                            type='button'
                            onClick={() =>
                              toggleVariantLayer(groupIndex, variantIndex, l)
                            }>
                            <X className='h-2.5 w-2.5' />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant='outline'
              size='sm'
              onClick={() => addVariant(groupIndex)}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              Add Variant
            </Button>
          </div>
        </div>
      ))}

      <Button variant='outline' onClick={addGroup}>
        <Plus className='mr-2 h-4 w-4' />
        Add Variant Group
      </Button>

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
