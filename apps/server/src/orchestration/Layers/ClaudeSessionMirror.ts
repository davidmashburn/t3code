// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  ClaudeSettings,
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  EventId,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { resolveClaudeHomePath } from "../../provider/Drivers/ClaudeHome.ts";
import {
  parseClaudeTranscriptLine,
  type ParsedClaudeTranscriptLine,
} from "../../provider/ClaudeTranscript.ts";
import { ProviderSessionDirectory } from "../../provider/Services/ProviderSessionDirectory.ts";
import { deriveProviderInstanceConfigMap } from "../../provider/Layers/ProviderInstanceRegistryHydration.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  ClaudeSessionMirror,
  type ClaudeSessionMirrorShape,
} from "../Services/ClaudeSessionMirror.ts";

const CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");
const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);

interface TranscriptState {
  readonly instanceId: ProviderInstanceId;
  readonly path: string;
  offset: number;
  threadId?: ThreadId;
  turnId?: TurnId;
  turnHasAssistantText: boolean;
  cwd?: string;
  lastAssistantUuid?: string;
  turnCount: number;
}

const stableId = (prefix: string, ...parts: ReadonlyArray<string>): string =>
  `${prefix}-${NodeCrypto.createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32)}`;

const commandId = (...parts: ReadonlyArray<string>) =>
  CommandId.make(stableId("mirror-cmd", ...parts));
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listTranscriptFiles(root: string): Promise<ReadonlyArray<string>> {
  const found: Array<string> = [];
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = NodePath.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "subagents") await visit(path);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          found.push(path);
        }
      }),
    );
  };
  await visit(root);
  return found;
}

