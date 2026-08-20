import { describe, expect, it } from "@effect/vitest";
import { parseClaudeTranscriptLine } from "./ClaudeTranscript.ts";

describe("parseClaudeTranscriptLine", () => {
  it("normalizes user and assistant transcript records", () => {
    expect(
      parseClaudeTranscriptLine(
        JSON.stringify({
          type: "user",
          uuid: "user-1",
          sessionId: "session-1",
          timestamp: "2026-07-31T12:00:00.000Z",
          cwd: "/repo",
          message: { content: "Build it" },
        }),
      )?.actions,
    ).toEqual([{ type: "user", text: "Build it" }]);

    expect(
      parseClaudeTranscriptLine(
        JSON.stringify({
          type: "assistant",
          uuid: "assistant-1",
          sessionId: "session-1",
          timestamp: "2026-07-31T12:00:01.000Z",
          message: {
            content: [
              { type: "thinking", thinking: "Plan" },
              { type: "text", text: "Done" },
            ],
            stop_reason: "end_turn",
          },
        }),
      )?.actions,
    ).toEqual([
      { type: "reasoning", text: "Plan", blockIndex: 0 },
      { type: "assistant", text: "Done", blockIndex: 1 },
      { type: "turn-end", stopReason: "end_turn" },
    ]);
  });

  it("ignores sidechains, metadata prompts, and partial JSON", () => {
    expect(parseClaudeTranscriptLine("{")).toBeUndefined();
    expect(
      parseClaudeTranscriptLine(
        JSON.stringify({
          type: "user",
          uuid: "user-1",
          sessionId: "session-1",
          timestamp: "2026-07-31T12:00:00.000Z",
          isSidechain: true,
          message: { content: "hidden" },
        }),
      ),
    ).toBeUndefined();
  });
});
