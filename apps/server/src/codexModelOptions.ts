import type { ModelSelection } from "@t3tools/contracts";
import {
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
} from "@t3tools/shared/model";

const CODEX_FAST_SERVICE_TIER_IDS = new Set(["fast", "priority"]);

export function isCodexFastServiceTier(input: {
  readonly id: string;
  readonly name?: string;
}): boolean {
  const id = input.id.trim().toLowerCase();
  const name = input.name?.trim().toLowerCase();
  return CODEX_FAST_SERVICE_TIER_IDS.has(id) || name === "fast";
}

export function getCodexServiceTierOptionValue(
  modelSelection: ModelSelection | null | undefined,
  options?: { readonly allowFastServiceTier?: boolean },
): string | undefined {
  const selected =
    getModelSelectionStringOptionValue(modelSelection, "serviceTier") ??
    (getModelSelectionBooleanOptionValue(modelSelection, "fastMode") === true ? "fast" : undefined);
  if (!selected) {
    return undefined;
  }
  if (!options?.allowFastServiceTier && isCodexFastServiceTier({ id: selected })) {
    return undefined;
  }
  return selected;
}
