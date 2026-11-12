import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../test/render";
import { usePanelPresence } from "./panelAnimations";

function Probe({
  open,
  scope = "one",
  label = "panel",
  animated = true,
}: {
  open: boolean;
  scope?: string;
  label?: string;
  animated?: boolean;
}) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Exercise fresh caller objects without compiler memoization masking the render-loop regression.
  "use no memo";
  const [ready, setReady] = useState(false);
  const result = usePanelPresence(open, { label }, animated, scope, 150);
  if (!ready) setReady(true);
  return result.present ? <output>{result.value?.label}</output> : null;
}

it("converges with fresh values and retains the last open value until exit finishes", async () => {
  await using screen = await render(<Probe open />, {
    // A bare hook probe; nothing here navigates.
    router: false,
  });
  using _timers = fakeTimers();
  await expect.element(screen.getByRole("status")).toHaveTextContent("panel");

  await screen.rerender(<Probe open label="updated" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("updated");
  await screen.rerender(<Probe open={false} label="closed" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("updated");
  await act(() => vi.advanceTimersByTime(149));
  await expect.element(screen.getByRole("status")).toHaveTextContent("updated");
  await act(() => vi.advanceTimersByTime(1));
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
});

it("does not retain another scope's panel and retains updates while open across scopes", async () => {
  await using screen = await render(<Probe open />, {
    // A bare hook probe; nothing here navigates.
    router: false,
  });
  using _timers = fakeTimers();

  await screen.rerender(<Probe open={false} scope="two" />);
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await screen.rerender(<Probe open scope="two" label="second" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("second");
  await screen.rerender(<Probe open scope="three" label="third" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("third");
  await screen.rerender(<Probe open={false} scope="three" label="closed" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("third");
  await act(() => vi.advanceTimersByTime(150));
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();

  await screen.rerender(<Probe open scope="three" label="reopened" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("reopened");
});

it("opens from closed and closes immediately without animation", async () => {
  await using screen = await render(<Probe open={false} animated={false} />, {
    // A bare hook probe; nothing here navigates.
    router: false,
  });
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await screen.rerender(<Probe open animated={false} />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("panel");
  await screen.rerender(<Probe open={false} animated={false} />);
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
});

it("reopens during an exit and gives a subsequent close its full animation", async () => {
  await using screen = await render(<Probe open />, {
    // A bare hook probe; nothing here navigates.
    router: false,
  });
  using _timers = fakeTimers();

  await screen.rerender(<Probe open={false} />);
  await act(() => vi.advanceTimersByTime(50));
  await screen.rerender(<Probe open label="reopened" />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("reopened");
  await act(() => vi.advanceTimersByTime(25));
  await screen.rerender(<Probe open={false} label="closed" />);

  await act(() => vi.advanceTimersByTime(75));
  await expect.element(screen.getByRole("status")).toHaveTextContent("reopened");
  await act(() => vi.advanceTimersByTime(74));
  await expect.element(screen.getByRole("status")).toHaveTextContent("reopened");
  await act(() => vi.advanceTimersByTime(1));
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
});
