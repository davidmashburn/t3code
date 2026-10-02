import * as Effect from "effect/Effect";

import externalControl from "./053_ProjectionThreadSessionExternalControl.ts";
import filesViewed from "./053_PullRequestFilesViewed.ts";
import settled from "./054_RepairProjectionThreadsSettled.ts";
import autoSettleDisabled from "./054_ProjectionThreadsAutoSettleDisabledAt.ts";
import authClientConnection from "./055_RepairAuthSessionClientConnection.ts";

// IDs 53 and 54 shipped with different meanings in fork and upstream builds.
// Reapply both sides idempotently without changing persisted migration history.
export default Effect.gen(function* () {
  yield* externalControl;
  yield* filesViewed;
  yield* settled;
  yield* autoSettleDisabled;
  yield* authClientConnection;
});
