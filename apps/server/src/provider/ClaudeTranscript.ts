import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const ContentBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("thinking"), thinking: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("tool_use"),
    id: Schema.String,
    name: Schema.String,
    input: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal("tool_result"),
    tool_use_id: Schema.String,
    content: Schema.optional(Schema.Unknown),
    is_error: Schema.optional(Schema.Boolean),
  }),
]);

const TranscriptRecord = Schema.Struct({
  type: Schema.String,
  uuid: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  gitBranch: Schema.optional(Schema.String),
  isSidechain: Schema.optional(Schema.Boolean),
  isMeta: Schema.optional(Schema.Boolean),
  customTitle: Schema.optional(Schema.String),
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(Schema.Union([Schema.String, Schema.Array(ContentBlock)])),
      stop_reason: Schema.optional(Schema.NullOr(Schema.String)),
      model: Schema.optional(Schema.String),
    }),
  ),
});

const decodeRecord = Schema.decodeUnknownOption(TranscriptRecord);

export type ClaudeTranscriptAction =
  | { readonly type: "user"; readonly text: string }
  | { readonly type: "assistant"; readonly text: string; readonly blockIndex: number }
  | { readonly type: "reasoning"; readonly text: string; readonly blockIndex: number }
  | {
      readonly type: "tool-use";
      readonly toolUseId: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool-result";
      readonly toolUseId: string;
      readonly content: unknown;
      readonly isError: boolean;
    }
  | { readonly type: "turn-end"; readonly stopReason: string }
  | { readonly type: "title"; readonly title: string };

export interface ParsedClaudeTranscriptLine {
  readonly uuid: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd?: string;
  readonly gitBranch?: string;
  readonly model?: string;
  readonly actions: ReadonlyArray<ClaudeTranscriptAction>;
}

function renderToolResult(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((value) =>
        typeof value === "object" && value !== null && "text" in value
          ? String(value.text)
          : JSON.stringify(value),
      )
      .join("\n");
  }
  return content ?? "";
}

export function parseClaudeTranscriptLine(line: string): ParsedClaudeTranscriptLine | undefined {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return undefined;
  }
  const decoded = decodeRecord(json);
  if (Option.isNone(decoded)) return undefined;
  const record = decoded.value;
  if (!record.uuid || !record.sessionId || !record.timestamp || record.isSidechain)
    return undefined;

  const actions: Array<ClaudeTranscriptAction> = [];
  if (record.type === "ai-title" && record.customTitle?.trim()) {
    actions.push({ type: "title", title: record.customTitle.trim() });
  }

  const content = record.message?.content;
  if (record.type === "user" && !record.isMeta) {
    const text =
      typeof content === "string"
        ? content
        : (content
            ?.filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n") ?? "");
    if (text.trim()) actions.push({ type: "user", text });
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          actions.push({
            type: "tool-result",
            toolUseId: block.tool_use_id,
            content: renderToolResult(block.content),
            isError: block.is_error ?? false,
          });
        }
      }
    }
  }

  if (record.type === "assistant" && Array.isArray(content)) {
    content.forEach((block, blockIndex) => {
      if (block.type === "text" && block.text.length > 0) {
        actions.push({ type: "assistant", text: block.text, blockIndex });
      } else if (block.type === "thinking" && block.thinking.length > 0) {
        actions.push({ type: "reasoning", text: block.thinking, blockIndex });
      } else if (block.type === "tool_use") {
        actions.push({
          type: "tool-use",
          toolUseId: block.id,
          name: block.name,
          input: block.input ?? {},
        });
      }
    });
    if (
      record.message?.stop_reason === "end_turn" ||
      record.message?.stop_reason === "stop_sequence"
    ) {
      actions.push({ type: "turn-end", stopReason: record.message.stop_reason });
    }
  }

  if (actions.length === 0) return undefined;
  return {
    uuid: record.uuid,
    sessionId: record.sessionId,
    timestamp: record.timestamp,
    ...(record.cwd ? { cwd: record.cwd } : {}),
    ...(record.gitBranch ? { gitBranch: record.gitBranch } : {}),
    ...(record.message?.model ? { model: record.message.model } : {}),
    actions,
  };
}
