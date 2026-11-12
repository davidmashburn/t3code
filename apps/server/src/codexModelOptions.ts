import type { ModelSelection } from "@t3tools/contracts";
import {
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
} from "@t3tools/shared/model";

const CodexFastServiceTier = {
  Fast: "fast",
  Priority: "priority",
  Ultrafast: "ultrafast",
} as const;
type CodexFastServiceTier = (typeof CodexFastServiceTier)[keyof typeof CodexFastServiceTier];

function parseCodexFastServiceTier(id: string): CodexFastServiceTier | undefined {
  switch (id.trim().toLowerCase()) {
    case CodexFastServiceTier.Fast:
      return CodexFastServiceTier.Fast;
    case CodexFastServiceTier.Priority:
      return CodexFastServiceTier.Priority;
    case CodexFastServiceTier.Ultrafast:
      return CodexFastServiceTier.Ultrafast;
    default:
      return undefined;
  }
}

export function isCodexFastServiceTier(input: {
  readonly id: string;
  readonly name?: string;
}): boolean {
  const name = input.name?.trim().toLowerCase();
  return parseCodexFastServiceTier(input.id) !== undefined || name === CodexFastServiceTier.Fast;
}

export function getCodexServiceTierOptionValue(
  modelSelection: ModelSelection | null | undefined,
  options?: { readonly allowFastServiceTier?: boolean },
): string | undefined {
  const selected =
    getModelSelectionStringOptionValue(modelSelection, "serviceTier") ??
    (getModelSelectionBooleanOptionValue(modelSelection, "fastMode") === true
      ? CodexFastServiceTier.Fast
      : undefined);
  if (selected === undefined) {
    return undefined;
  }
  if (!options?.allowFastServiceTier && isCodexFastServiceTier({ id: selected })) {
    return undefined;
  }
  return selected;
}
