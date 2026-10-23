import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useWorkspace } from "@/components/workspace-provider";
import { fixtureStates, fixtureWorkspace, type FixtureState } from "@/dev/fixtures";

type Choice = FixtureState | "demo";
const labels: Record<Choice, string> = { demo: "Demo", worst: "Worst case", empty: "Empty", one: "One", many: "150 rows" };
const fromQuery = (value: unknown): Choice => fixtureStates.find((state) => state === value) ?? "demo";

// Dev-only chrome for the break-ui pass: flips the workspace between the real session
// and the fixtures. The choice is mirrored into ?data= (and put back after in-app
// navigation, whose links drop it) so a reload keeps it.
export function DataToggle() {
  const router = useRouter();
  const { swapWorkspace } = useWorkspace();
  // The query is empty until the router is ready, so read the initial choice only then.
  const [active, setActive] = useState<Choice | null>(null);
  if (active === null && router.isReady) setActive(fromQuery(router.query.data));

  useEffect(() => {
    if (active === null) return;
    const swapped = swapWorkspace(active === "demo" ? null : fixtureWorkspace(active));
    if (!swapped) {
      // Keep the control in sync when the workspace refuses to leave active real work.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive("demo");
    }
    // swapWorkspace is recreated each render; the fixture only changes with the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (active === null || fromQuery(router.query.data) === active) return;
    const query = Object.fromEntries(Object.entries(router.query).filter(([key]) => key !== "data"));
    void router.replace({ pathname: router.pathname, query: active === "demo" ? query : { ...query, data: active } }, undefined, { shallow: true, scroll: false });
  }, [active, router]);

  return (
    <div role="group" aria-label="Test data" style={{ position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "#e5e5e5", font: "12px system-ui, sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,.1)" }}>
      {(["demo", ...fixtureStates] as const).map((state) => (
        <button key={state} type="button" aria-pressed={active === state} onClick={() => setActive(state)}
          style={{ padding: "4px 10px", borderRadius: 999, border: 0, cursor: "pointer", background: active === state ? "#fff" : "transparent", color: "#111", whiteSpace: "nowrap" }}>
          {labels[state]}
        </button>
      ))}
    </div>
  );
}
