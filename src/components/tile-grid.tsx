import { useEffect, useState } from "react";

// The brand motif: an orange tile moving through a 6 × 3 grid during analysis.
export function TileGrid() {
  const [trail, setTrail] = useState([7]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setTrail((current) => {
        const next = (current[0] + 1 + Math.floor(Math.random() * 17)) % 18;
        return [next, ...current].slice(0, 3);
      });
    }, 320);
    return () => clearInterval(timer);
  }, []);

  return (
    <svg width={57} height={27} viewBox="0 0 57 27" aria-hidden="true" className="shrink-0">
      {Array.from({ length: 18 }, (_, index) => {
        const rank = trail.indexOf(index);
        return (
          <rect key={index} rx={1.4} x={(index % 6) * 10} y={Math.floor(index / 6) * 10}
            width={7} height={7}
            className="fill-brand-orange stroke-brand-orange motion-safe:transition-[fill-opacity] duration-300 ease-out"
            strokeWidth={0.75} strokeOpacity={0.6}
            fillOpacity={rank === 0 ? 1 : rank === 1 ? 0.35 : rank === 2 ? 0.12 : 0} />
        );
      })}
    </svg>
  );
}
