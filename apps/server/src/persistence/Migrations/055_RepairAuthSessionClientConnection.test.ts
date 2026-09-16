import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("055_RepairAuthSessionClientConnection", (it) => {
  it.effect("repairs client metadata columns after a fork migration id collision", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (41, 'ProjectionThreadSessionExternalControl'),
          (42, 'RepairProjectionThreadsSettled')
      `;
      yield* runMigrations({ toMigrationInclusive: 54 });

      const before = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(auth_sessions)
      `;
      assert.ok(!before.some((column) => column.name === "client_surface"));
      assert.ok(!before.some((column) => column.name === "client_app_version"));

      yield* runMigrations({ toMigrationInclusive: 55 });

      const after = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(auth_sessions)
      `;
      assert.ok(after.some((column) => column.name === "client_surface"));
      assert.ok(after.some((column) => column.name === "client_app_version"));
    }),
  );
});
