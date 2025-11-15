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
import { Plus, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { usePersistedStore } from "@/lib/store";
import type { Layer } from "@/lib/store/slices/packaging-wizard";
import { FileUpload } from "../file-upload";

const LayersStep = () => {
  const form = useFormContext();
  const { layers: storedLayers } = usePersistedStore();
  const [layers, setLayers] = useState<Layer[]>([
    {
      name: "base",
      priority: 0,
      description: "",
      required: true,
      vpkFiles: [],
    },
  ]);

  useEffect(() => {
    if (storedLayers && storedLayers.length > 0) {
      setLayers(storedLayers);
    }
  }, [storedLayers]);

  useEffect(() => {
    form.setValue("layers", layers);
  }, [layers, form]);

  const addLayer = () => {
    setLayers([
      ...layers,
      {
        name: "",
        priority: layers.length,
        description: "",
        required: false,
        vpkFiles: [],
      },
    ]);
  };

  const removeLayer = (index: number) => {
    if (layers.length === 1) return;
    setLayers(layers.filter((_, i) => i !== index));
  };

  const updateLayer = (index: number, updates: Partial<Layer>) => {
    const newLayers = [...layers];
    newLayers[index] = { ...newLayers[index], ...updates };
    setLayers(newLayers);
  };

  return (
    <div className='space-y-6'>
      <div>
        <FormLabel>Layers *</FormLabel>
        <FormDescription>
          Define content layers for your mod. Each layer can have its own VPK
          files and priority level.
        </FormDescription>
      </div>

      <div className='space-y-6'>
        {layers.map((layer, index) => (
          <div key={index} className='space-y-4 rounded-lg border p-4'>
            <div className='flex items-center justify-between'>
              <h4 className='font-semibold text-sm'>
                Layer {index + 1}
                {layer.name && `: ${layer.name}`}
              </h4>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => removeLayer(index)}
                disabled={layers.length === 1}
                title='Remove Layer'>
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <FormLabel>Name *</FormLabel>
                  <Input
                    placeholder='base'
                    value={layer.name}
                    onChange={(e) =>
                      updateLayer(index, { name: e.target.value })
                    }
                  />
                </div>

                <div className='space-y-2'>
                  <FormLabel>Priority *</FormLabel>
                  <Input
                    type='number'
                    min='0'
                    placeholder='0'
                    value={layer.priority}
                    onChange={(e) =>
                      updateLayer(index, {
                        priority: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                  <FormDescription className='text-xs'>
                    Higher priority overrides lower
                  </FormDescription>
                </div>
              </div>

              <div className='space-y-2'>
                <FormLabel>Description</FormLabel>
                <Textarea
                  placeholder='Description of this layer (optional)'
                  value={layer.description || ""}
                  onChange={(e) =>
                    updateLayer(index, { description: e.target.value })
                  }
                  className='min-h-[60px]'
                />
              </div>

              <div className='flex items-center space-x-2'>
                <Checkbox
                  id={`required-${index}`}
                  checked={layer.required}
                  onCheckedChange={(checked) =>
                    updateLayer(index, { required: checked === true })
                  }
                />
                <label
                  htmlFor={`required-${index}`}
                  className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                  Required Layer
                </label>
              </div>

              <div className='space-y-2'>
                <FormLabel>VPK Files</FormLabel>
                <FormDescription className='text-xs'>
                  Upload VPK files for this layer
                </FormDescription>
                <FileUpload
                  accept='.vpk'
                  multiple
                  files={layer.vpkFiles || []}
                  onFilesChange={(files) =>
                    updateLayer(index, { vpkFiles: files })
                  }
                  label='Choose VPK Files'
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type='button' variant='outline' onClick={addLayer}>
        <Plus className='mr-2 h-4 w-4' />
        Add Layer
      </Button>

      {/* @ts-ignore - React Hook Form version mismatch in monorepo */}
      <FormField
        control={form.control}
        name='layers'
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

export default LayersStep;
