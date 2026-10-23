import { useState } from "react";
import { Download, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize, formatSectionCount, type SessionDocument } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace-provider";
import { AnimatePresence, motion } from "motion/react";
import { rise } from "@/lib/motion";
import { AnalysisNotices, AnalysisRuns, SelectionBar } from "@/components/document-analysis";
import { MAX_ANALYSIS_DOCUMENTS } from "@/lib/analysis";
import { documentPurposeLabels } from "@/lib/document-purpose";

const rowAction = cn("shrink-0 text-muted-foreground/60 opacity-0 transition-[opacity,color] duration-150 hover:text-foreground",
  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 disabled:invisible");

function DocumentText({ document }: { document: SessionDocument }) {
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <p className="text-xs text-muted-foreground">{formatSectionCount(document.sectionCount, document.fileType)} · {document.characterCount.toLocaleString()} characters</p>
      <Button asChild variant="outline" size="sm"><a href={document.url} download={document.name}><Download aria-hidden="true" /> Download original</a></Button>
    </div>
    <div className="min-h-0 overflow-y-auto overscroll-contain pr-2">
      {document.classification ? <section aria-label="Document classification" className="mb-5 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Detected type: {documentPurposeLabels[document.classification.purpose]}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{document.classification.rationale}</p>
        {document.classification.evidence.map((citation, index) => <figure key={index} className="mt-3 text-xs leading-5">
          <figcaption className="text-muted-foreground">{citation.location}</figcaption>
          <blockquote className="mt-1 border-l-2 pl-3 whitespace-pre-wrap break-words">{citation.quote}</blockquote>
        </figure>)}
      </section> : null}
      {document.warnings.map((warning) => <p key={warning} className="mb-5 rounded-lg border bg-secondary p-3 text-xs leading-5">{warning}</p>)}
      <div className="space-y-6">
        {document.sections.map((section) => <section key={section.location} aria-label={section.location}>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{section.location}</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{section.text || "No extracted text in this section."}</p>
          {section.imageId && document.assets?.[section.imageId] ? (
            // Already resized and validated during upload; stays in session memory.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={document.assets[section.imageId]} alt={`Embedded image from ${section.location}`} className="mt-3 max-h-80 max-w-full rounded-md object-contain" />
          ) : null}
        </section>)}
      </div>
    </div>
  </>;
}

export function SavedDocuments() {
  const { documents, analyses, selectedIds, toggleDocument, retryDocument, removeDocument, isAnalyzing, error, clearError } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selected = documents.find((item) => item.id === selectedId);
  const deleting = documents.find((item) => item.id === deletingId);
  if (!documents.length) return null;

  return <section aria-label="Session documents" className="mt-8">
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-lg font-semibold">Session documents</h2>
      <Badge variant="secondary" className="rounded-md text-xs tabular-nums">{documents.length}</Badge>
    </div>
    <AnalysisNotices />
    {/* Rows here on load stay put; rows added or deleted afterwards fade, and the rest slide to their new place. */}
    <ul className="relative divide-y rounded-xl border bg-white px-4">
      <AnimatePresence initial={false} mode="popLayout">
        {documents.map((document) => {
          const processing = document.status === "processing";
          const ready = document.status === "ready";
          const analyzing = analyses.some((run) => run.status === "running" && run.sources.some((source) => source.id === document.id));
          return <motion.li key={document.id} layout="position" {...rise} className="group/row py-3">
            <div className="flex items-center gap-3">
              <label className="-my-2 -ml-3 flex size-11 shrink-0 items-center justify-center">
                <input type="checkbox" aria-label={`Select ${document.name} for analysis`}
                  className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  disabled={!ready || isAnalyzing || (!selectedIds.includes(document.id) && selectedIds.length >= MAX_ANALYSIS_DOCUMENTS)}
                  checked={selectedIds.includes(document.id)} onChange={(event) => toggleDocument(document.id, event.target.checked)} />
              </label>
              <div className="min-w-0 flex-1">
                {ready ? <button type="button" className="text-left text-sm font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline active:underline focus-visible:underline focus-visible:outline-none" aria-label={`View content of ${document.name}`} onClick={() => setSelectedId(document.id)}>{document.name}</button>
                  : <p className="text-sm font-medium [overflow-wrap:anywhere]">{document.name}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-muted-foreground">{document.fileType.toUpperCase()} · {formatFileSize(document.byteSize)}{ready ? ` · ${formatSectionCount(document.sectionCount, document.fileType)}` : ""}</span>
                  {processing ? <Badge variant="secondary" className="gap-1 rounded-md text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Processing</Badge>
                    : !ready ? null : analyzing ? <Badge variant="secondary" className="gap-1 rounded-md text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Analyzing</Badge>
                    : document.classification ? (
                      // The type itself opens its explanation; a separate link on every row was noise.
                      <Badge asChild variant="secondary" className={cn("cursor-pointer rounded-md text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", document.classification.purpose !== "other" && document.classification.purpose !== "uncertain" && "bg-accent text-accent-foreground")}>
                        <button type="button" title="Why this type?" aria-label={`Detected type: ${documentPurposeLabels[document.classification.purpose]}. Why this type for ${document.name}?`} onClick={() => setSelectedId(document.id)}>
                          {documentPurposeLabels[document.classification.purpose]}
                        </button>
                      </Badge>
                    ) : <Badge variant="secondary" className="rounded-md text-xs font-normal text-muted-foreground">Not analyzed</Badge>}
                </div>
              </div>
              <Button asChild variant="ghost" size="icon-sm" className={rowAction}><a href={document.url} download={document.name} aria-label={`Download original ${document.name}`}><Download aria-hidden="true" /></a></Button>
              <Button variant="ghost" size="icon-sm" className={cn(rowAction, "-mr-2 hover:text-destructive")} aria-label={`Delete ${document.name}`} disabled={processing || isAnalyzing} onClick={() => { clearError(); setDeletingId(document.id); }}><Trash2 aria-hidden="true" /></Button>
            </div>
            {/* Status and its fix sit under the name, so trailing controls never squeeze it on narrow screens. */}
            {document.error || document.status === "failed" ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-11">
              {document.error ? <p role="alert" className="text-xs leading-5 text-destructive">{document.error}</p> : null}
              {document.status === "failed" ? <Button variant="outline" size="sm" aria-label={`Retry extraction of ${document.name}`} onClick={() => retryDocument(document.id)}><RefreshCw className="size-3" aria-hidden="true" />Retry</Button> : null}
            </div> : null}
          </motion.li>;
        })}
      </AnimatePresence>
    </ul>
    <AnalysisRuns />
    <SelectionBar />
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent className="flex max-h-[85svh] flex-col p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="break-words leading-6">{selected?.name ?? "Extracted text"}</DialogTitle>
          <DialogDescription>Extracted content with source references. Presentation notes, charts, formatting properties and supported images are labeled separately.</DialogDescription>
        </DialogHeader>
        {selected ? <DocumentText document={selected} /> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this document?</DialogTitle>
          <DialogDescription><span className="font-medium text-foreground [overflow-wrap:anywhere]">{deleting?.name}</span> will be removed from this session. You can add the original file again.</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { if (deleting && removeDocument(deleting.id)) setDeletingId(null); }}>Delete document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
