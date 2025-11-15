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
import { CaretDown, CaretUp, Plus, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { usePersistedStore } from "@/lib/store";

type AuthorFormData = {
  name: string;
  role?: string;
  url?: string;
  expanded: boolean;
};

const AuthorsStep = () => {
  const form = useFormContext();
  const { authors: storedAuthors } = usePersistedStore();
  const [authors, setAuthors] = useState<AuthorFormData[]>([
    { name: "", expanded: false },
  ]);

  useEffect(() => {
    if (storedAuthors && storedAuthors.length > 0) {
      const formattedAuthors = storedAuthors.map((author) => {
        if (typeof author === "string") {
          return { name: author, expanded: false };
        }
        return {
          name: author.name,
          role: author.role,
          url: author.url,
          expanded: true,
        };
      });
      setAuthors(formattedAuthors);
    }
  }, [storedAuthors]);

  useEffect(() => {
    const formattedAuthors = authors.map((author) => {
      if (!author.expanded || (!author.role && !author.url)) {
        return author.name;
      }
      return {
        name: author.name,
        role: author.role || undefined,
        url: author.url || undefined,
      };
    });
    form.setValue("authors", formattedAuthors);
  }, [authors, form]);

  const addAuthor = () => {
    setAuthors([...authors, { name: "", expanded: false }]);
  };

  const removeAuthor = (index: number) => {
    if (authors.length === 1) return;
    setAuthors(authors.filter((_, i) => i !== index));
  };

  const updateAuthor = (index: number, updates: Partial<AuthorFormData>) => {
    const newAuthors = [...authors];
    newAuthors[index] = { ...newAuthors[index], ...updates };
    setAuthors(newAuthors);
  };

  const toggleExpanded = (index: number) => {
    const newAuthors = [...authors];
    newAuthors[index] = {
      ...newAuthors[index],
      expanded: !newAuthors[index].expanded,
    };
    setAuthors(newAuthors);
  };

  return (
    <div className='space-y-6'>
      <div>
        <FormLabel>Authors *</FormLabel>
        <FormDescription>
          Add at least one author. You can add simple names or expand to include
          role and URL.
        </FormDescription>
      </div>

      <div className='space-y-4'>
        {authors.map((author, index) => (
          <div key={index} className='space-y-3 rounded-lg border p-4'>
            <div className='flex items-start gap-2'>
              <div className='flex-1 space-y-3'>
                <div className='flex items-center gap-2'>
                  <Input
                    placeholder='Author Name'
                    value={author.name}
                    onChange={(e) =>
                      updateAuthor(index, { name: e.target.value })
                    }
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() => toggleExpanded(index)}
                    title={author.expanded ? "Collapse" : "Expand"}>
                    {author.expanded ? (
                      <CaretUp className='h-4 w-4' />
                    ) : (
                      <CaretDown className='h-4 w-4' />
                    )}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() => removeAuthor(index)}
                    disabled={authors.length === 1}
                    title='Remove Author'>
                    <X className='h-4 w-4' />
                  </Button>
                </div>

                {author.expanded && (
                  <>
                    <Input
                      placeholder='Role (e.g., Artist, Developer)'
                      value={author.role || ""}
                      onChange={(e) =>
                        updateAuthor(index, { role: e.target.value })
                      }
                    />
                    <Input
                      type='url'
                      placeholder='URL (e.g., https://github.com/username)'
                      value={author.url || ""}
                      onChange={(e) =>
                        updateAuthor(index, { url: e.target.value })
                      }
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type='button' variant='outline' onClick={addAuthor}>
        <Plus className='mr-2 h-4 w-4' />
        Add Author
      </Button>

      <FormField
        control={form.control}
        name='authors'
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

export default AuthorsStep;
