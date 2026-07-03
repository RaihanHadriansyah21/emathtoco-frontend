import { logger } from '@/lib/logger';
import { apiGet } from '@/lib/api-client';

export interface AvailableModelsResponse {
  success: boolean;
  total_models: number;
  models: string[];
  message?: string;
}

interface AvailableModelsApiResponse {
  success: boolean;
  message?: string;
  models: Array<{ name: string }>;
}

/**
 * Fetches the list of available models from the FastAPI backend.
 * Uses cache: 'no-store' to ensure we always query the live backend registry.
 */
export async function fetchAvailableModels(): Promise<AvailableModelsResponse> {
  try {
    const res = await apiGet('/ai-models', {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Gagal menghubungi server backend (HTTP ${res.status})`);
    }

    const rawData = await res.json() as AvailableModelsApiResponse;
    
    if (!rawData.success) {
      throw new Error(rawData.message || 'Server backend gagal memuat model.');
    }

    return {
      success: true,
      total_models: rawData.models.length,
      models: rawData.models.map((model) => model.name)
    };
  } catch (error: unknown) {
    logger.error("AI Backend Error:", error);
    if (
      error instanceof TypeError
      || (error instanceof Error && error.message.includes("fetch"))
    ) {
      throw new Error("Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar.");
    }
    throw error;
  }
}
