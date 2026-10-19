import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Brain, Check, ChevronDown, Info, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconSwap } from "@/components/ui/icon-swap";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TileGrid } from "@/components/tile-grid";
import { Reasoning, ReasoningContent, ReasoningTrigger, useReasoning } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
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

// Trigger label: the searching grid and the model's current topic while it works; how long it took afterwards.
function NotesLabel({ running, topic }: { running: boolean; topic: string }) {
  const { duration, isOpen } = useReasoning();
  return (
    <>
      {running ? <TileGrid mode="searching" /> : <Brain className="size-3.5 shrink-0" aria-hidden="true" />}
      {running
        ? <Shimmer key={topic} as="span" duration={1.6} className="text-xs animate-in fade-in-0 duration-300">{topic + "…"}</Shimmer>
        : <span>{duration ? `Worked for ${duration} ${duration === 1 ? "second" : "seconds"}` : "How this was found"}</span>}
      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-180")} aria-hidden="true" />
    </>
  );
}

// The model's working notes (its reasoning summary): open and growing while the run is
// in flight, collapsed to a one-line record once it's done. Never styled as conclusions.
function RunNotes({ run }: { run: AnalysisRun }) {
  const running = run.status === "running";
  const stage = useStage(running && !run.notes);
  const content = useRef<HTMLDivElement>(null);
  const duration = run.startedAt && run.finishedAt ? Math.max(1, Math.ceil((run.finishedAt - run.startedAt) / 1000)) : undefined;
  // Keep the newest notes in view while they stream.
  useEffect(() => {
    if (running && content.current) content.current.scrollTop = content.current.scrollHeight;
  }, [running, run.notes]);
  if (!running && !run.notes) return null;
  if (!run.notes) {
    return (
      <div className="mt-2 flex items-center gap-3">
        <TileGrid mode="searching" />
        <p role="status" aria-live="polite" className="leading-5 text-muted-foreground">
          <span key={stage} className="inline-block animate-in fade-in-0 duration-300 ease-out motion-safe:slide-in-from-bottom-1 motion-safe:blur-in-4">{stages[stage]}…</span>
        </p>
      </div>
    );
  }
  return (
    <Reasoning isStreaming={running} duration={duration} className="mt-2 mb-0">
      <ReasoningTrigger className="w-fit gap-2 text-xs"><NotesLabel running={running} topic={currentTopic(run.notes)} /></ReasoningTrigger>
      <ReasoningContent ref={content} className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4">
        {run.notes}
      </ReasoningContent>
    </Reasoning>
  );
}

type Run = AnalysisRun;

function AnalysisRow({ run, listShownAt }: { run: Run; listShownAt: number }) {
  const { startAnalysis, isAnalyzing: busy, isUploading, configuration } = useWorkspace();
  const available = configuration.data?.configured === true;
  const ref = useRef<HTMLLIElement>(null);
  // Captured at mount: a row that arrived after the list was already showing
  // keeps its entrance and animates its result. Rows from the first load don't.
  const [entered] = useState(() => Date.now() - listShownAt > 500);
  const [wasRunning] = useState(run.status === "running");
  useEffect(() => {
    if (!entered) return;
    ref.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [entered]);
  const reveal = "animate-in fade-in-0 duration-300 ease-out motion-safe:slide-in-from-bottom-1 motion-safe:blur-in-4";
  return (
    <li ref={ref} className={cn("py-3 text-xs", entered && "animate-in fade-in-0 duration-300 ease-out motion-safe:slide-in-from-bottom-3 motion-safe:blur-in-4")}>
      <p className="break-words text-sm font-medium">{run.sources.map((source) => source.name).join(", ")}</p>
      {run.status === "failed" ? (
        <div className={cn("mt-2", wasRunning && reveal)}>
          <p className="leading-5 text-destructive">{run.error}</p>
          <Button size="sm" variant="outline" className="mt-2" disabled={isUploading || busy || !available} onClick={() => void startAnalysis(run.sources.map((source) => source.id))}>Retry analysis</Button>
        </div>
      ) : null}
      {run.status === "completed" ? (
        <div className={cn("mt-1 flex flex-wrap items-center justify-between gap-2", wasRunning && reveal)}>
          <p className="flex items-start gap-1.5 leading-5 text-muted-foreground">
            {wasRunning ? <Check className="mt-1 size-3 shrink-0 text-primary" aria-hidden="true" /> : null}
            <span>{run.suggestionCount ? `${run.suggestionCount} ${run.suggestionCount === 1 ? "suggestion" : "suggestions"} ready for review.` : "No new preferences found. Existing decisions are unchanged."}{run.rejectedCount ? ` ${run.rejectedCount} discarded because the source quotes could not be verified.` : ""}</span>
          </p>
          {run.suggestionCount ? <Button asChild variant="ghost" size="sm" className="-mr-2 px-2 text-sm"><Link href="/review">Review preferences <ArrowRight className="size-3" aria-hidden="true" /></Link></Button> : null}
        </div>
      ) : null}
      <RunNotes run={run} />
    </li>
  );
}

// Mounts with the first loaded data, so rows can tell "here from the start" from "arrived live".
function RunList({ runs }: { runs: Run[] }) {
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
