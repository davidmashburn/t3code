import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ClaudeSessionMirrorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ClaudeSessionMirror extends Context.Service<
  ClaudeSessionMirror,
  ClaudeSessionMirrorShape
>()("t3/orchestration/Services/ClaudeSessionMirror") {}
