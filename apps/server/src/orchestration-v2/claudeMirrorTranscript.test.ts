import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { claudeMirrorId, readClaudeMirrorTranscript } from "./claudeMirrorTranscript.ts";

const instanceId = ProviderInstanceId.make("claudeAgent");
const record = (uuid: string, type: string, content: unknown, stop_reason?: string) =>
  JSON.stringify({
    uuid,
    type,
    sessionId: "session-1",
    cwd: "/repo",
    timestamp: "2026-10-01T00:00:00.000Z",
    message: { content, ...(stop_reason ? { stop_reason } : {}) },
  });
const user = record("user-1", "user", "Fix it");
const thinking = record(
  "thinking-1",
  "assistant",
  [{ type: "thinking", thinking: "Plan" }],
  "end_turn",
);
const answer = record("answer-1", "assistant", [{ type: "text", text: "Fixed" }], "end_turn");

describe("Claude mirror snapshots", () => {
  it("keeps split thinking and text records in one turn with stable V1 message IDs", () => {
    const partial = readClaudeMirrorTranscript(instanceId, `${user}\n${thinking}\n`)!;
    expect(partial.running).toBe(true);
    expect(partial.messages).toHaveLength(1);
    const finished = readClaudeMirrorTranscript(instanceId, `${user}\n${thinking}\n${answer}\n`)!;
    expect(finished.running).toBe(false);
    expect(finished.headId).toBe("answer-1");
    expect(
      finished.messages.map((message) => [message.role, message.text, message.streaming]),
    ).toEqual([
      ["user", "Fix it", false],
      ["assistant", "Fixed", false],
    ]);
    expect(finished.messages[1]?.id).toBe(
      claudeMirrorId("claude-assistant", claudeMirrorId("claude-turn", "session-1", "user-1")),
    );
    expect(finished.turnItems.map((item) => item.status)).toEqual(["completed", "completed"]);
  });
  it("ignores an incomplete final line and repeated records", () => {
    const pending = readClaudeMirrorTranscript(instanceId, `${user}\n${answer}`)!;
    expect(pending.running).toBe(true);
    expect(pending.messages).toHaveLength(1);
    const finished = readClaudeMirrorTranscript(instanceId, `${user}\n${answer}\n${answer}\n`)!;
    expect(finished.messages[1]?.text).toBe("Fixed");
    expect(finished.turnItems).toHaveLength(2);
  });
  it("updates a tool result without treating it as another user turn", () => {
    const tool = record("tool-1", "assistant", [
      { type: "tool_use", id: "call-1", name: "Read", input: { file_path: "a.ts" } },
    ]);
    const result = record("result-1", "user", [
      { type: "tool_result", tool_use_id: "call-1", content: "contents" },
    ]);
    const snapshot = readClaudeMirrorTranscript(
      instanceId,
      `${user}\n${tool}\n${result}\n${answer}\n`,
    )!;
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.turnItems.find((item) => item.type === "dynamic_tool")).toMatchObject({
      type: "dynamic_tool",
      toolName: "Read",
      output: "contents",
      status: "completed",
    });
  });
});
