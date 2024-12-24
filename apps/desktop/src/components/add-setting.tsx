import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { usePersistedStore } from '@/lib/store';
import { CreateSettingSchema, createSettingSchema } from '@/lib/validation/create-setting';
import { CustomSettingType, customSettingTypeHuman } from '@deadlock-mods/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const AddSettingDialog = ({ children }: { children: React.ReactNode }) => {
  const { createSetting } = usePersistedStore();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateSettingSchema>({
    resolver: zodResolver(createSettingSchema),
    defaultValues: {
      key: '',
      value: '',
      type: CustomSettingType.LAUNCH_OPTION,
      description: ''
    }
  });

  const onSubmit = (values: CreateSettingSchema) => {
    createSetting(values);
    toast.success('Setting created');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a custom setting</DialogTitle>
          <DialogDescription>
            Add a custom setting to the game. These will be added to the game as launch options.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input placeholder="For example: citadel_unit_status_use_new" {...field} />
                  </FormControl>
                  <FormDescription>Most settings are a key-value pair</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input placeholder="true or false or any value" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Setting type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(CustomSettingType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {customSettingTypeHuman[type].title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">
                <PlusCircle />
                Add Setting
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSettingDialog;
