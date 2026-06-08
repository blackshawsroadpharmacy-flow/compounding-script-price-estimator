/**
 * Lightweight in-memory quote state shared across the six step screens for a
 * single quote draft. Not persisted between page reloads in Phase 1.
 */
import { create } from "zustand";
import type { BomLine, PackagingLine } from "@/lib/pricing";

export interface FormulationDraft {
  prescriptionText: string;
  dosageForm: string;
  quantity: number;
  quantityUnit: string;
  taxable: boolean;
  makeMinutes: number; // form default, overridable
  bom: BomLine[];
  packaging: PackagingLine[];
  difficultyTags: { tag: string; multiplier: number }[];
  markupOverride?: number;
  hourlyRateOverride?: number;
  prepMinutesOverride?: number;
  notes: string;
  aiInterpreted: boolean;
}

const empty: FormulationDraft = {
  prescriptionText: "",
  dosageForm: "cream",
  quantity: 50,
  quantityUnit: "g",
  taxable: false,
  makeMinutes: 25,
  bom: [],
  packaging: [],
  difficultyTags: [{ tag: "standard", multiplier: 1.0 }],
  notes: "",
  aiInterpreted: false,
};

interface QuoteState {
  step: number;
  setStep: (n: number) => void;
  draft: FormulationDraft;
  update: (patch: Partial<FormulationDraft>) => void;
  reset: () => void;
}

import { createStore, useStore } from "zustand";

const store = createStore<QuoteState>((set) => ({
  step: 1,
  setStep: (n) => set({ step: n }),
  draft: empty,
  update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ step: 1, draft: empty }),
}));

export function useQuote<T>(selector: (s: QuoteState) => T) {
  return useStore(store, selector);
}

export const quoteStore = store;

// Placeholder to satisfy the `create` import (we use createStore instead). Kept
// so removing zustand's create import doesn't break tree-shaking in some setups.
void create;
