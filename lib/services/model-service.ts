import { apiGet } from '@/lib/api-client';

export interface AvailableModelsResponse {
  success: boolean;
  total_models: number;
  models: string[];
  message?: string;
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

    const rawData = await res.json();
    
    if (!rawData.success) {
      throw new Error(rawData.message || 'Server backend gagal memuat model.');
    }

    return {
      success: true,
      total_models: rawData.models.length,
      models: rawData.models.map((m: any) => m.name)
    };
  } catch (error: any) {
    console.error("AI Backend Error:", error);
    if (error instanceof TypeError || (error.message && error.message.includes("fetch"))) {
      throw new Error("Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar.");
    }
    throw error;
  }
}
