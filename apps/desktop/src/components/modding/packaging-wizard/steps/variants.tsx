import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
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
import { Plus, Warning, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { usePersistedStore } from "@/lib/store";
import type {
  Variant,
  VariantGroup,
} from "@/lib/store/slices/packaging-wizard";

const VariantsStep = () => {
  const form = useFormContext();
  const { variantGroups: storedVariantGroups, layers } = usePersistedStore();
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [screenshotInputs, setScreenshotInputs] = useState<
    Record<string, string>
  >({});

  const availableLayers = layers.map((l) => l.name);

  useEffect(() => {
    if (storedVariantGroups && storedVariantGroups.length > 0) {
      setVariantGroups(storedVariantGroups);
    }
  }, [storedVariantGroups]);

  useEffect(() => {
    form.setValue("variant_groups", variantGroups);
  }, [variantGroups, form]);

  const addVariantGroup = () => {
    setVariantGroups([
      ...variantGroups,
      {
        id: "",
        name: "",
        description: "",
        default: "",
        variants: [
          {
            id: "",
            name: "",
            description: "",
            layers: [],
            screenshots: [],
          },
        ],
      },
    ]);
  };

  const removeVariantGroup = (groupIndex: number) => {
    setVariantGroups(variantGroups.filter((_, i) => i !== groupIndex));
  };

  const updateVariantGroup = (
    groupIndex: number,
    updates: Partial<VariantGroup>,
  ) => {
    const newGroups = [...variantGroups];
    newGroups[groupIndex] = { ...newGroups[groupIndex], ...updates };
    setVariantGroups(newGroups);
  };

  const addVariant = (groupIndex: number) => {
    const newGroups = [...variantGroups];
    newGroups[groupIndex].variants.push({
      id: "",
      name: "",
      description: "",
      layers: [],
      screenshots: [],
    });
    setVariantGroups(newGroups);
  };

  const removeVariant = (groupIndex: number, variantIndex: number) => {
    const newGroups = [...variantGroups];
    if (newGroups[groupIndex].variants.length === 1) return;
    newGroups[groupIndex].variants = newGroups[groupIndex].variants.filter(
      (_, i) => i !== variantIndex,
    );
    setVariantGroups(newGroups);
  };

  const updateVariant = (
    groupIndex: number,
    variantIndex: number,
    updates: Partial<Variant>,
  ) => {
    const newGroups = [...variantGroups];
    newGroups[groupIndex].variants[variantIndex] = {
      ...newGroups[groupIndex].variants[variantIndex],
      ...updates,
    };
    setVariantGroups(newGroups);
  };

  const toggleLayer = (
    groupIndex: number,
    variantIndex: number,
    layerName: string,
  ) => {
    const variant = variantGroups[groupIndex].variants[variantIndex];
    const currentLayers = variant.layers || [];
    const newLayers = currentLayers.includes(layerName)
      ? currentLayers.filter((l) => l !== layerName)
      : [...currentLayers, layerName];
    updateVariant(groupIndex, variantIndex, { layers: newLayers });
  };

  const addScreenshotToVariant = (groupIndex: number, variantIndex: number) => {
    const key = `${groupIndex}-${variantIndex}`;
    const input = screenshotInputs[key];
    if (!input?.trim()) return;

    const variant = variantGroups[groupIndex].variants[variantIndex];
    updateVariant(groupIndex, variantIndex, {
      screenshots: [...(variant.screenshots || []), input],
    });

    setScreenshotInputs({ ...screenshotInputs, [key]: "" });
  };

  const removeScreenshotFromVariant = (
    groupIndex: number,
    variantIndex: number,
    screenshotIndex: number,
  ) => {
    const variant = variantGroups[groupIndex].variants[variantIndex];
    updateVariant(groupIndex, variantIndex, {
      screenshots: (variant.screenshots || []).filter(
        (_, i) => i !== screenshotIndex,
      ),
    });
  };

  const handleFileUpload = async (
    groupIndex: number,
    variantIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
    type: "preview" | "screenshot",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const variant = variantGroups[groupIndex].variants[variantIndex];
    const filePath = (file as File & { path?: string }).path || file.name;

    if (type === "preview") {
      updateVariant(groupIndex, variantIndex, {
        preview_image: filePath,
      });
    } else {
      updateVariant(groupIndex, variantIndex, {
        screenshots: [...(variant.screenshots || []), filePath],
      });
    }

    e.target.value = "";
  };

  const hasInvalidLayerReferences = (variant: Variant): boolean => {
    return variant.layers.some((layer) => !availableLayers.includes(layer));
  };

  if (availableLayers.length === 0) {
    return (
      <div className='flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4'>
        <Warning className='h-5 w-5 text-yellow-500' />
        <p className='text-sm'>
          You need to create at least one layer in the previous step before
          defining variants.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <FormLabel>Variant Groups</FormLabel>
        <FormDescription>
          Define variant groups for your mod. Each group contains mutually
          exclusive variants (optional).
        </FormDescription>
      </div>

      {variantGroups.length === 0 ? (
        <div className='rounded-lg border border-dashed p-8 text-center'>
          <p className='text-muted-foreground text-sm'>
            No variant groups defined. Variants are optional.
          </p>
        </div>
      ) : (
        <div className='space-y-6'>
          {variantGroups.map((group, groupIndex) => (
            <div key={groupIndex} className='space-y-4 rounded-lg border p-4'>
              <div className='flex items-center justify-between'>
                <h4 className='font-semibold text-sm'>
                  Variant Group {groupIndex + 1}
                  {group.name && `: ${group.name}`}
                </h4>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => removeVariantGroup(groupIndex)}
                  title='Remove Variant Group'>
                  <X className='h-4 w-4' />
                </Button>
              </div>

              <div className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <FormLabel>Group ID *</FormLabel>
                    <Input
                      placeholder='skin_style'
                      value={group.id}
                      onChange={(e) =>
                        updateVariantGroup(groupIndex, { id: e.target.value })
                      }
                    />
                  </div>

                  <div className='space-y-2'>
                    <FormLabel>Group Name *</FormLabel>
                    <Input
                      placeholder='Skin Style'
                      value={group.name}
                      onChange={(e) =>
                        updateVariantGroup(groupIndex, { name: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <FormLabel>Description</FormLabel>
                  <Textarea
                    placeholder='Choose one skin style'
                    value={group.description || ""}
                    onChange={(e) =>
                      updateVariantGroup(groupIndex, {
                        description: e.target.value,
                      })
                    }
                    className='min-h-[60px]'
                  />
                </div>

                <div className='space-y-2'>
                  <FormLabel>Default Variant ID *</FormLabel>
                  <Input
                    placeholder='default'
                    value={group.default}
                    onChange={(e) =>
                      updateVariantGroup(groupIndex, {
                        default: e.target.value,
                      })
                    }
                  />
                  <FormDescription className='text-xs'>
                    ID of the default variant in this group
                  </FormDescription>
                </div>

                <div className='space-y-3'>
                  <FormLabel>Variants *</FormLabel>
                  {group.variants.map((variant, variantIndex) => (
                    <div
                      key={variantIndex}
                      className='space-y-3 rounded-md border bg-muted/50 p-3'>
                      <div className='flex items-center justify-between'>
                        <h5 className='font-medium text-sm'>
                          Variant {variantIndex + 1}
                          {variant.name && `: ${variant.name}`}
                        </h5>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          onClick={() =>
                            removeVariant(groupIndex, variantIndex)
                          }
                          disabled={group.variants.length === 1}
                          title='Remove Variant'>
                          <X className='h-4 w-4' />
                        </Button>
                      </div>

                      <div className='grid grid-cols-2 gap-3'>
                        <div className='space-y-2'>
                          <FormLabel className='text-xs'>ID *</FormLabel>
                          <Input
                            placeholder='default'
                            value={variant.id}
                            onChange={(e) =>
                              updateVariant(groupIndex, variantIndex, {
                                id: e.target.value,
                              })
                            }
                            className='h-8'
                          />
                        </div>

                        <div className='space-y-2'>
                          <FormLabel className='text-xs'>Name *</FormLabel>
                          <Input
                            placeholder='Default'
                            value={variant.name}
                            onChange={(e) =>
                              updateVariant(groupIndex, variantIndex, {
                                name: e.target.value,
                              })
                            }
                            className='h-8'
                          />
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <FormLabel className='text-xs'>Description</FormLabel>
                        <Textarea
                          placeholder='Variant description'
                          value={variant.description || ""}
                          onChange={(e) =>
                            updateVariant(groupIndex, variantIndex, {
                              description: e.target.value,
                            })
                          }
                          className='min-h-[50px]'
                        />
                      </div>

                      <div className='space-y-2'>
                        <FormLabel className='text-xs'>Layers *</FormLabel>
                        {hasInvalidLayerReferences(variant) && (
                          <div className='flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-2'>
                            <Warning className='h-4 w-4 text-red-500' />
                            <p className='text-xs text-red-500'>
                              Some referenced layers no longer exist
                            </p>
                          </div>
                        )}
                        <div className='space-y-2 rounded-md border p-3'>
                          {availableLayers.map((layerName) => (
                            <div
                              key={layerName}
                              className='flex items-center space-x-2'>
                              <Checkbox
                                id={`layer-${groupIndex}-${variantIndex}-${layerName}`}
                                checked={variant.layers.includes(layerName)}
                                onCheckedChange={() =>
                                  toggleLayer(
                                    groupIndex,
                                    variantIndex,
                                    layerName,
                                  )
                                }
                              />
                              <label
                                htmlFor={`layer-${groupIndex}-${variantIndex}-${layerName}`}
                                className='text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                                {layerName}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <FormLabel className='text-xs'>Preview Image</FormLabel>
                        <div className='flex gap-2'>
                          <Input
                            placeholder='URL or path'
                            value={variant.preview_image || ""}
                            onChange={(e) =>
                              updateVariant(groupIndex, variantIndex, {
                                preview_image: e.target.value,
                              })
                            }
                            className='h-8'
                          />
                          <input
                            type='file'
                            accept='image/*'
                            onChange={(e) =>
                              handleFileUpload(
                                groupIndex,
                                variantIndex,
                                e,
                                "preview",
                              )
                            }
                            className='hidden'
                            id={`preview-${groupIndex}-${variantIndex}`}
                          />
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              document
                                .getElementById(
                                  `preview-${groupIndex}-${variantIndex}`,
                                )
                                ?.click()
                            }>
                            Upload
                          </Button>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <FormLabel className='text-xs'>Screenshots</FormLabel>
                        <div className='flex gap-2'>
                          <Input
                            placeholder='URL or path'
                            value={
                              screenshotInputs[
                                `${groupIndex}-${variantIndex}`
                              ] || ""
                            }
                            onChange={(e) =>
                              setScreenshotInputs({
                                ...screenshotInputs,
                                [`${groupIndex}-${variantIndex}`]:
                                  e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addScreenshotToVariant(
                                  groupIndex,
                                  variantIndex,
                                );
                              }
                            }}
                            className='h-8'
                          />
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              addScreenshotToVariant(groupIndex, variantIndex)
                            }>
                            Add
                          </Button>
                          <input
                            type='file'
                            accept='image/*'
                            onChange={(e) =>
                              handleFileUpload(
                                groupIndex,
                                variantIndex,
                                e,
                                "screenshot",
                              )
                            }
                            className='hidden'
                            id={`screenshot-${groupIndex}-${variantIndex}`}
                          />
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              document
                                .getElementById(
                                  `screenshot-${groupIndex}-${variantIndex}`,
                                )
                                ?.click()
                            }>
                            Upload
                          </Button>
                        </div>

                        {variant.screenshots &&
                          variant.screenshots.length > 0 && (
                            <div className='space-y-1 mt-2'>
                              {variant.screenshots.map(
                                (screenshot, screenshotIndex) => (
                                  <div
                                    key={screenshotIndex}
                                    className='flex items-center justify-between gap-2 rounded-md border bg-background p-2'>
                                    <p className='truncate text-xs flex-1'>
                                      {screenshot}
                                    </p>
                                    <Button
                                      type='button'
                                      variant='ghost'
                                      size='icon'
                                      onClick={() =>
                                        removeScreenshotFromVariant(
                                          groupIndex,
                                          variantIndex,
                                          screenshotIndex,
                                        )
                                      }
                                      className='h-6 w-6 shrink-0'>
                                      <X className='h-3 w-3' />
                                    </Button>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}

                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => addVariant(groupIndex)}>
                    <Plus className='mr-2 h-3 w-3' />
                    Add Variant
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type='button' variant='outline' onClick={addVariantGroup}>
        <Plus className='mr-2 h-4 w-4' />
        Add Variant Group
      </Button>

      <FormField
        control={form.control}
        name='variant_groups'
        render={() => (
          <FormItem className='hidden'>
            <FormControl>
              <input type='hidden' />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default VariantsStep;
