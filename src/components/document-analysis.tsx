import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { ArrowRight, Check, ChevronDown, Info, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconSwap } from "@/components/ui/icon-swap";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TileGrid } from "@/components/tile-grid";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWorkspace } from "@/components/workspace-provider";
import type { AnalysisRun } from "@/lib/analysis";
import { MAX_ANALYSIS_DOCUMENTS } from "@/lib/analysis";

// Pinned to the bottom of the viewport while documents are selected, so the
// action is always beside the selection instead of back at the top of the list.
export function SelectionBar() {
  const { configuration, selectedIds, clearSelection, startAnalysis, isAnalyzing: busy, isUploading } = useWorkspace();
  const available = configuration.data?.configured === true;
  if (!selectedIds.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-5 sm:px-8 lg:left-60 lg:px-10">
      <div role="region" aria-label="Selected documents" className="pointer-events-auto mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-transparent bg-foreground py-2 pr-2 pl-5 sm:rounded-full text-sm text-background shadow-xl ring-1 ring-foreground/10 duration-200 ease-[cubic-bezier(0.2,0,0,1)] animate-in fade-in-0 motion-safe:slide-in-from-bottom-2">
        <p className="tabular-nums"><span className="font-medium">{selectedIds.length}</span> selected</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="text-background/80 hover:bg-background/10 hover:text-background" onClick={clearSelection} disabled={busy}>Clear</Button>
          {available ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-background/80 hover:bg-background/10 hover:text-background" aria-label="How documents are analyzed"><Info /></Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground ring-1 ring-foreground/10">Select up to {MAX_ANALYSIS_DOCUMENTS} documents per analysis. Selected text and filenames are sent through {configuration.data?.provider} to {configuration.data?.model}. Suggestions are kept in this tab for review.</TooltipContent>
            </Tooltip>
          ) : null}
          <Button disabled={isUploading || busy || !available} onClick={() => void startAnalysis(selectedIds)} className="h-9 gap-2 bg-background pr-4 pl-3.5 text-foreground hover:bg-background/90">
            <IconSwap active={busy} activeIcon={<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />} inactiveIcon={<Sparkles className="size-3.5" />} />
            {busy ? "Analyzing…" : "Find preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AnalysisNotices() {
  const { configuration } = useWorkspace();
  if (configuration.isError) return <div role="alert" className="mb-4 text-sm text-destructive">
    <p>{configuration.error.message}</p><Button variant="outline" size="sm" onClick={() => void configuration.refetch()}>Try again</Button>
  </div>;
  if (!configuration.data || configuration.data.configured) return null;
  return <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary px-4 py-3 text-sm">
    <p>Add a {configuration.data.provider} API key to find preferences.</p>
    <Button size="sm" variant="outline" className="bg-white" disabled={configuration.isFetching} onClick={() => void configuration.refetch()}>Check again</Button>
  </div>;
}

// Fallback while no reasoning summary has arrived yet (or the model returns none).
const stages = ["Reading the documents", "Looking for preferences", "Checking source quotes"];

function useStage(active: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setStage((current) => (current + 1) % stages.length), 2800);
    return () => clearInterval(timer);
  }, [active]);
  return stage;
}

// The summary opens each section with a bolded title; the latest one says what the model is on now.
function currentTopic(notes: string) {
  const titles = [...notes.matchAll(/\*\*([^*\n]+)\*\*/g)];
  return titles.at(-1)?.[1].trim() ?? "Working through the documents";
}

