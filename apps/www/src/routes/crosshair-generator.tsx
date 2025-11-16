import {
  BACKGROUND_LABELS,
  BACKGROUND_PATHS,
  type BackgroundKey,
} from "@deadlock-mods/crosshair/backgrounds";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";
import { decodeURLToConfig } from "@deadlock-mods/crosshair/url-encoder";
import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CrosshairCanvas } from "@/components/crosshair/crosshair-canvas";
import { CrosshairControls } from "@/components/crosshair/crosshair-controls";
import {
  ExportButton,
  ShareButton,
} from "@/components/crosshair/export-button";

export const Route = createFileRoute("/crosshair-generator")({
  component: CrosshairGeneratorPage,
  validateSearch: (search: Record<string, unknown>): { edit?: string } => {
    return {
      edit: typeof search.edit === "string" ? search.edit : undefined,
    };
  },
});

function CrosshairGeneratorPage() {
  const search = useSearch({ from: "/crosshair-generator" });
  const navigate = useNavigate();
  const [config, setConfig] = useState<CrosshairConfig>(
    DEFAULT_CROSSHAIR_CONFIG,
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [background, setBackground] = useState<BackgroundKey>("bg1");

  useEffect(() => {
    if (search.edit) {
      const urlParams = new URLSearchParams(`edit=${search.edit}`);
      const decodedConfig = decodeURLToConfig(urlParams);
      if (decodedConfig) {
        setConfig(decodedConfig);
        setIsEditMode(true);
      }
    }
  }, [search.edit]);

  const handleConfigChange = (newConfig: CrosshairConfig) => {
    setConfig(newConfig);
    if (isEditMode) {
      setIsEditMode(false);
      navigate({
        to: "/crosshair-generator",
        search: {},
      });
    }
  };

  return (
    <div className='container mx-auto px-4 py-8'>
      {isEditMode && (
        <Alert className='mb-6'>
          <AlertDescription>
            You're editing a shared crosshair. Any changes will create a new
            configuration.
          </AlertDescription>
        </Alert>
      )}

      <div className='mb-8'>
        <h1 className='text-4xl font-bold mb-2'>Crosshair Generator</h1>
        <p className='text-muted-foreground'>
          Create and customize your Deadlock crosshair
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        <div className='lg:col-span-1'>
          <div className='sticky top-4 space-y-6'>
            <CrosshairControls config={config} onChange={handleConfigChange} />

            <div className='flex gap-2'>
              <ExportButton config={config} className='flex-1' />
              <ShareButton config={config} className='flex-1' />
            </div>
          </div>
        </div>

        <div className='lg:col-span-2'>
          <div className='sticky top-4'>
            <div className='rounded-lg border bg-card p-6'>
              <div className='flex justify-between items-center mb-4'>
                <h2 className='text-2xl font-semibold'>Preview</h2>
                <div className='flex gap-2'>
                  <Button
                    variant={background === null ? "default" : "outline"}
                    size='sm'
                    onClick={() => setBackground(null)}>
                    None
                  </Button>
                  {Object.keys(BACKGROUND_PATHS).map((key) => {
                    const bgKey = key as NonNullable<BackgroundKey>;
                    return (
                      <Button
                        key={key}
                        variant={background === bgKey ? "default" : "outline"}
                        size='sm'
                        onClick={() => setBackground(bgKey)}>
                        {BACKGROUND_LABELS[bgKey]}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className='bg-zinc-800 rounded-lg overflow-hidden'>
                <CrosshairCanvas
                  config={config}
                  interactive
                  background={background ?? undefined}
                />
              </div>
              <p className='text-sm text-muted-foreground mt-4'>
                Move your mouse over the preview to see how the crosshair
                behaves in-game.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
