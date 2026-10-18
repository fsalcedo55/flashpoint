import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// The brand motif (flashpoint.ai): a field of tiles with one lit orange.
// "searching": the lit tile keeps jumping around the field (analysis in flight).
// "found": it jumps a few times, then settles on its home tile (the search paid off).
type Props = { mode: "searching" | "found"; columns?: number; rows?: number; tile?: number; gap?: number; className?: string };

const reducedMotion = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TileGrid({ mode, columns = 6, rows = 3, tile = 7, gap = 3, className }: Props) {
  const total = columns * rows;
  const home = columns + 1; // second row, second tile, as in the brand graphic
  const random = (not: number) => { let next = not; while (next === not) next = Math.floor(Math.random() * total); return next; };
  // Lit tile first, then its fading trail. Under reduced motion the found tile is simply there.
  const [trail, setTrail] = useState<number[]>(() => mode === "found" && !reducedMotion() ? [random(home)] : [home]);

  useEffect(() => {
    if (reducedMotion()) return;
    let hops = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      if (mode === "found" && hops >= 4) {
        clearInterval(timer);
        setTrail((current) => [home, ...current].slice(0, 3));
        settle = setTimeout(() => setTrail([home]), 350);
        return;
      }
      hops += 1;
      setTrail((current) => [random(current[0]), ...current].slice(0, 3));
    }, mode === "found" ? 160 : 320);
    return () => { clearInterval(timer); if (settle) clearTimeout(settle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `random` is a pure helper over `total`
  }, [mode, total, home]);

  const width = columns * tile + (columns - 1) * gap;
  const height = rows * tile + (rows - 1) * gap;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
      className={cn("shrink-0", mode === "searching" && "motion-reduce:animate-pulse", className)}>
      {Array.from({ length: total }, (_, index) => {
        const rank = trail.indexOf(index);
        return (
          <rect key={index} rx={tile / 5}
            x={(index % columns) * (tile + gap)} y={Math.floor(index / columns) * (tile + gap)}
            width={tile} height={tile}
            className="fill-brand-orange stroke-brand-orange transition-[fill-opacity] duration-300 ease-out"
            strokeWidth={Math.max(0.75, tile / 10)} strokeOpacity={0.6}
            fillOpacity={rank === 0 ? 1 : rank === 1 ? 0.35 : rank === 2 ? 0.12 : 0} />
        );
      })}
    </svg>
  );
}
