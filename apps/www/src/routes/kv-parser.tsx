import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { KvViewer } from "@/components/kv-parser/kv-viewer";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/kv-parser")({
  component: KvParserComponent,
  head: () =>
    seo({
      title: "KeyValues Parser | Deadlock Mod Manager",
      description:
        "Parse and visualize Valve KeyValues (VDF) files like gameinfo.gi",
    }),
});

const DEFAULT_CONTENT = `"GameInfo"
{
  game    "citadel"
  title   "Citadel"
  type    multiplayer_only

  FileSystem
  {
    SearchPaths
    {
      Game          citadel/pak01_dir.vpk
      Game          citadel
      Game          core
    }
  }

  ConVars
  {
    // Example console variables
    sv_cheats         "0"
    mp_tournament     "0"
  }

  // Platform-specific settings
  RenderSettings
  {
    VulkanOnly              "1"	[ $LINUX || $OSX ]
    VulkanRequireSubgroup   "1"	[ !$OSX ]
    DirectX11Support        "1"	[ $WIN32 ]
  }
}`;

function KvParserComponent() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [mode, setMode] = useState<"paste" | "upload">("paste");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) {
      toast.error("Please upload a valid file");
      return;
    }

    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setContent(text);
        toast.success(`Loaded ${file.name}`);
      } else {
        toast.error("Failed to read file as text");
      }
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
    };

    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".gi", ".txt", ".vdf", ".kv"],
    },
    multiple: false,
    maxSize: 5 * 1024 * 1024, // 5MB
  });

  const handleLoadSample = () => {
    setContent(DEFAULT_CONTENT);
    toast.success("Loaded sample gameinfo.gi");
  };

  const handleClear = () => {
    setContent("");
    toast.info("Cleared content");
  };

  return (
    <div className='container mx-auto py-8'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 font-bold font-primary text-3xl'>
            KeyValues Parser
          </h1>
          <p className='text-lg text-muted-foreground'>
            Parse and visualize Valve KeyValues (VDF) files like gameinfo.gi
          </p>
        </div>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>
                Choose how to provide your KeyValues content
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex gap-2'>
                <Button
                  onClick={() => setMode("paste")}
                  size='sm'
                  variant={mode === "paste" ? "default" : "outline"}>
                  Paste / Edit
                </Button>
                <Button
                  onClick={() => setMode("upload")}
                  size='sm'
                  variant={mode === "upload" ? "default" : "outline"}>
                  Upload File
                </Button>
                <Button
                  className='ml-auto'
                  onClick={handleLoadSample}
                  size='sm'
                  variant='secondary'>
                  Load Sample
                </Button>
                <Button onClick={handleClear} size='sm' variant='outline'>
                  Clear
                </Button>
              </div>

              {mode === "paste" ? (
                <div>
                  <textarea
                    className='w-full min-h-[300px] rounded-lg border border-muted-foreground/20 bg-muted/10 p-4 font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
                    onChange={(e) => setContent(e.target.value)}
                    placeholder='Paste your KeyValues content here...'
                    value={content}
                  />
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}>
                  <input {...getInputProps()} />
                  <div className='space-y-4'>
                    <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
                      <svg
                        className='h-6 w-6 text-muted-foreground'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'>
                        <path
                          d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                        />
                      </svg>
                    </div>
                    <div>
                      <p className='font-medium text-sm'>
                        {isDragActive
                          ? "Drop the file here"
                          : "Drop a KeyValues file here"}
                      </p>
                      <p className='text-muted-foreground text-sm'>
                        or click to browse (.gi, .vdf, .kv, .txt)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {content.trim() && <KvViewer content={content} />}
        </div>
      </div>
    </div>
  );
}
