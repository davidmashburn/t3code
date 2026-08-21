import { assert, it } from "@effect/vitest";

import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import { getCodexServiceTierOptionValue } from "./codexModelOptions.ts";

it("returns the selected Codex service tier id", () => {
  const selection = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.5", [
    { id: "serviceTier", value: "flex" },
  ]);

  assert.equal(getCodexServiceTierOptionValue(selection), "flex");
});

it("drops persisted Codex Fast selections so they cannot bill a premium tier", () => {
  const fastMode = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4", [
    { id: "fastMode", value: true },
  ]);
  const fastTier = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4", [
    { id: "serviceTier", value: "fast" },
  ]);
  const priorityTier = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4", [
    { id: "serviceTier", value: "priority" },
  ]);

  assert.equal(getCodexServiceTierOptionValue(fastMode), undefined);
  assert.equal(getCodexServiceTierOptionValue(fastTier), undefined);
  assert.equal(getCodexServiceTierOptionValue(priorityTier), undefined);
});
