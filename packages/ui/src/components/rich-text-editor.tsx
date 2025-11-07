"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export const RichTextEditor = React.forwardRef<
  HTMLDivElement,
  RichTextEditorProps
>(({ content, onChange, placeholder, className, minHeight = "200px" }, ref) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "min-h-[200px] px-4 py-3",
        ),
      },
    },
  });

  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-md border border-input bg-background",
        className,
      )}
      style={{ minHeight }}>
      <div className='flex items-center gap-1 border-b border-input p-2'>
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleBold().run()}
          size='sm'
          variant={editor.isActive("bold") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <strong className='text-xs'>B</strong>
        </Button>
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size='sm'
          variant={editor.isActive("italic") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <em className='text-xs'>I</em>
        </Button>
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleStrike().run()}
          size='sm'
          variant={editor.isActive("strike") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs line-through'>S</span>
        </Button>
        <div className='mx-1 h-4 w-px bg-border' />
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size='sm'
          variant={editor.isActive("bulletList") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs'>•</span>
        </Button>
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          size='sm'
          variant={editor.isActive("orderedList") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs'>1.</span>
        </Button>
        <div className='mx-1 h-4 w-px bg-border' />
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          size='sm'
          variant={editor.isActive("heading", { level: 2 }) ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs font-bold'>H2</span>
        </Button>
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          size='sm'
          variant={editor.isActive("heading", { level: 3 }) ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs font-bold'>H3</span>
        </Button>
        <div className='mx-1 h-4 w-px bg-border' />
        <Button
          type='button'
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          size='sm'
          variant={editor.isActive("blockquote") ? "default" : "ghost"}
          className='h-7 w-7 p-0'>
          <span className='text-xs'>"</span>
        </Button>
        <Button
          type='button'
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          size='sm'
          variant='ghost'
          className='h-7 w-7 p-0'>
          <span className='text-xs'>─</span>
        </Button>
      </div>
      <div className='relative'>
        <EditorContent editor={editor} />
        {placeholder && editor.isEmpty && (
          <div className='pointer-events-none absolute left-4 top-3 text-muted-foreground text-sm'>
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
});

RichTextEditor.displayName = "RichTextEditor";

