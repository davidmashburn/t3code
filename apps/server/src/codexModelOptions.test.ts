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

it("drops Fast selections unless the Codex setting allows the premium tier", () => {
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
  assert.equal(getCodexServiceTierOptionValue(fastMode, { allowFastServiceTier: true }), "fast");
  assert.equal(
    getCodexServiceTierOptionValue(priorityTier, { allowFastServiceTier: true }),
    "priority",
  );
});
