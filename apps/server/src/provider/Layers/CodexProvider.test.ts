import { assert, it } from "@effect/vitest";

import {
  applyPreferredCodexDefaultModel,
  isLegacyCodexModel,
  mapCodexModelCapabilities,
  normalizeCodexRateLimits,
} from "./CodexProvider.ts";

it("keeps only the GPT-5.6 Codex family out of legacy models", () => {
  assert.deepStrictEqual(
    ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.4"].map((model) => [
      model,
      isLegacyCodexModel(model),
    ]),
    [
      ["gpt-5.6-luna", false],
      ["gpt-5.6-terra", false],
      ["gpt-5.6-sol", false],
      ["gpt-5.4", true],
    ],
  );
});

it("normalizes Codex rolling usage windows for provider-neutral clients", () => {
  const usage = normalizeCodexRateLimits(
    {
      rateLimits: {
        limitId: "codex",
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_767_268_800,
        },
        secondary: {
          usedPercent: 72,
          windowDurationMins: 10_080,
          resetsAt: 1_767_873_600,
        },
        individualLimit: {
          limit: "100",
          remainingPercent: 1,
          resetsAt: 1_767_873_600,
          used: "99",
        },
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: "12.50",
        },
      },
    },
    "2026-01-01T00:00:00.000Z",
  );

  assert.deepStrictEqual(usage, {
    windows: [
      {
        id: "codex:primary",
        label: "5-hour limit",
        usedPercent: 25,
        durationMinutes: 300,
        resetsAt: "2026-01-01T12:00:00.000Z",
      },
      {
        id: "codex:secondary",
        label: "Weekly limit",
        usedPercent: 72,
        durationMinutes: 10_080,
        resetsAt: "2026-01-08T12:00:00.000Z",
      },
    ],
    credits: {
      hasCredits: true,
      unlimited: false,
      balance: "12.50",
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

it("only exposes the Codex spend limit when rolling limits are absent or exhausted", () => {
  const normalizeWindows = (
    rateLimits: Parameters<typeof normalizeCodexRateLimits>[0]["rateLimits"],
  ) =>
    normalizeCodexRateLimits({ rateLimits }, "2026-01-01T00:00:00.000Z")?.windows.map(
      ({ label, usedPercent }) => ({ label, usedPercent }),
    );

  assert.deepStrictEqual(
    normalizeWindows({
      primary: { usedPercent: 100, windowDurationMins: 300 },
      secondary: { usedPercent: 40, windowDurationMins: 10_080 },
      individualLimit: { limit: "100", remainingPercent: 85, resetsAt: 0, used: "15" },
    }),
    [
      { label: "5-hour limit", usedPercent: 100 },
      { label: "Weekly limit", usedPercent: 40 },
      { label: "Spend limit", usedPercent: 15 },
    ],
  );
  assert.deepStrictEqual(
    normalizeWindows({
      individualLimit: { limit: "100", remainingPercent: 85, resetsAt: 0, used: "15" },
    }),
    [{ label: "Spend limit", usedPercent: 15 }],
  );
});

it("prefers labeled multi-bucket Codex usage and clamps percentages", () => {
  const usage = normalizeCodexRateLimits(
    {
      rateLimits: {},
      rateLimitsByLimitId: {
        codex: {
          limitName: "Codex",
          primary: { usedPercent: 140, windowDurationMins: 60 },
        },
        reviews: {
          limitName: "Code review",
          primary: { usedPercent: -5, windowDurationMins: 1_440 },
        },
      },
    },
    "2026-01-01T00:00:00.000Z",
  );

  assert.deepStrictEqual(
    usage?.windows.map(({ id, label, usedPercent }) => ({ id, label, usedPercent })),
    [
      { id: "codex:primary", label: "Codex · 1-hour limit", usedPercent: 100 },
      { id: "reviews:primary", label: "Code review · 1-day limit", usedPercent: 0 },
    ],
  );
});

it("maps current Codex model capability fields", () => {
  const capabilities = mapCodexModelCapabilities(
    {
      additionalSpeedTiers: [],
      defaultReasoningEffort: "super-high",
      description: "Test model",
      displayName: "GPT Test",
      hidden: false,
      id: "gpt-test",
      isDefault: true,
      model: "gpt-test",
      defaultServiceTier: "flex",
      serviceTiers: [
        {
          id: "priority",
          name: "Fast",
          description: "Lower latency responses.",
        },
        {
          id: "flex",
          name: "Flex",
          description: "Lower-cost asynchronous routing.",
        },
      ],
      supportedReasoningEfforts: [
        {
          description: "Maximum reasoning",
          reasoningEffort: "super-high",
        },
      ],
    },
    { allowFastServiceTier: true },
  );

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [{ id: "super-high", label: "super-high", isDefault: true }],
      currentValue: "super-high",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard" },
        {
          id: "priority",
          label: "Fast",
          description: "Lower latency responses.",
        },
        {
          id: "flex",
          label: "Flex",
          description: "Lower-cost asynchronous routing.",
          isDefault: true,
        },
      ],
      currentValue: "flex",
    },
  ]);
});

it("hides Fast service tiers unless the Codex setting allows them", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: ["fast"],
    defaultReasoningEffort: "medium",
    defaultServiceTier: "priority",
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "1.5x speed, increased usage",
      },
    ],
    supportedReasoningEfforts: [],
  });

  assert.deepStrictEqual(capabilities.optionDescriptors, []);
});

it("marks the most preferred available model as default", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-terra", name: "GPT-5.6-Terra", isCustom: false, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(
    models.map((model) => ({ slug: model.slug, isDefault: model.isDefault })),
    [
      { slug: "gpt-5.6-terra", isDefault: true },
      { slug: "gpt-5.4", isDefault: undefined },
    ],
  );
});

it("prefers sol over terra when both are available", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-terra", name: "GPT-5.6-Terra", isCustom: false, capabilities: null },
    { slug: "gpt-5.6-sol", name: "GPT-5.6-Sol", isCustom: false, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.6-sol");
});

it("keeps Codex's own default when no preferred model is available", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.5", name: "GPT-5.5", isCustom: false, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.4");
});

it("ignores custom models that shadow a preferred slug", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-sol", name: "gpt-5.6-sol", isCustom: true, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.4");
});
