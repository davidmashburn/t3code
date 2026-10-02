import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type MermaidRenderResult = Awaited<ReturnType<(typeof import("mermaid"))["default"]["render"]>>;

interface RenderedDiagram extends MermaidRenderResult {
  readonly key: string;
}

let renderQueue = Promise.resolve();

async function renderMermaid(
  id: string,
  code: string,
  theme: "light" | "dark",
): Promise<MermaidRenderResult> {
  const result = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
    });
    return mermaid.render(id, code);
  });
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function MermaidDiagram(props: {
  readonly code: string;
  readonly fallback: ReactNode;
  readonly theme: "light" | "dark";
}) {
  const generatedId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const key = `${props.theme}\0${props.code}`;
  const [rendered, setRendered] = useState<RenderedDiagram | null>(null);
  const [error, setError] = useState<{ readonly key: string; readonly cause: unknown } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void renderMermaid(`mermaid-${generatedId}`, props.code, props.theme).then(
      (result) => {
        if (active) setRendered({ ...result, key });
      },
      (cause: unknown) => {
        if (active) setError({ key, cause });
      },
    );
    return () => {
      active = false;
    };
  }, [generatedId, key, props.code, props.theme]);

  useEffect(() => {
    if (rendered?.key === key && containerRef.current) {
      rendered.bindFunctions?.(containerRef.current);
    }
  }, [key, rendered]);

  if (error?.key === key) throw error.cause;
  if (rendered?.key !== key) return props.fallback;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Mermaid diagram"
      className="flex max-w-full justify-center overflow-auto bg-background p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  );
}
