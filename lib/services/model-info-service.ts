import { apiGet } from '@/lib/api-client';

// ============================================================
// EMATHTOCO — Model Info Service
// Fetches detailed model information from FastAPI backend.
// Endpoint: GET /models-info
// ============================================================

/** Information about a single model directory */
export interface ModelInfo {
  name: string;
  total_files: number;
}

/** Response shape from GET /models-info */
export interface ModelsInfoResponse {
  success: boolean;
  models: ModelInfo[];
  message?: string;
}

/**
 * Fetches detailed information about all registered models from the FastAPI backend.
 * Returns model names and their .h5 file counts.
 * Uses cache: 'no-store' to ensure we always query the live backend registry.
 */
export async function fetchModelsInfo(): Promise<ModelsInfoResponse> {
  try {
    const res = await apiGet('/ai-models', {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Gagal menghubungi server backend (HTTP ${res.status})`);
    }

    const rawData = await res.json();

    if (!rawData.success) {
      throw new Error(rawData.message || 'Server backend gagal memuat informasi model.');
    }

    return {
      success: true,
      models: rawData.models.map((m: any) => ({
        name: m.name,
        total_files: m.total_models
      }))
    };
  } catch (error: any) {
    console.error("AI Backend Error:", error);
    if (error instanceof TypeError || (error.message && error.message.includes("fetch"))) {
      throw new Error("Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar.");
    }
    throw error;
  }
}
