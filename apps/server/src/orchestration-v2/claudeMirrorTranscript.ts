// @effect-diagnostics-next-line nodeBuiltinImport:off -- Synchronous IDs must match the existing V1 SHA-256 identities.
import * as NodeCrypto from "node:crypto";
import {
  MessageId,
  ProviderDriverKind,
  ThreadId,
  TurnItemId,
  type ProviderInstanceId,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { deriveProviderThread } from "@t3tools/provider-core/server/IdAllocator";
import { parseClaudeTranscriptLine } from "../provider/ClaudeTranscript.ts";

// Keep the V1 identities: upgrading must update existing mirrored messages, not duplicate them.
export const claudeMirrorId = (prefix: string, ...parts: ReadonlyArray<string>): string =>
  `${prefix}-${NodeCrypto.createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32)}`;

export function claudeExternalProviderThread(input: {
  instanceId: ProviderInstanceId;
  threadId: ThreadId;
  sessionId: string;
  now: DateTime.Utc;
  headId?: string;
}): OrchestrationV2ProviderThread {
  const driver = ProviderDriverKind.make("claudeAgent");
  return {
    id: deriveProviderThread({
      driver,
      providerInstanceId: input.instanceId,
      nativeThreadId: input.sessionId,
    }),
    driver,
    providerInstanceId: input.instanceId,
    providerSessionId: null,
    appThreadId: input.threadId,
    ownerNodeId: null,
    nativeThreadRef: { driver, nativeId: input.sessionId, strength: "strong" },
    nativeConversationHeadRef: input.headId
      ? { driver, nativeId: input.headId, strength: "strong" }
      : null,
    status: "not_loaded",
    firstRunOrdinal: null,
    lastRunOrdinal: null,
    handoffIds: [],
    forkedFrom: null,
    contextUsage: null,
    nativeMetadata: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function readClaudeMirrorTranscript(instanceId: ProviderInstanceId, content: string) {
  // Ignore a partially written final JSON record until the writer finishes its newline.
  const lines = content
    .slice(0, content.lastIndexOf("\n") + 1)
    .split("\n")
    .flatMap((raw) => {
      const line = parseClaudeTranscriptLine(raw);
      return line ? [line] : [];
    });
  const first = lines[0];
  if (!first) return undefined;
  const threadId = ThreadId.make(claudeMirrorId("claude", instanceId, first.sessionId));
  const messages = new Map<MessageId, OrchestrationV2ConversationMessage>();
  const items = new Map<TurnItemId, OrchestrationV2TurnItem>();
  let turnId: string | undefined;
  let cwd: string | undefined;
  let model: string | undefined;
  let branch: string | undefined;
  let title: string | undefined;
  let headId: string | undefined;
  let running = false;
  let ordinal = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.sessionId !== first.sessionId) continue;
    cwd = line.cwd ?? cwd;
    model = line.model ?? model;
    branch = line.gitBranch ?? branch;
    const now = DateTime.makeUnsafe(line.timestamp);
    const baseItem = (id: TurnItemId) => ({
      id,
      threadId,
      runId: null,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: items.get(id)?.ordinal ?? ++ordinal,
      status: "running" as const,
      title: null,
      startedAt: items.get(id)?.startedAt ?? now,
      completedAt: null,
      updatedAt: now,
    });
    for (const action of line.actions) {
      const actionKey = `${line.uuid}:${action.type}:${"blockIndex" in action ? action.blockIndex : "toolUseId" in action ? action.toolUseId : ""}`;
      if (seen.has(actionKey)) continue;
      seen.add(actionKey);
      if (action.type === "user") {
        turnId = claudeMirrorId("claude-turn", first.sessionId, line.uuid);
        running = true;
        title ??= action.text.trim().slice(0, 100);
        const id = MessageId.make(claudeMirrorId("claude-message", line.uuid));
        messages.set(id, {
          id,
          threadId,
          runId: null,
          nodeId: null,
          role: "user",
          text: action.text,
          attachments: [],
          streaming: false,
          createdAt: now,
          updatedAt: now,
          createdBy: "user",
          creationSource: "server",
        });
        const itemId = TurnItemId.make(`claude-mirror:${id}`);
        items.set(itemId, {
          ...baseItem(itemId),
          type: "user_message",
          messageId: id,
          text: action.text,
          attachments: [],
          inputIntent: "turn_start",
          status: "completed",
          completedAt: now,
          createdBy: "user",
          creationSource: "server",
        });
      } else if (action.type === "assistant" && turnId) {
        headId = line.uuid;
        const id = MessageId.make(claudeMirrorId("claude-assistant", turnId));
        const previous = messages.get(id);
        const text = (previous?.text ?? "") + action.text;
        messages.set(id, {
          id,
          threadId,
          runId: null,
          nodeId: null,
          role: "assistant",
          text,
          attachments: [],
          streaming: running,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          createdBy: "agent",
          creationSource: "server",
        });
        const itemId = TurnItemId.make(`claude-mirror:${id}`);
        items.set(itemId, {
          ...baseItem(itemId),
          type: "assistant_message",
          messageId: id,
          text,
          streaming: running,
          status: running ? "running" : "completed",
          completedAt: running ? null : now,
        });
      } else if (action.type === "tool-use" && turnId) {
        const id = TurnItemId.make(
          claudeMirrorId("claude-tool", first.sessionId, action.toolUseId),
        );
        items.set(id, {
          ...baseItem(id),
          type: "dynamic_tool",
          toolName: action.name,
          input: action.input,
        });
      } else if (action.type === "tool-result" && turnId) {
        const id = TurnItemId.make(
          claudeMirrorId("claude-tool", first.sessionId, action.toolUseId),
        );
        const previous = items.get(id);
        if (previous?.type === "dynamic_tool")
          items.set(id, {
            ...previous,
            output: action.content,
            status: action.isError ? "failed" : "completed",
            completedAt: now,
            updatedAt: now,
          });
      } else if (action.type === "turn-end" && turnId) {
        // Thinking and text records can both carry end_turn. Retain the turn identity so
        // the later text is kept even when the first record contained no assistant text.
        const id = MessageId.make(claudeMirrorId("claude-assistant", turnId));
        const message = messages.get(id);
        if (!message) continue;
        running = false;
        if (message) messages.set(id, { ...message, streaming: false, updatedAt: now });
        const itemId = TurnItemId.make(`claude-mirror:${id}`);
        const item = items.get(itemId);
        if (item?.type === "assistant_message")
          items.set(itemId, {
            ...item,
            streaming: false,
            status: "completed",
            completedAt: now,
            updatedAt: now,
          });
      } else if (action.type === "title") title = action.title;
    }
  }
  return {
    threadId,
    sessionId: first.sessionId,
    cwd,
    model,
    branch,
    title,
    headId,
    running,
    createdAt: DateTime.makeUnsafe(first.timestamp),
    messages: [...messages.values()],
    turnItems: [...items.values()],
  };
}
