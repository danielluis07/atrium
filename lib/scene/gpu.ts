import { GPU_BENCHMARKS_PATH } from "@/lib/scene/assets";
import type { GpuClass } from "@/lib/scene/policy";

/** How long the Scene waits for detect-gpu before it settles for Lean. */
export const GPU_TIMEOUT = 1500;

/**
 * Classifies the GPU with detect-gpu against its self-hosted benchmarks, so
 * there is no third-party request. Resolves to "timeout" or "error" rather
 * than rejecting.
 */
export function classifyGpu(): Promise<GpuClass> {
  const timeout = new Promise<GpuClass>((resolve) => setTimeout(() => resolve("timeout"), GPU_TIMEOUT));
  const classify = import("detect-gpu")
    .then(({ getGPUTier }) => getGPUTier({ benchmarksURL: GPU_BENCHMARKS_PATH }))
    .then(({ tier, gpu }): GpuClass => ({ tier, gpu }))
    .catch((): GpuClass => "error");
  return Promise.race([classify, timeout]);
}
