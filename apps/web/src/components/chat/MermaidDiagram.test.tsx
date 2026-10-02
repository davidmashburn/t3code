import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { initialize, render } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: { initialize, render },
}));

import { MermaidDiagram } from "./MermaidDiagram";

describe("MermaidDiagram", () => {
  beforeEach(() => {
    initialize.mockClear();
    render.mockReset();
  });

  it("renders diagrams with strict Mermaid security and the active theme", async () => {
    render.mockResolvedValue({ svg: '<svg data-rendered="true"></svg>' });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <MermaidDiagram code="graph TD; A-->B" fallback={<pre>Loading</pre>} theme="dark" />,
      );
    });

    expect(initialize).toHaveBeenCalledWith({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: "dark",
    });
    expect(render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), "graph TD; A-->B");
    expect(renderer!.root.findByProps({ role: "img" }).props).toMatchObject({
      "aria-label": "Mermaid diagram",
      dangerouslySetInnerHTML: { __html: '<svg data-rendered="true"></svg>' },
    });

    await act(async () => renderer?.unmount());
  });
});
