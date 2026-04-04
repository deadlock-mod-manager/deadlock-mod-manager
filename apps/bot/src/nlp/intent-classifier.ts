import { singleton } from "tsyringe";
import { pipeline, ZeroShotClassificationPipeline } from "@xenova/transformers";
import { z } from "zod";

const MODEL_ID = "Xenova/bart-large-mnli";

export const INTENT_LABELS = [
  "help request",
  "bug report",
  "feature request",
  "commission request",
  "mod showcase",
  "modding question",
  "linux support",
  "error or crash log",
  "other",
] as const;

export type IntentLabel = (typeof INTENT_LABELS)[number];

const intentLabelSchema = z.enum(INTENT_LABELS);

const numberArrayFromScores = z.preprocess((val) => {
  if (val instanceof Float32Array || val instanceof Float64Array) {
    return Array.from(val);
  }
  return val;
}, z.array(z.number()));

const classificationOutputSchema = z
  .union([
    z.object({
      sequence: z.string(),
      labels: z.array(intentLabelSchema),
      scores: numberArrayFromScores,
    }),
    z.array(
      z.object({
        sequence: z.string(),
        labels: z.array(intentLabelSchema),
        scores: numberArrayFromScores,
      }),
    ),
  ])
  .transform((val) => (Array.isArray(val) ? val[0] : val));

export interface IntentClassificationResult {
  sequence: string;
  labels: IntentLabel[];
  scores: number[];
}

@singleton()
export class IntentClassifier {
  private classifier: ZeroShotClassificationPipeline | null = null;
  private loadPromise: Promise<ZeroShotClassificationPipeline> | null = null;

  private loadClassifier(): Promise<ZeroShotClassificationPipeline> {
    if (this.classifier) {
      return Promise.resolve(this.classifier);
    }
    if (!this.loadPromise) {
      this.loadPromise = pipeline("zero-shot-classification", MODEL_ID)
        .then((instance) => {
          this.classifier = instance;
          return instance;
        })
        .catch((error) => {
          this.loadPromise = null;
          throw error;
        });
    }
    return this.loadPromise;
  }

  async initialize(): Promise<void> {
    await this.loadClassifier();
  }

  async classify(message: string): Promise<IntentClassificationResult> {
    const classifier = await this.loadClassifier();
    const raw = await classifier(message, [...INTENT_LABELS]);
    return classificationOutputSchema.parse(raw);
  }
}
