import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Author } from "@deadlock-mods/dmodpkg";
import type { WizardStepProps } from "../types";

const COMMON_LICENSES = [
  "MIT",
  "Apache-2.0",
  "GPL-3.0",
  "GPL-2.0",
  "BSD-3-Clause",
  "BSD-2-Clause",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
  "CC0-1.0",
  "Unlicense",
  "All Rights Reserved",
];

function getAuthorDisplayName(author: Author): string {
  if (typeof author === "string") return author;
  return author.name;
}

export function AuthorsStep({ form, onNext, onBack }: WizardStepProps) {
  const authors = form.watch("authors") ?? [];
  const tags = form.watch("metadata.tags") ?? [];
  const [newTag, setNewTag] = useState("");
  const [newAuthorName, setNewAuthorName] = useState("");
  const [useDetailedAuthor, setUseDetailedAuthor] = useState(false);
  const [newAuthorRole, setNewAuthorRole] = useState("");
  const [newAuthorUrl, setNewAuthorUrl] = useState("");

  const addAuthor = () => {
    if (!newAuthorName.trim()) return;
    const author: Author = useDetailedAuthor
      ? {
          name: newAuthorName.trim(),
          role: newAuthorRole.trim() || null,
          url: newAuthorUrl.trim() || null,
        }
      : newAuthorName.trim();
    form.setValue("authors", [...authors, author]);
    setNewAuthorName("");
    setNewAuthorRole("");
    setNewAuthorUrl("");
  };

  const removeAuthor = (index: number) => {
    form.setValue(
      "authors",
      authors.filter((_, i) => i !== index),
    );
  };

  const addTag = () => {
    if (!newTag.trim() || tags.includes(newTag.trim())) return;
    form.setValue("metadata.tags", [...tags, newTag.trim()]);
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    form.setValue(
      "metadata.tags",
      tags.filter((t) => t !== tag),
    );
  };

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <div className='space-y-6'>
          {/* Authors */}
          <div className='space-y-3'>
            <FormLabel>Authors</FormLabel>
            {authors.length > 0 && (
              <div className='space-y-2'>
                {authors.map((author, index) => (
                  <div
                    key={`${getAuthorDisplayName(author)}-${index}`}
                    className='flex items-center gap-2 rounded-lg border bg-accent/20 px-3 py-2'>
                    <div className='flex-1'>
                      <span className='text-sm'>
                        {getAuthorDisplayName(author)}
                      </span>
                      {typeof author !== "string" && author.role && (
                        <span className='ml-2 text-muted-foreground text-xs'>
                          ({author.role})
                        </span>
                      )}
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-6 w-6'
                      onClick={() => removeAuthor(index)}>
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className='space-y-2 rounded-lg border p-3'>
              <div className='flex items-center gap-2'>
                <Input
                  placeholder='Author name'
                  value={newAuthorName}
                  onChange={(e) => setNewAuthorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAuthor();
                    }
                  }}
                />
                <Button
                  variant='outline'
                  size='icon'
                  onClick={addAuthor}
                  disabled={!newAuthorName.trim()}>
                  <Plus className='h-4 w-4' />
                </Button>
              </div>
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='detailed-author'
                  checked={useDetailedAuthor}
                  onCheckedChange={(checked) =>
                    setUseDetailedAuthor(checked === true)
                  }
                />
                <label
                  htmlFor='detailed-author'
                  className='cursor-pointer text-muted-foreground text-xs'>
                  Add role and URL
                </label>
              </div>
              {useDetailedAuthor && (
                <div className='flex gap-2'>
                  <Input
                    placeholder='Role (e.g. Lead Artist)'
                    value={newAuthorRole}
                    onChange={(e) => setNewAuthorRole(e.target.value)}
                    className='flex-1'
                  />
                  <Input
                    placeholder='URL'
                    value={newAuthorUrl}
                    onChange={(e) => setNewAuthorUrl(e.target.value)}
                    className='flex-1'
                  />
                </div>
              )}
            </div>
          </div>

          {/* License */}
          <FormField
            control={form.control}
            name='license'
            render={({ field }) => (
              <FormItem>
                <FormLabel>License (optional)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select a license' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COMMON_LICENSES.map((license) => (
                      <SelectItem key={license} value={license}>
                        {license}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>SPDX license identifier</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Homepage & Repository */}
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='homepage'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Homepage (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='https://...'
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='repository'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repository (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='https://github.com/...'
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Metadata: Tags */}
          <div className='space-y-3'>
            <FormLabel>Tags (optional)</FormLabel>
            {tags.length > 0 && (
              <div className='flex flex-wrap gap-1.5'>
                {tags.map((tag) => (
                  <Badge key={tag} variant='secondary' className='gap-1'>
                    {tag}
                    <button type='button' onClick={() => removeTag(tag)}>
                      <X className='h-3 w-3' />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className='flex gap-2'>
              <Input
                placeholder='Add a tag...'
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button
                variant='outline'
                size='icon'
                onClick={addTag}
                disabled={!newTag.trim()}>
                <Plus className='h-4 w-4' />
              </Button>
            </div>
          </div>

          {/* Metadata: Category */}
          <FormField
            control={form.control}
            name='metadata.category'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder='e.g. Skins, UI, Audio'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Metadata: NSFW */}
          <FormField
            control={form.control}
            name='metadata.nsfw'
            render={({ field }) => (
              <FormItem className='flex items-center gap-3'>
                <FormControl>
                  <Checkbox
                    checked={field.value === true}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true ? true : null)
                    }
                  />
                </FormControl>
                <div className='space-y-0.5'>
                  <FormLabel className='cursor-pointer'>NSFW Content</FormLabel>
                  <FormDescription>
                    Mark this if your mod contains adult content
                  </FormDescription>
                </div>
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
