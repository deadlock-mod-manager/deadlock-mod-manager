import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { Form } from "@deadlock-mods/ui/components/form";
import { defineStepper } from "@deadlock-mods/ui/components/stepper";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePersistedStore } from "@/lib/store";
import { authorsSchema } from "./schemas/authors";
import { basicInfoSchema } from "./schemas/basic-info";
import { layersSchema } from "./schemas/layers";
import { variantGroupsSchema } from "./schemas/variants";
import AuthorsStep from "./steps/authors";
import BasicInfoStep from "./steps/basic-info";
import LayersStep from "./steps/layers";
import ReviewStep from "./steps/review";
import VariantsStep from "./steps/variants";

const { useStepper, Stepper } = defineStepper(
  {
    id: "basic-info",
    title: "Basic Information",
    schema: basicInfoSchema,
  },
  {
    id: "authors",
    title: "Authors",
    schema: authorsSchema,
  },
  {
    id: "layers",
    title: "Layers",
    schema: layersSchema,
  },
  {
    id: "variants",
    title: "Variants",
    schema: variantGroupsSchema,
  },
  {
    id: "review",
    title: "Review",
    schema: z.any(),
  },
);

const PackagingWizardContent = () => {
  const stepper = useStepper();
  const {
    basicInfo,
    authors,
    layers,
    variantGroups,
    updateBasicInfo,
    updateAuthors,
    updateLayers,
    updateVariantGroups,
    resetWizard,
  } = usePersistedStore();

  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(stepper.current.schema),
    defaultValues: {},
  });

  useEffect(() => {
    if (stepper.current.id === "basic-info" && basicInfo) {
      form.reset({
        name: basicInfo.name || "",
        displayName: basicInfo.displayName || "",
        version: basicInfo.version || "",
        description: basicInfo.description || "",
        gameVersion: basicInfo.gameVersion || "",
        license: basicInfo.license || "",
        homepage: basicInfo.homepage || "",
        repository: basicInfo.repository || "",
        readme: basicInfo.readme || "",
        screenshots: basicInfo.screenshots || [],
      });
    } else if (stepper.current.id === "authors" && authors.length > 0) {
      form.reset({ authors });
    } else if (stepper.current.id === "layers" && layers.length > 0) {
      form.reset({ layers });
    } else if (stepper.current.id === "variants" && variantGroups.length > 0) {
      form.reset({ variant_groups: variantGroups });
    }
  }, [stepper.current.id, basicInfo, authors, layers, variantGroups, form]);

  const onSubmit = async (values: z.infer<typeof stepper.current.schema>) => {
    if (stepper.current.id === "basic-info") {
      updateBasicInfo(values as NonNullable<typeof basicInfo>);
    } else if (stepper.current.id === "authors") {
      updateAuthors(values.authors);
    } else if (stepper.current.id === "layers") {
      updateLayers(values.layers);
    } else if (stepper.current.id === "variants") {
      updateVariantGroups(values.variant_groups || []);
    }

    if (stepper.isLast) {
      return;
    }

    stepper.next();
  };

  return (
    // @ts-expect-error - ignore type error - version are correct
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <Stepper.Navigation>
          {stepper.all.map((step) => (
            <Stepper.Step
              key={step.id}
              of={step.id}
              type={step.id === stepper.current.id ? "submit" : "button"}
              onClick={async () => {
                const valid = await form.trigger();
                if (!valid) return;
                stepper.goTo(step.id);
              }}>
              <Stepper.Title>{step.title}</Stepper.Title>
            </Stepper.Step>
          ))}
        </Stepper.Navigation>

        <Card>
          <CardContent className='py-4 h-full overflow-y-auto max-h-[calc(100vh-350px)]'>
            {stepper.switch({
              "basic-info": () => <BasicInfoStep />,
              authors: () => <AuthorsStep />,
              variants: () => <VariantsStep />,
              layers: () => <LayersStep />,
              review: () => <ReviewStep />,
            })}

            {!stepper.isLast ? (
              <div className='flex justify-end gap-4'>
                <Button
                  variant='secondary'
                  onClick={stepper.prev}
                  disabled={stepper.isFirst}>
                  Back
                </Button>
                <Button type='submit'>Next</Button>
              </div>
            ) : (
              <div className='flex justify-end gap-4'>
                <Button
                  variant='secondary'
                  onClick={() => {
                    resetWizard();
                    stepper.reset();
                    form.reset();
                  }}>
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </Form>
  );
};

const PackagingWizard = () => {
  return (
    <Stepper.Provider variant='horizontal'>
      <PackagingWizardContent />
    </Stepper.Provider>
  );
};

export default PackagingWizard;
