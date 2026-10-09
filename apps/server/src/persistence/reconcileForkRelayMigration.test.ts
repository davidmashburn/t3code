import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";

const seedFork = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* runMigrations({ toMigrationInclusive: 52 });
  yield* sql`UPDATE effect_sql_migrations SET name = 'ProjectionThreadSessionExternalControl'
    WHERE migration_id IN (33, 41)`;
  yield* sql`UPDATE effect_sql_migrations SET name = 'RepairProjectionThreadsSettled'
    WHERE migration_id = 42`;
  yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES
    (53, 'ProjectionThreadSessionExternalControl'),
    (54, 'RepairProjectionThreadsSettled'),
    (55, 'RepairAuthSessionClientConnection'),
    (56, 'RepairForkRelaySchema')`;
  // Also exercise older shipped databases where the repair had not yet run.
  yield* sql`ALTER TABLE projection_threads DROP COLUMN settled_override`;
  yield* sql`ALTER TABLE projection_threads DROP COLUMN settled_at`;
  yield* sql`ALTER TABLE projection_threads DROP COLUMN linked_pull_request_json`;
  yield* sql`ALTER TABLE auth_sessions DROP COLUMN client_surface`;
  yield* sql`ALTER TABLE auth_sessions DROP COLUMN client_app_version`;
  yield* sql`ALTER TABLE projection_thread_sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 't3'`;
  yield* sql`ALTER TABLE projection_thread_sessions ADD COLUMN control_mode TEXT NOT NULL DEFAULT 'owned'`;
  yield* sql`INSERT INTO projection_thread_sessions
    (thread_id, status, provider_name, provider_thread_id, updated_at, runtime_mode, origin, control_mode)
    VALUES ('legacy-thread', 'idle', 'claude', 'external-session', '2026-10-01', 'full-access', 'external', 'read-only')`;
  yield* sql`INSERT INTO projection_projects
    (project_id, title, workspace_root, scripts_json, created_at, updated_at)
    VALUES ('legacy-project', 'Example project', '/tmp/example-project', '[]', '2026-10-01', '2026-10-01')`;
  yield* sql`INSERT INTO projection_thread_messages
    (message_id, thread_id, role, text, is_streaming, created_at, updated_at)
    VALUES ('legacy-message', 'legacy-thread', 'assistant', 'Preserved transcript', 0, '2026-10-01', '2026-10-01')`;
});

describe("fork relay migration reconciliation", () => {
  it.effect.each([
    [33, "ProjectionThreadSessionExternalControl"],
    [41, "ProjectionThreadSessionExternalControl"],
    [42, "RepairProjectionThreadsSettled"],
    [53, "ProjectionThreadSessionExternalControl"],
    [54, "RepairProjectionThreadsSettled"],
    [55, "RepairAuthSessionClientConnection"],
  ] as const)("upgrades an earlier fork stopped at migration %s (%s)", ([id, name]) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: id - 1 });
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
      yield* runMigrations();
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = ${id}`,
        [{ name }],
      );
      assert.deepStrictEqual(yield* runMigrations(), []);
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(scheduled_tasks)`;
      assert.ok(columns.some((column) => column.name === "webhook_token"));
      assert.deepStrictEqual(yield* sql`PRAGMA integrity_check`, [{ integrity_check: "ok" }]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect(
    "repairs shipped collisions before V2 dependents and preserves history and legacy data",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* seedFork;
        const history = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
        const sessions = yield* sql`SELECT * FROM projection_thread_sessions`;
        const messages = yield* sql`SELECT * FROM projection_thread_messages`;
        assert.deepStrictEqual(yield* runMigrations(), [
          [57, "ScheduledTaskWebhooks"],
          [58, "WebhookRelayDeliveries"],
          [59, "McpAppModelContext"],
          [60, "ThreadSnapshotWindowIndexes"],
        ]);
        assert.deepStrictEqual(yield* runMigrations(), []);
        assert.deepStrictEqual(
          yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 56 ORDER BY migration_id`,
          history,
        );
        assert.deepStrictEqual(yield* sql`SELECT * FROM projection_thread_sessions`, sessions);
        assert.deepStrictEqual(yield* sql`SELECT * FROM projection_thread_messages`, messages);
        const threadColumns = yield* sql<{
          readonly name: string;
        }>`PRAGMA table_info(projection_threads)`;
        for (const name of [
          "settled_at",
          "settled_override",
          "linked_pull_request_json",
          "auto_settle_disabled_at",
        ]) {
          assert.ok(threadColumns.some((column) => column.name === name));
        }
        const authColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(auth_sessions)`;
        assert.ok(authColumns.some(({ name }) => name === "client_surface"));
        assert.ok(authColumns.some(({ name }) => name === "client_app_version"));
        const taskColumns = yield* sql<{
          readonly name: string;
        }>`PRAGMA table_info(scheduled_tasks)`;
        assert.ok(taskColumns.some(({ name }) => name === "webhook_token"));
        assert.ok(taskColumns.some(({ name }) => name === "webhook_secret"));
        assert.strictEqual(
          (yield* sql`SELECT * FROM orchestration_events WHERE application_event_version = 2`)
            .length,
          1,
        );
        yield* sql`INSERT INTO pull_request_files_viewed
        (provider, host, repository, number, viewer, path, viewed_at)
        VALUES ('github', 'github.com', 'example/repo', 1, 'reader', 'file.ts', '2026-10-01')`;
        assert.deepStrictEqual(yield* sql`PRAGMA integrity_check`, [{ integrity_check: "ok" }]);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("resumes after the compatibility transaction commits but a later migration fails", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      // A malformed later table makes migration 57's index creation fail.
      yield* sql`CREATE TABLE scheduled_task_webhook_deliveries (wrong_column TEXT)`;
      assert.ok(Exit.isFailure(yield* Effect.exit(runMigrations())));
      assert.strictEqual(
        (yield* sql`SELECT * FROM orchestration_events WHERE application_event_version = 2`).length,
        1,
      );
      yield* sql`INSERT INTO orchestration_v2_legacy_imports
        (thread_id, source_updated_at, shell_imported_at, transcript_imported_at, imported_message_count)
        VALUES ('legacy-thread', '2026-10-01', '2026-10-01', '2026-10-01', 1)`;
      const progress = yield* sql`SELECT * FROM orchestration_v2_legacy_imports`;
      yield* sql`DROP TABLE scheduled_task_webhook_deliveries`;
      yield* runMigrations();
      assert.deepStrictEqual(yield* sql`SELECT * FROM orchestration_v2_legacy_imports`, progress);
      assert.strictEqual(
        (yield* sql`SELECT * FROM orchestration_events WHERE application_event_version = 2`).length,
        1,
      );
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("rolls back a failed V2 bootstrap together with its preceding schema repairs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      const history = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
      yield* sql`CREATE TRIGGER fail_v2_bootstrap BEFORE INSERT ON orchestration_events
        BEGIN SELECT RAISE(ABORT, 'injected failure'); END`;
      assert.ok(Exit.isFailure(yield* Effect.exit(runMigrations())));
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
        history,
      );
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'orchestration_v2_events'`,
        [],
      );
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'pull_request_files_viewed'`,
        [],
      );
      yield* sql`DROP TRIGGER fail_v2_bootstrap`;
      yield* runMigrations();
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("refuses a partial V2 schema without changing the ledger", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      yield* sql`CREATE TABLE orchestration_v2_events (event_id TEXT PRIMARY KEY)`;
      const history = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
      assert.ok(Exit.isFailure(yield* Effect.exit(runMigrations())));
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
        history,
      );
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("honors a bounded migration run without bootstrapping V2 early", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      yield* runMigrations({ toMigrationInclusive: 54 });
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'orchestration_v2_events'`,
        [],
      );
      yield* runMigrations();
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
