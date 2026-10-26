import { useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Effort, ModelCatalog, ModelInfo } from "@/api/runs";

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: "none", label: "None" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "X-High" },
  { id: "max", label: "Max" },
];

export const effortLabel = (effort: Effort) => EFFORTS.find((e) => e.id === effort)?.label ?? effort;

export function effortsFor(model: ModelInfo | undefined) {
  return model ? EFFORTS.filter((e) => model.efforts.includes(e.id)) : EFFORTS;
}

const rank = (e: Effort) => EFFORTS.findIndex((x) => x.id === e);

export function closestEffort(model: ModelInfo | undefined, wanted: Effort): Effort {
  if (!model || model.efforts.includes(wanted)) return wanted;
  const below = model.efforts.filter((e) => rank(e) <= rank(wanted));
  return below.at(-1) ?? model.efforts[0] ?? wanted;
}

export type ModelRole = "planner" | "worker";
export const ROLE_LABELS: Record<ModelRole, string> = { planner: "Planner", worker: "Workers" };

type RoleStore = {
  model?: string;
  efforts: Record<string, Effort>;
};

const useStoredChoice = create<{
  planner: RoleStore;
  worker: RoleStore;
  setModel: (role: ModelRole, model: string) => void;
  setEffort: (role: ModelRole, model: string, effort: Effort) => void;
}>()(
  persist(
    (set) => ({
      planner: { efforts: {} },
      worker: { efforts: {} },
      setModel: (role, model) => set((s) => ({ [role]: { ...s[role], model } })),
      setEffort: (role, model, effort) =>
        set((s) => ({ [role]: { ...s[role], efforts: { ...s[role].efforts, [model]: effort } } })),
    }),
    {
      name: "ultrawork.model-choice",
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          const old = (persisted ?? {}) as Partial<RoleStore>;
          const role: RoleStore = { model: old.model, efforts: old.efforts ?? {} };
          return { planner: role, worker: { ...role, efforts: { ...role.efforts } } };
        }
        return persisted as { planner: RoleStore; worker: RoleStore };
      },
    },
  ),
);

export type RoleChoice = {
  role: ModelRole;
  model: string;
  effort: Effort;
  effortFor: (modelId: string) => Effort;
  setModel: (modelId: string) => void;
  setEffort: (effort: Effort) => void;
};

export type ModelChoice = {
  available: ModelInfo[];
  planner: RoleChoice;
  worker: RoleChoice;
  verifier: boolean;
  setVerifier: (on: boolean) => void;
};

export function useModelChoice(catalog: ModelCatalog | undefined): ModelChoice {
  const stored = useStoredChoice();
  const [verifier, setVerifier] = useState<boolean | undefined>(undefined);

  const available = catalog?.models.filter((m) => m.available) ?? [];
  const usable = (id?: string) => (id && available.some((m) => m.id === id) ? id : undefined);

  const roleChoice = (role: ModelRole): RoleChoice => {
    const own = stored[role];
    const model = usable(own.model) ?? usable(catalog?.defaults[role]) ?? available[0]?.id ?? "";
    const configured = catalog?.defaults[role === "planner" ? "plannerEffort" : "workerEffort"];
    const defaultEffort: Effort = configured && configured !== "off" ? configured : "high";
    const effortFor = (id: string) => {
      const info = catalog?.models.find((m) => m.id === id);
      return closestEffort(info, own.efforts[id] ?? info?.defaultEffort ?? defaultEffort);
    };
    return {
      role,
      model,
      effort: effortFor(model),
      effortFor,
      setModel: (id) => stored.setModel(role, id),
      setEffort: (effort) => stored.setEffort(role, model, effort),
    };
  };

  return {
    available,
    planner: roleChoice("planner"),
    worker: roleChoice("worker"),
    verifier: verifier ?? catalog?.defaults.verifier ?? false,
    setVerifier,
  };
}
