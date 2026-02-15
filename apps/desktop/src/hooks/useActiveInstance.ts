import { useInstanceStore } from "../store/instanceStore";
import type { InstanceConfig } from "../types/config";

export function useActiveInstance(): InstanceConfig | undefined {
  return useInstanceStore((s) => s.instances.find((i) => i.id === s.activeId));
}
