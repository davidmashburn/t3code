import { ClaudeSettings, CommandId, ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import { deriveProviderInstanceConfigMap } from "../provider/ProviderInstanceRegistryHydration.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as LegacyImporter from "./legacy/LegacyV1ThreadImporter.ts";
import {
  claudeExternalProviderThread,
  claudeMirrorId,
  readClaudeMirrorTranscript,
} from "./claudeMirrorTranscript.ts";

export class ClaudeMirrorScanError extends Schema.TaggedError<ClaudeMirrorScanError>()(
  "ClaudeMirrorScanError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return "Could not scan external Claude sessions.";
  }
}

export class ClaudeSessionMirror extends Context.Service<
  ClaudeSessionMirror,
  {
    readonly scan: Effect.Effect<void, ClaudeMirrorScanError>;
  }
>()("t3/orchestration-v2/ClaudeSessionMirror") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const transcriptFiles = (
    root: string,
  ): Effect.Effect<string[], import("effect/PlatformError").PlatformError> =>
    Effect.gen(function* () {
      if (!(yield* fs.exists(root))) return [];
      const files: string[] = [];
      for (const name of yield* fs.readDirectory(root)) {
        if (name === "subagents") continue;
        const file = path.join(root, name);
        const info = yield* fs.stat(file);
        if (info.type === "Directory") files.push(...(yield* transcriptFiles(file)));
        else if (info.type === "File" && name.endsWith(".jsonl")) files.push(file);
      }
      return files;
    });
  const settings = yield* ServerSettingsService;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const importer = yield* LegacyImporter.LegacyV1ThreadImporter;
  const sql = yield* SqlClient.SqlClient;
  const fingerprints = new Map<string, string>();
  const decodeNativeThread = Schema.decodeUnknownOption(
    Schema.fromJsonString(
      Schema.Struct({
        driver: Schema.String,
        providerInstanceId: Schema.String,
        appThreadId: Schema.NullOr(Schema.String),
        nativeThreadRef: Schema.NullOr(Schema.Struct({ nativeId: Schema.String })),
      }),
    ),
  );
  const decodeLegacyCursor = Schema.decodeUnknownOption(
    Schema.fromJsonString(Schema.Struct({ resume: Schema.String })),
  );
  const decodeLegacyPayload = Schema.decodeUnknownOption(
    Schema.fromJsonString(
      Schema.Struct({ claudeTranscriptMirror: Schema.optional(Schema.Boolean) }),
    ),
  );
  const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);
  const scan = Effect.gen(function* () {
    const instances = deriveProviderInstanceConfigMap(yield* settings.getSettings);
    // Native T3 sessions already have an owner; do not make another conversation for them.
    const nativeThreads = yield* sql<{
      payload_json: string;
    }>`SELECT payload_json FROM orchestration_v2_projection_provider_threads`;
    const claimed = new Map<string, string | null>();
    for (const row of nativeThreads) {
      const decoded = decodeNativeThread(row.payload_json);
      if (Option.isNone(decoded)) continue;
      const thread = decoded.value;
      if (thread.driver === "claudeAgent" && thread.nativeThreadRef?.nativeId)
        claimed.set(
          `${thread.providerInstanceId}:${thread.nativeThreadRef.nativeId}`,
          thread.appThreadId,
        );
    }
    const nativeLegacyIds = new Set<string>();
    const legacySessions = yield* sql<{
      resume_cursor_json: string | null;
      runtime_payload_json: string | null;
    }>`
      SELECT resume_cursor_json, runtime_payload_json FROM provider_session_runtime WHERE provider_name = 'claudeAgent'`;
    for (const row of legacySessions) {
      const cursor = decodeLegacyCursor(row.resume_cursor_json);
      const payload = decodeLegacyPayload(row.runtime_payload_json);
      if (
        Option.isSome(cursor) &&
        !(Option.isSome(payload) && payload.value.claudeTranscriptMirror === true)
      )
        nativeLegacyIds.add(cursor.value.resume);
    }
    for (const [key, instance] of Object.entries(instances)) {
      if (instance.driver !== "claudeAgent" || instance.enabled === false) continue;
      const config = decodeClaudeSettings(instance.config ?? {});
      if (Option.isNone(config) || !config.value.mirrorExternalSessions) continue;
      const instanceId = ProviderInstanceId.make(key);
      const root = yield* resolveClaudeHomePath(config.value, process.env).pipe(
        Effect.provideService(Path.Path, path),
      );
      const files = yield* transcriptFiles(path.join(root, "projects"));
      for (const file of files) {
        yield* Effect.gen(function* () {
          const fileSessionId = path.basename(file, ".jsonl");
          if (nativeLegacyIds.has(fileSessionId)) return;
          const expectedThreadId = claudeMirrorId("claude", instanceId, fileSessionId);
          const owner = claimed.get(`${instanceId}:${fileSessionId}`);
          if (owner !== undefined && owner !== expectedThreadId) return;
          const fingerprintKey = `${instanceId}:${file}`;
          const info = yield* fs.stat(file);
          const fingerprint = `${info.size}:${Option.getOrNull(info.mtime)?.getTime()}`;
          const content =
            fingerprints.get(fingerprintKey) === fingerprint
              ? undefined
              : yield* fs.readFileString(file);
          if (content === undefined) return;
          const snapshot = readClaudeMirrorTranscript(instanceId, content);
          if (!snapshot?.cwd) return;
          const existing = yield* projections.getThreadShell(snapshot.threadId);
          // Do not advance the fingerprint: after release, re-read changes made while T3 owned it.
          if (existing?.externalSession?.controlMode === "owned") return;
          if (existing !== null && existing.deletedAt !== null) return;
          const project = yield* projects.findActiveByWorkspaceRoot(snapshot.cwd);
          if (Option.isNone(project)) return;
          const externalSession = {
            sessionId: snapshot.sessionId,
            controlMode: "mirrored" as const,
            running: snapshot.running,
          };
          if (existing === null)
            yield* orchestrator.dispatch({
              type: "thread.create",
              commandId: CommandId.make(
                claudeMirrorId("mirror-cmd", instanceId, snapshot.sessionId, "v2-create"),
              ),
              threadId: snapshot.threadId,
              projectId: project.value.projectId,
              title: snapshot.title || "Claude Code session",
              modelSelection: { instanceId, model: snapshot.model ?? "claude-sonnet-5" },
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: snapshot.branch ?? null,
              worktreePath: null,
              createdBy: "user",
              creationSource: "server",
              externalSession,
              importedNativeThread: {
                ref: { driver: instance.driver, nativeId: snapshot.sessionId, strength: "strong" },
              },
            });
          else yield* importer.ensureTranscript(snapshot.threadId);
          const now = yield* DateTime.now;
          const result = yield* orchestrator.dispatch({
            type: "thread.external.observe",
            commandId: CommandId.make(
              claudeMirrorId(
                "mirror-cmd",
                instanceId,
                snapshot.sessionId,
                claudeMirrorId("content", content),
                existing?.externalSession?.ownedThrough ?? "",
              ),
            ),
            threadId: snapshot.threadId,
            externalSession,
            providerThread: claudeExternalProviderThread({
              instanceId,
              threadId: snapshot.threadId,
              sessionId: snapshot.sessionId,
              now,
              ...(snapshot.headId ? { headId: snapshot.headId } : {}),
            }),
            messages: snapshot.messages,
            turnItems: snapshot.turnItems,
            ...(snapshot.title ? { title: snapshot.title } : {}),
          });
          // An ownership race can reject this batch without events. Retry it after
          // release, whose ownedThrough value also gives it a fresh command identity.
          if (result.storedEvents.length > 0) fingerprints.set(fingerprintKey, fingerprint);
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Claude mirror skipped a transcript", { cause }),
          ),
        );
      }
    }
  }).pipe(Effect.mapError((cause) => new ClaudeMirrorScanError({ cause })));
  return ClaudeSessionMirror.of({ scan });
});
export const layer = Layer.effect(ClaudeSessionMirror, make);
export const layerWorker = Layer.effectDiscard(
  Effect.gen(function* () {
    const mirror = yield* ClaudeSessionMirror;
    const importer = yield* LegacyImporter.LegacyV1ThreadImporter;
    yield* importer.reconcileShells;
    yield* mirror.scan.pipe(
      Effect.catchCause((cause) => Effect.logWarning("Claude mirror scan failed", { cause })),
      Effect.repeat(Schedule.spaced("2 seconds")),
      Effect.forkScoped,
    );
  }),
).pipe(Layer.provide(layer));
