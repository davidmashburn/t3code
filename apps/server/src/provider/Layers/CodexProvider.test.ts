import { assert, it } from "@effect/vitest";

import { mapCodexModelCapabilities, normalizeCodexRateLimits } from "./CodexProvider.ts";

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
  const capabilities = mapCodexModelCapabilities({
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
  });

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

it("uses standard routing when the catalog has no default service tier", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: ["fast"],
    defaultReasoningEffort: "medium",
    defaultServiceTier: null,
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

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        {
          id: "priority",
          label: "Fast",
          description: "1.5x speed, increased usage",
        },
      ],
      currentValue: "default",
    },
  ]);
});
