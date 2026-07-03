import {
  AI_MODELS as AI_MODEL_VALUES,
  type AIModel,
} from "@/lib/domain-contract";

export const AI_MODELS = {
  DENSENET121: AI_MODEL_VALUES[1],
  INCEPTIONV3: AI_MODEL_VALUES[2],
  MOBILENETV2: AI_MODEL_VALUES[0],
} as const;

export type { AIModel };
