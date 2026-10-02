import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";
import externalControl from "./053_ProjectionThreadSessionExternalControl.ts";
import settled from "./054_RepairProjectionThreadsSettled.ts";
import authClientConnection from "./055_RepairAuthSessionClientConnection.ts";
import repair from "./056_RepairForkRelaySchema.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("056_RepairForkRelaySchema", (it) => {
  it.effect("repairs upstream changes skipped by shipped fork IDs without rewriting history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 52 });
      yield* externalControl;
      yield* settled;
      yield* authClientConnection;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (53, 'ProjectionThreadSessionExternalControl'),
          (54, 'RepairProjectionThreadsSettled'),
          (55, 'RepairAuthSessionClientConnection')
      `;
      assert.deepEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'pull_request_files_viewed'`,
        [],
      );
      const before = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_threads)`;
      assert.ok(!before.some((column) => column.name === "auto_settle_disabled_at"));

      assert.deepEqual(yield* runMigrations(), [[56, "RepairForkRelaySchema"]]);
      yield* repair;
      assert.deepEqual(yield* runMigrations(), []);

      const after = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_threads)`;
      assert.ok(after.some((column) => column.name === "auto_settle_disabled_at"));
      yield* sql`
        INSERT INTO pull_request_files_viewed (provider, host, repository, number, viewer, path, viewed_at)
        VALUES ('github', 'github.com', 'owner/repo', 1, 'viewer', 'file.ts', '2026-10-02T00:00:00Z')
      `;
      assert.deepEqual(yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = 53`, [
        { name: "ProjectionThreadSessionExternalControl" },
      ]);
      assert.deepEqual(yield* sql`PRAGMA integrity_check`, [{ integrity_check: "ok" }]);
    }),
  );

  it.effect("adds fork session ownership to a database with upstream migration history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      const before = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(projection_thread_sessions)`;
      assert.ok(!before.some((column) => column.name === "origin"));
      yield* runMigrations();
      const after = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(projection_thread_sessions)`;
      assert.ok(after.some((column) => column.name === "origin"));
      assert.ok(after.some((column) => column.name === "control_mode"));
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