const make = Effect.gen(function* () {
  const settingsService = yield* ServerSettingsService;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const directory = yield* ProviderSessionDirectory;
  const pathService = yield* Path.Path;
  const states = new Map<string, TranscriptState>();

  const ensureThread = Effect.fn("ClaudeSessionMirror.ensureThread")(function* (
    state: TranscriptState,
    line: ParsedClaudeTranscriptLine,
    titleSeed: string,
  ) {
    if (state.threadId) return state.threadId;
    const cwd = line.cwd ?? state.cwd;
    if (!cwd) return undefined;
    state.cwd = cwd;
    const project = yield* snapshots.getActiveProjectByWorkspaceRoot(cwd);
    if (Option.isNone(project)) return undefined;

    const threadId = ThreadId.make(stableId("claude", state.instanceId, line.sessionId));
    const createdAt = timestamp(line.timestamp);
    yield* engine.dispatch({
      type: "thread.create",
      commandId: commandId(state.instanceId, line.sessionId, "thread-create"),
      threadId,
      projectId: project.value.id,
      title: titleSeed.trim().slice(0, 100) || "Claude Code session",
      modelSelection: {
        instanceId: state.instanceId,
        model: line.model ?? DEFAULT_MODEL_BY_PROVIDER[CLAUDE_DRIVER] ?? "claude-sonnet-5",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: line.gitBranch?.trim() || null,
      worktreePath: null,
      createdAt,
    });
    yield* directory.upsert({
      threadId,
      provider: CLAUDE_DRIVER,
      providerInstanceId: state.instanceId,
      status: "stopped",
      runtimeMode: "full-access",
      resumeCursor: {
        threadId,
        resume: line.sessionId,
        ...(state.lastAssistantUuid ? { resumeSessionAt: state.lastAssistantUuid } : {}),
        turnCount: state.turnCount,
      },
      runtimePayload: {
        cwd,
        claudeTranscriptMirror: true,
        transcriptPath: state.path,
        claudeSessionId: line.sessionId,
      },
    });
    yield* engine.dispatch({
      type: "thread.session.set",
      commandId: commandId(state.instanceId, line.sessionId, "session-set"),
      threadId,
      session: {
        threadId,
        status: "ready",
        providerName: CLAUDE_DRIVER,
        providerInstanceId: state.instanceId,
        runtimeMode: "full-access",
        origin: "external",
        controlMode: "mirrored",
        activeTurnId: null,
        lastError: null,
        updatedAt: createdAt,
      },
      createdAt,
    });
    state.threadId = threadId;
    return threadId;
  });

  const ingestLine = Effect.fn("ClaudeSessionMirror.ingestLine")(function* (
    state: TranscriptState,
    line: ParsedClaudeTranscriptLine,
  ) {
    if (line.cwd) state.cwd = line.cwd;
    const firstUser = line.actions.find((action) => action.type === "user");
    const threadId = yield* ensureThread(
      state,
      line,
      firstUser?.type === "user" ? firstUser.text : "Claude Code session",
    );
    if (!threadId) return;
    const createdAt = timestamp(line.timestamp);

    for (const action of line.actions) {
      if (action.type === "user") {
        const turnId = TurnId.make(stableId("claude-turn", line.sessionId, line.uuid));
        state.turnId = turnId;
        state.turnHasAssistantText = false;
        state.turnCount += 1;
        yield* engine.dispatch({
          type: "thread.message.user.observe",
          commandId: commandId(state.instanceId, line.sessionId, line.uuid, "user"),
          threadId,
          messageId: MessageId.make(stableId("claude-message", line.uuid)),
          text: action.text,
          turnId,
          createdAt,
        });
        yield* engine.dispatch({
          type: "thread.session.set",
          commandId: commandId(state.instanceId, line.sessionId, line.uuid, "running"),
          threadId,
          session: {
            threadId,
            status: "running",
            providerName: CLAUDE_DRIVER,
            providerInstanceId: state.instanceId,
            runtimeMode: "full-access",
            origin: "external",
            controlMode: "mirrored",
            activeTurnId: turnId,
            lastError: null,
            updatedAt: createdAt,
          },
          createdAt,
        });
      } else if (action.type === "assistant" && state.turnId) {
        state.lastAssistantUuid = line.uuid;
        yield* engine.dispatch({
          type: "thread.message.assistant.delta",
          commandId: commandId(state.instanceId, line.uuid, "text", String(action.blockIndex)),
          threadId,
          messageId: MessageId.make(stableId("claude-assistant", state.turnId)),
          turnId: state.turnId,
          delta: action.text,
          createdAt,
        });
        state.turnHasAssistantText = true;
      } else if (action.type === "tool-use" && state.turnId) {
        yield* engine.dispatch({
          type: "thread.activity.append",
          commandId: commandId(state.instanceId, line.uuid, action.toolUseId, "tool-start"),
          threadId,
          activity: {
            id: EventId.make(stableId("claude-activity", action.toolUseId, "start")),
            tone: "tool",
            kind: "tool.started",
            summary: `${action.name} started`,
            payload: {
              itemType: "dynamic_tool_call",
              toolUseId: action.toolUseId,
              data: { name: action.name, input: action.input },
            },
            turnId: state.turnId,
            createdAt,
          },
          createdAt,
        });
      } else if (action.type === "tool-result" && state.turnId) {
        yield* engine.dispatch({
          type: "thread.activity.append",
          commandId: commandId(state.instanceId, line.uuid, action.toolUseId, "tool-end"),
          threadId,
          activity: {
            id: EventId.make(stableId("claude-activity", action.toolUseId, "end")),
            tone: action.isError ? "error" : "tool",
            kind: "tool.completed",
            summary: action.isError ? "Tool failed" : "Tool completed",
            payload: {
              itemType: "dynamic_tool_call",
              toolUseId: action.toolUseId,
              data: { output: action.content },
            },
            turnId: state.turnId,
            createdAt,
          },
          createdAt,
        });
      } else if (action.type === "turn-end" && state.turnId) {
        const completedTurnId = state.turnId;
        // Claude splits one assistant message across several transcript records
        // (thinking, then text, then tool calls) and stamps every one of them with
        // the message's final stop_reason. Completing on the first record would
        // publish an empty message and drop the text record that follows, so only
        // complete once the turn has actually produced text, and keep the turn open
        // for the remaining records. The next user message starts the next turn.
        if (state.turnHasAssistantText) {
          yield* engine.dispatch({
            type: "thread.message.assistant.complete",
            commandId: commandId(state.instanceId, line.uuid, "assistant-complete"),
            threadId,
            messageId: MessageId.make(stableId("claude-assistant", completedTurnId)),
            turnId: completedTurnId,
            createdAt,
          });
        }
        yield* engine.dispatch({
          type: "thread.session.set",
          commandId: commandId(state.instanceId, line.uuid, "ready"),
          threadId,
          session: {
            threadId,
            status: "ready",
            providerName: CLAUDE_DRIVER,
            providerInstanceId: state.instanceId,
            runtimeMode: "full-access",
            origin: "external",
            controlMode: "mirrored",
            activeTurnId: null,
            lastError: null,
            updatedAt: createdAt,
          },
          createdAt,
        });
      } else if (action.type === "title") {
        yield* engine.dispatch({
          type: "thread.meta.update",
          commandId: commandId(state.instanceId, line.sessionId, line.uuid, "title"),
          threadId,
          title: action.title,
        });
      }
    }

    yield* directory.upsert({
      threadId,
      provider: CLAUDE_DRIVER,
      providerInstanceId: state.instanceId,
      status: "stopped",
      resumeCursor: {
        threadId,
        resume: line.sessionId,
        ...(state.lastAssistantUuid ? { resumeSessionAt: state.lastAssistantUuid } : {}),
        turnCount: state.turnCount,
      },
    });
  });

  const scanFile = Effect.fn("ClaudeSessionMirror.scanFile")(function* (
    instanceId: ProviderInstanceId,
    path: string,
  ) {
    const key = `${instanceId}\0${path}`;
    const state = states.get(key) ?? {
      instanceId,
      path,
      offset: 0,
      turnCount: 0,
      turnHasAssistantText: false,
    };
    states.set(key, state);
    const content = yield* Effect.tryPromise(() => NodeFSP.readFile(path, "utf8"));
    if (content.length < state.offset) state.offset = 0;
    const appended = content.slice(state.offset);
    const lastNewline = appended.lastIndexOf("\n");
    if (lastNewline < 0) return;
    state.offset += lastNewline + 1;
    if (state.threadId) {
      const thread = yield* snapshots.getThreadDetailById(state.threadId);
      if (Option.isSome(thread) && thread.value.session?.controlMode === "owned") return;
    }
    const lines = appended.slice(0, lastNewline).split("\n");
    for (const rawLine of lines) {
      const line = parseClaudeTranscriptLine(rawLine);
      if (line) yield* ingestLine(state, line);
    }
  });

  const scan = Effect.fn("ClaudeSessionMirror.scan")(function* () {
    const settings = yield* settingsService.getSettings;
    const instances = deriveProviderInstanceConfigMap(settings);
    const bindings = yield* directory.listBindings();
    const nativelyOwnedSessionIds = new Set(
      bindings.flatMap((binding) => {
        const cursor = isRecord(binding.resumeCursor) ? binding.resumeCursor : undefined;
        const payload = isRecord(binding.runtimePayload) ? binding.runtimePayload : undefined;
        return typeof cursor?.resume === "string" && payload?.claudeTranscriptMirror !== true
          ? [cursor.resume]
          : [];
      }),
    );

    for (const [rawInstanceId, instance] of Object.entries(instances)) {
      if (instance.driver !== CLAUDE_DRIVER || instance.enabled === false) continue;
      const decoded = decodeClaudeSettings(instance.config ?? {});
      if (Option.isNone(decoded) || !decoded.value.enabled || !decoded.value.mirrorExternalSessions)
        continue;
      const instanceId = ProviderInstanceId.make(rawInstanceId);
      const home = yield* resolveClaudeHomePath(decoded.value).pipe(
        Effect.provideService(Path.Path, pathService),
      );
      const files = yield* Effect.tryPromise(() =>
        listTranscriptFiles(NodePath.join(home, ".claude", "projects")),
      );
      for (const path of files) {
        const sessionId = NodePath.basename(path, ".jsonl");
        if (!nativelyOwnedSessionIds.has(sessionId)) {
          yield* scanFile(instanceId, path).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Claude transcript mirror skipped a file", { path, cause }),
            ),
          );
        }
      }
    }
  });

  const start: ClaudeSessionMirrorShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      scan().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Claude transcript mirror scan failed", { cause }),
        ),
        Effect.repeat(Schedule.spaced(Duration.seconds(2))),
      ),
    );
  });

  return { start } satisfies ClaudeSessionMirrorShape;
});

export const ClaudeSessionMirrorLive = Layer.effect(
  ClaudeSessionMirror,
  make.pipe(Effect.tap((mirror) => mirror.start())),
);
