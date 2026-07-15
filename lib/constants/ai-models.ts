import {
  AI_MODELS as AI_MODEL_VALUES,
  type AIModel,
} from "@/lib/domain-contract";

export const AI_MODELS = {
  DENSENET121: AI_MODEL_VALUES[1],
  INCEPTIONV3: AI_MODEL_VALUES[2],
  MOBILENETV2: AI_MODEL_VALUES[0],
} as const;

export const AI_MODEL_OPTIONS: Record<
  AIModel,
  {
    label: string;
    description: string;
  }
> = {
  MobileNetV2: {
    label: "MobileNetV2 (efisien untuk inferensi)",
    description: "Arsitektur CNN ringan berbasis depthwise separable convolution.",
  },
  DenseNet121: {
    label: "DenseNet121 (reuse fitur bertingkat)",
    description: "Arsitektur CNN dengan koneksi dense untuk memanfaatkan fitur antar-layer.",
  },
  InceptionV3: {
    label: "InceptionV3 (fitur multi-skala)",
    description: "Arsitektur CNN dengan blok inception untuk membaca fitur pada beberapa skala.",
  },
};

export type { AIModel };
