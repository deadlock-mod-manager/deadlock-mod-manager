import { Button } from "@deadlock-mods/ui/components/button";
import { X } from "@phosphor-icons/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

type FileWithData = {
  name: string;
  path: string;
  size: number;
};

type FileUploadProps = {
  accept?: string;
  multiple?: boolean;
  files: FileWithData[];
  onFilesChange: (files: FileWithData[]) => void;
  label?: string;
  className?: string;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

export const FileUpload = ({
  accept = "*",
  multiple = false,
  files,
  onFilesChange,
  label = "Choose Files",
  className,
}: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileWithData[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file) continue;

      newFiles.push({
        name: file.name,
        path: (file as File & { path?: string }).path || file.name,
        size: file.size,
      });
    }

    if (multiple) {
      onFilesChange([...files, ...newFiles]);
    } else {
      onFilesChange(newFiles);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleRemove = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type='file'
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className='hidden'
      />
      <Button
        type='button'
        variant='outline'
        onClick={() => inputRef.current?.click()}>
        {label}
      </Button>

      {files.length > 0 && (
        <div className='space-y-2'>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className='flex items-center justify-between gap-2 rounded-md border p-2'>
              <div className='flex-1 overflow-hidden'>
                <p className='truncate text-sm font-medium'>{file.name}</p>
                <p className='text-muted-foreground text-xs'>
                  {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => handleRemove(index)}
                className='h-8 w-8 shrink-0'>
                <X className='h-4 w-4' />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
