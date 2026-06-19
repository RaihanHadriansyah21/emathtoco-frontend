export const AI_MODELS = {
  DENSENET121: "DenseNet121",
  INCEPTIONV3: "InceptionV3",
  MOBILENETV2: "MobileNetV2",
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];
