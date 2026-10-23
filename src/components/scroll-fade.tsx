import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function Fade({ visible, tone }: { visible: boolean; tone: string }) {
  return <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent motion-safe:transition-opacity motion-safe:duration-200", tone, visible ? "opacity-100" : "opacity-0")} />;
}

// A scroll area that fades its bottom edge while more content sits below,
// so it's clear the area scrolls. The fade disappears once the end is reached.
export function ScrollFade({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
    update();
    element.addEventListener("scroll", update, { passive: true });
    // Content can grow after mount (images load, viewport resizes).
    const observer = new ResizeObserver(update);
    observer.observe(element);
    Array.from(element.children).forEach((child) => observer.observe(child));
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className={className}>{children}</div>
      <Fade visible={more} tone="from-white" />
    </div>
  );
}

// The same cue for a column that scrolls with the page: render it as the column's last child.
// It pins a fade to the viewport bottom until the column's end comes into view.
export function PageScrollFade() {
  const end = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = end.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setMore(!entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <>
    <div ref={end} aria-hidden="true" className="h-px" />
    <div aria-hidden="true" className="pointer-events-none sticky bottom-0 -mt-16 h-16">
      <Fade visible={more} tone="from-background" />
    </div>
  </>;
}
