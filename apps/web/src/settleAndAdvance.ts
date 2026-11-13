import type { ScopedThreadRef } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

type SettleAndAdvance = (threadRef: ScopedThreadRef) => void;

let registeredSettleAndAdvance: SettleAndAdvance | null = null;

export function registerSettleAndAdvance(handler: SettleAndAdvance): () => void {
  registeredSettleAndAdvance = handler;
  return () => {
    if (registeredSettleAndAdvance === handler) registeredSettleAndAdvance = null;
  };
}

/** False means no sidebar is mounted; settle in place. */
export function settleAndAdvance(threadRef: ScopedThreadRef): boolean {
  if (!registeredSettleAndAdvance) return false;
  registeredSettleAndAdvance(threadRef);
  return true;
}

type SnoozeAndAdvance = (
  threadRef: ScopedThreadRef,
  preset: Pick<SnoozePreset, "snoozedUntil">,
) => void;

let registeredSnoozeAndAdvance: SnoozeAndAdvance | null = null;

export function registerSnoozeAndAdvance(handler: SnoozeAndAdvance): () => void {
  registeredSnoozeAndAdvance = handler;
  return () => {
    if (registeredSnoozeAndAdvance === handler) registeredSnoozeAndAdvance = null;
  };
}

export function snoozeAndAdvance(
  threadRef: ScopedThreadRef,
  preset: Pick<SnoozePreset, "snoozedUntil">,
): boolean {
  if (!registeredSnoozeAndAdvance) return false;
  registeredSnoozeAndAdvance(threadRef, preset);
  return true;
}