function formatDuration(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// Two lines in every state, so the row keeps its shape as it runs:
// the outcome and its action, then muted metadata (sources, time, notes toggle).
// The model's working notes fold out underneath; they're never styled as conclusions.
function AnalysisRow({ run, listShownAt }: { run: AnalysisRun; listShownAt: number }) {
  const { startAnalysis, isAnalyzing: busy, isUploading, configuration } = useWorkspace();
  const available = configuration.data?.configured === true;
  const ref = useRef<HTMLLIElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  // Captured at mount: a row that arrived after the list was already showing
  // keeps its entrance and animates its result. Rows from the first load don't.
  const [entered] = useState(() => Date.now() - listShownAt > 500);
  const [wasRunning] = useState(run.status === "running");
  const running = run.status === "running";
  const [notesOpen, setNotesOpen] = useState(running);
  const stage = useStage(running && !run.notes);
  const topic = run.notes ? currentTopic(run.notes) : stages[stage];
  const duration = run.startedAt && run.finishedAt ? Math.max(1, Math.ceil((run.finishedAt - run.startedAt) / 1000)) : undefined;
  const names = run.sources.map((source) => source.name).join(", ");
  useEffect(() => {
    if (!entered) return;
    ref.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [entered]);
  // Keep the newest notes in view while they stream.
  useEffect(() => {
    if (running && notesRef.current) notesRef.current.scrollTop = notesRef.current.scrollHeight;
  }, [running, run.notes, notesOpen]);
  // Fold once after completion; reopening the notes afterwards stays under user control.
  useEffect(() => {
    if (running || !wasRunning) return;
    const timer = setTimeout(() => setNotesOpen(false), 1000);
    return () => clearTimeout(timer);
  }, [running, wasRunning]);
  const reveal = wasRunning && "animate-in fade-in-0 duration-300 ease-out motion-safe:slide-in-from-bottom-1 motion-safe:blur-in-4";

  return (
    <li ref={ref} className={cn("py-3", entered && "animate-in fade-in-0 duration-300 ease-out motion-safe:slide-in-from-bottom-3 motion-safe:blur-in-4")}>
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <div className="flex min-h-9 items-center justify-between gap-3">
          {running ? (
            <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-3 text-sm">
              <TileGrid />
              <span key={topic} className="analysis-topic truncate">{topic}…</span>
            </p>
          ) : null}
          {run.status === "completed" ? (
            <p className={cn("flex min-w-0 items-center gap-2 text-sm", run.suggestionCount ? "font-medium" : "text-muted-foreground", reveal)}>
              {run.suggestionCount ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
              {run.suggestionCount ? `${run.suggestionCount} ${run.suggestionCount === 1 ? "suggestion" : "suggestions"} ready for review` : "No new preferences found"}
            </p>
          ) : null}
          {run.status === "failed" ? <p className={cn("min-w-0 text-sm text-destructive", reveal)}>{run.error}</p> : null}

          {run.status === "completed" && run.suggestionCount ? (
            <Button asChild variant="ghost" size="sm" className={cn("-mr-2 shrink-0 gap-1 px-2", reveal)}><Link href="/review">Review <ArrowRight className="size-3.5" aria-hidden="true" /></Link></Button>
          ) : null}
          {run.status === "failed" ? (
            <Button size="sm" variant="outline" className="shrink-0" disabled={isUploading || busy || !available} onClick={() => void startAnalysis(run.sources.map((source) => source.id))}>Retry</Button>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate" title={names}>{names}</span>
          {duration && !running ? <><span aria-hidden="true">·</span><span className="shrink-0 tabular-nums">{formatDuration(duration)}</span></> : null}
          {run.rejectedCount && !running ? <><span aria-hidden="true">·</span><span className="shrink-0">{run.rejectedCount} unverified dropped</span></> : null}
          {run.notes ? <>
            <span aria-hidden="true">·</span>
            <CollapsibleTrigger className="flex shrink-0 items-center gap-0.5 rounded text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Notes <ChevronDown className={cn("size-3 transition-transform duration-150", notesOpen && "rotate-180")} aria-hidden="true" />
            </CollapsibleTrigger>
          </> : null}
        </div>

        {run.notes ? (
          <CollapsibleContent className="overflow-hidden outline-none motion-safe:data-[state=open]:animate-collapsible-down motion-safe:data-[state=closed]:animate-collapsible-up duration-200 ease-out">
            <div ref={notesRef} className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4">
              <Streamdown isAnimating={running}>{run.notes}</Streamdown>
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </li>
  );
}

// Mounts with the first loaded data, so rows can tell "here from the start" from "arrived live".
function RunList({ runs }: { runs: AnalysisRun[] }) {
  const [listShownAt] = useState(() => Date.now());
  return (
    <ul className="divide-y rounded-xl border bg-white px-4">
      {runs.map((run) => <AnalysisRow key={run.id} run={run} listShownAt={listShownAt} />)}
    </ul>
  );
}

export function AnalysisRuns() {
  const { analyses } = useWorkspace();
  if (!analyses.length) return null;
  return (
    <section aria-label="Recent analyses" className="mt-8">
      <h3 className="mb-2 text-sm font-semibold">Recent analyses</h3>
      <RunList runs={analyses} />
    </section>
  );
}
