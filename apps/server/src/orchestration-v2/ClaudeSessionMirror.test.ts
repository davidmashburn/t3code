import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as TestClock from "effect/testing/TestClock";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ServerSettings from "../serverSettings.ts";
import { ClaudeProviderCapabilitiesV2 } from "./Adapters/ClaudeAdapterV2.ts";
import * as ClaudeSessionMirror from "./ClaudeSessionMirror.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as LegacyImporter from "./legacy/LegacyV1ThreadImporter.ts";
import { claudeMirrorId } from "./claudeMirrorTranscript.ts";

const instanceId = ProviderInstanceId.make("claudeAgent");
const modelSelection = { instanceId, model: "claude-sonnet-5" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  getCapabilities: () => Effect.succeed(ClaudeProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("The mirror must never open a provider session"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProjectStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "claude-mirror" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

it.effect(
  "mirrors only external top-level sessions, follows appends, and enforces takeover and release",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ prefix: "t3-claude-mirror-test-" }),
        (directory) => fs.remove(directory, { recursive: true, force: true }).pipe(Effect.orDie),
      );
      const workspace = path.join(home, "workspace");
      const transcripts = path.join(home, "projects", "workspace");
      yield* fs.makeDirectory(path.join(transcripts, "session-1", "subagents"), {
        recursive: true,
      });
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const projects = yield* ProjectStore.ProjectStoreV2;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project:claude-mirror");
      yield* projects.apply({
        sequence: 1,
        eventId: EventId.make("mirror-project"),
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: "2026-10-01T00:00:00.000Z",
        commandId: null,
        causationEventId: null,
        correlationId: null,
        metadata: {},
        type: "project.created",
        payload: {
          projectId,
          title: "Mirror fixture",
          workspaceRoot: workspace,
          defaultModelSelection: modelSelection,
          scripts: [],
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      });
      const record = (
        sessionId: string,
        uuid: string,
        type: string,
        content: unknown,
        stop_reason?: string,
      ) =>
        JSON.stringify({
          sessionId,
          uuid,
          type,
          cwd: workspace,
          timestamp: uuid.endsWith("-2") ? "2026-10-02T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
          message: { content, ...(stop_reason ? { stop_reason } : {}) },
        }) + "\n";
      const first = record("session-1", "user-1", "user", "Please fix it");
      const finish = record(
        "session-1",
        "assistant-1",
        "assistant",
        [{ type: "text", text: "Fixed" }],
        "end_turn",
      );
      const transcript = path.join(transcripts, "session-1.jsonl");
      yield* fs.writeFileString(transcript, first);
      yield* fs.writeFileString(
        path.join(transcripts, "session-1", "subagents", "agent.jsonl"),
        record("subagent-1", "sub-user", "user", "Hidden"),
      );
      yield* fs.writeFileString(
        path.join(transcripts, "native-v1.jsonl"),
        record("native-v1", "native-user", "user", "Already owned"),
      );
      yield* sql`INSERT INTO provider_session_runtime (thread_id, provider_name, adapter_key, status, last_seen_at, resume_cursor_json, runtime_payload_json)
      VALUES ('legacy-native', 'claudeAgent', 'claudeAgent', 'stopped', '2026-10-01', '{"resume":"native-v1"}', '{}')`;
      const nativeThreadId = ThreadId.make("thread:native-v2");
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create-native"),
        threadId: nativeThreadId,
        projectId,
        title: "Native",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "server",
        importedNativeThread: {
          ref: { driver: adapter.driver, nativeId: "native-v2", strength: "strong" },
        },
      });
      yield* fs.writeFileString(
        path.join(transcripts, "native-v2.jsonl"),
        record("native-v2", "native-user-2", "user", "Already owned too"),
      );
      const mirrorLayer = ClaudeSessionMirror.layer.pipe(
        Layer.provide(
          ServerSettings.layerTest({
            providerInstances: {
              [instanceId]: {
                driver: adapter.driver,
                config: { mirrorExternalSessions: true, homePath: home },
              },
            },
          }),
        ),
        Layer.provide(
          Layer.mock(LegacyImporter.LegacyV1ThreadImporter)({
            ensureTranscript: () =>
              Effect.succeed({ importedThreadCount: 0, importedMessageCount: 0 }),
          }),
        ),
      );
      yield* Effect.gen(function* () {
        const mirror = yield* ClaudeSessionMirror.ClaudeSessionMirror;
        const threadId = ThreadId.make(claudeMirrorId("claude", instanceId, "session-1"));
        yield* mirror.scan;
        const shell = yield* projections.getThreadShell(threadId);
        assert.equal(shell?.externalSession?.controlMode, "mirrored");
        assert.equal(shell?.status, "running");
        for (const sessionId of ["subagent-1", "native-v1", "native-v2"]) {
          assert.isNull(
            yield* projections.getThreadShell(
              ThreadId.make(claudeMirrorId("claude", instanceId, sessionId)),
            ),
          );
        }
        const control = (id: string, controlMode: "owned" | "mirrored") =>
          orchestrator.dispatch({
            type: "thread.external.control",
            commandId: CommandId.make(id),
            threadId,
            controlMode,
          });
        assert.equal((yield* Effect.exit(control("takeover-running", "owned")))._tag, "Failure");
        const send = () =>
          orchestrator.dispatch({
            type: "message.dispatch",
            commandId: CommandId.make("mirror-send"),
            threadId,
            messageId: MessageId.make("message:forbidden"),
            text: "/compact",
            attachments: [],
            dispatchMode: { type: "start_immediately" },
            createdBy: "user",
            creationSource: "web",
          });
        assert.equal((yield* Effect.exit(send()))._tag, "Failure");
        yield* fs.writeFileString(transcript, first + finish);
        yield* mirror.scan;
        assert.equal((yield* projections.getThreadShell(threadId))?.status, "idle");
        const completed = yield* projections.getThreadProjection(threadId);
        assert.deepStrictEqual(
          completed.messages.map((message) => message.text),
          ["Please fix it", "Fixed"],
        );
        assert.equal(
          completed.providerThreads[0]?.nativeConversationHeadRef?.nativeId,
          "assistant-1",
        );
        yield* mirror.scan;
        assert.lengthOf((yield* projections.getThreadProjection(threadId)).messages, 2);
        yield* control("takeover-idle", "owned");
        // A stale scanner batch that crosses takeover cannot mutate ownership/history.
        yield* orchestrator.dispatch({
          type: "thread.external.observe",
          commandId: CommandId.make("stale-observation"),
          threadId,
          externalSession: { sessionId: "session-1", controlMode: "mirrored", running: true },
          providerThread: completed.providerThreads[0]!,
          messages: [],
          turnItems: [],
          title: "Stale title",
        });
        assert.equal((yield* projections.getThread(threadId)).title, completed.thread.title);
        const now = yield* DateTime.now;
        const ownedSession = ProviderSessionId.make("owned-session");
        yield* projections.apply({
          id: EventId.make("owned-session-attach"),
          type: "provider-session.attached",
          threadId,
          occurredAt: now,
          payload: {
            id: ownedSession,
            driver: adapter.driver,
            providerInstanceId: instanceId,
            status: "ready",
            cwd: workspace,
            model: modelSelection.model,
            capabilities: ClaudeProviderCapabilitiesV2,
            createdAt: now,
            updatedAt: now,
            lastError: null,
          },
        });
        const ownedContent =
          first +
          finish +
          record("session-1", "owned-user", "user", "T3-owned turn") +
          record(
            "session-1",
            "owned-assistant",
            "assistant",
            [{ type: "text", text: "T3-owned answer" }],
            "end_turn",
          );
        yield* fs.writeFileString(transcript, ownedContent);
        yield* mirror.scan;
        assert.lengthOf((yield* projections.getThreadProjection(threadId)).messages, 2);
        yield* TestClock.setTime(Date.parse("2026-10-01T12:00:00.000Z"));
        yield* control("release", "mirrored");
        yield* mirror.scan;
        const released = yield* projections.getThreadProjection(threadId);
        assert.lengthOf(released.providerSessions, 0);
        assert.lengthOf(released.messages, 2); // Owned turns must not be duplicated from the JSONL.
        yield* fs.writeFileString(
          transcript,
          ownedContent +
            record("session-1", "user-2", "user", "Next") +
            record(
              "session-1",
              "assistant-2",
              "assistant",
              [{ type: "text", text: "Next done" }],
              "end_turn",
            ),
        );
        yield* mirror.scan;
        const resumed = yield* projections.getThreadProjection(threadId);
        assert.lengthOf(resumed.messages, 4);
        assert.equal(resumed.thread.externalSession?.controlMode, "mirrored");
        assert.equal(
          resumed.providerThreads[0]?.nativeConversationHeadRef?.nativeId,
          "assistant-2",
        );
      }).pipe(Effect.provide(mirrorLayer));
    }).pipe(Effect.provide(layerTest), Effect.provide(NodeServices.layer), Effect.scoped),
);
