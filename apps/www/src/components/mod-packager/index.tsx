import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ModConfigFormValues, WizardStepProps } from "./types";
import { useWizardPersistence } from "./use-wizard-persistence";
import { useZipFiles } from "./use-zip-files";
import { type WizardStep, WizardStepper } from "./wizard-stepper";
import { UploadStep } from "./steps/upload-step";
import { BasicInfoStep } from "./steps/basic-info-step";
import { AuthorsStep } from "./steps/authors-step";
import { LayersStep } from "./steps/layers-step";
import { VariantsStep } from "./steps/variants-step";
import { DependenciesStep } from "./steps/dependencies-step";
import { AdvancedStep } from "./steps/advanced-step";
import { PreviewStep } from "./steps/preview-step";

const WizardFormSchema = z.object({
  $schema: z.string().nullable().optional(),
  schema_version: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  game_version: z.string().nullable().optional(),
  authors: z
    .array(
      z.union([
        z.string(),
        z.object({
          name: z.string(),
          role: z.string().nullable(),
          url: z.string().nullable(),
        }),
      ]),
    )
    .optional(),
  license: z.string().nullable().optional(),
  readme: z.string().nullable().optional(),
  homepage: z.string().nullable().optional(),
  repository: z.string().nullable().optional(),
  screenshots: z.array(z.string()).optional(),
  variant_groups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        default: z.string(),
        variants: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            layers: z.array(z.string()),
            preview_image: z.string().nullable(),
            screenshots: z.array(z.string()),
          }),
        ),
      }),
    )
    .optional(),
  layers: z
    .array(
      z.object({
        name: z.string(),
        priority: z.number(),
        description: z.string().nullable(),
        required: z.boolean(),
      }),
    )
    .optional(),
  metadata: z
    .object({
      tags: z.array(z.string()),
      category: z.string().nullable(),
      nsfw: z.boolean().nullable(),
    })
    .nullable()
    .optional(),
  dependencies: z
    .array(
      z.object({
        remote_id: z.string(),
        name: z.string(),
        version: z.string().nullable(),
        optional: z.boolean().nullable(),
      }),
    )
    .optional(),
  conflicts: z
    .array(
      z.object({
        remote_id: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  breaks_on_update: z.boolean().nullable().optional(),
  load_priority: z.number().nullable().optional(),
});

const STEPS: WizardStep[] = [
  {
    id: "upload",
    label: "Upload",
    description:
      "Upload your mod archive and optionally import from GameBanana",
  },
  {
    id: "basic-info",
    label: "Basic Info",
    description: "Name, version, and description",
  },
  {
    id: "authors",
    label: "Authors",
    description: "Authors, license, and metadata",
  },
  {
    id: "layers",
    label: "Layers",
    description: "Define file groupings",
  },
  {
    id: "variants",
    label: "Variants",
    description: "Define variant options",
  },
  {
    id: "dependencies",
    label: "Dependencies",
    description: "Dependencies and conflicts",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Additional settings",
  },
  {
    id: "preview",
    label: "Preview",
    description: "Review and download",
  },
];

const DEFAULT_VALUES: ModConfigFormValues = {
  $schema: "https://deadlockmods.app/v1/mod-config.json",
  schema_version: 1,
  name: null,
  display_name: null,
  version: null,
  description: null,
  game_version: null,
  authors: [],
  license: null,
  readme: null,
  homepage: null,
  repository: null,
  screenshots: [],
  variant_groups: [],
  layers: [],
  metadata: { tags: [], category: null, nsfw: null },
  dependencies: [],
  conflicts: [],
  breaks_on_update: null,
  load_priority: null,
};

export function ModPackager() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const persistence = useWizardPersistence();
  const zip = useZipFiles();

  const form = useForm<ModConfigFormValues>({
    resolver: zodResolver(WizardFormSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onChange",
  });

  const formValues = form.watch();

  useEffect(() => {
    persistence.save({
      currentStep,
      formData: formValues,
      zipFileList: zip.files,
    });
  }, [currentStep, formValues, zip.files, persistence]);

  const handleResumeDraft = useCallback(() => {
    const draft = persistence.load();
    if (!draft) return;
    form.reset(draft.formData);
    setCurrentStep(draft.currentStep);
    const restored = new Set<number>();
    for (let i = 0; i < draft.currentStep; i++) {
      restored.add(i);
    }
    setCompletedSteps(restored);
  }, [persistence, form]);

  const handleClearDraft = useCallback(() => {
    persistence.clear();
  }, [persistence]);

  const goToStep = useCallback(
    (step: number) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(currentStep);
        return next;
      });
      setCurrentStep(step);
    },
    [currentStep],
  );

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleReset = useCallback(() => {
    form.reset(DEFAULT_VALUES);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    zip.reset();
    persistence.clear();
  }, [form, zip, persistence]);

  const stepProps: WizardStepProps = {
    form,
    zipFiles: zip.files,
    onNext: handleNext,
    onBack: handleBack,
    isFirst: currentStep === 0,
    isLast: currentStep === STEPS.length - 1,
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <UploadStep
            {...stepProps}
            onZipLoad={zip.loadZip}
            zipFiles={zip.files}
            zipFileName={zip.fileName}
            zipLoading={zip.loading}
            zipError={zip.error}
            onZipReset={zip.reset}
            hasDraft={persistence.hasDraft()}
            onResumeDraft={handleResumeDraft}
            onClearDraft={handleClearDraft}
          />
        );
      case 1:
        return <BasicInfoStep {...stepProps} />;
      case 2:
        return <AuthorsStep {...stepProps} />;
      case 3:
        return <LayersStep {...stepProps} />;
      case 4:
        return <VariantsStep {...stepProps} />;
      case 5:
        return <DependenciesStep {...stepProps} />;
      case 6:
        return <AdvancedStep {...stepProps} />;
      case 7:
        return (
          <PreviewStep
            {...stepProps}
            hasZip={zip.hasZip}
            onDownloadZip={zip.downloadWithMetadata}
            onReset={handleReset}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <WizardStepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={goToStep}
        completedSteps={completedSteps}
      />
      <div className='rounded-lg border bg-card p-6'>
        <div className='mb-4'>
          <h2 className='font-semibold text-lg'>{STEPS[currentStep].label}</h2>
          <p className='text-muted-foreground text-sm'>
            {STEPS[currentStep].description}
          </p>
        </div>
        {renderStep()}
      </div>
    </div>
  );
}
