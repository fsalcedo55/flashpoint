import { useState } from "react";
import { Download, FileText, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize, type SessionDocument } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace-provider";
import { AnalysisNotices, AnalysisRuns, SelectionBar } from "@/components/document-analysis";
import { MAX_ANALYSIS_DOCUMENTS } from "@/lib/analysis";

const rowAction = cn("shrink-0 text-muted-foreground/60 opacity-0 transition-[opacity,color] duration-150 hover:text-foreground",
  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100");

function DocumentText({ document }: { document: SessionDocument }) {
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <p className="text-xs text-muted-foreground">{document.sectionCount} {document.fileType === "pdf" ? "pages" : "paragraphs"} · {document.characterCount.toLocaleString()} characters</p>
      <Button asChild variant="outline" size="sm"><a href={document.url} download={document.name}><Download aria-hidden="true" /> Download original</a></Button>
    </div>
    <div className="min-h-0 overflow-y-auto overscroll-contain pr-2">
      {document.warnings.map((warning) => <p key={warning} className="mb-5 rounded-lg border bg-secondary p-3 text-xs leading-5">{warning}</p>)}
      <div className="space-y-6">
        {document.sections.map((section) => <section key={section.location} aria-label={section.location}>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{section.location}</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{section.text || "No readable text on this page."}</p>
        </section>)}
      </div>
    </div>
  </>;
}

export function SavedDocuments() {
  const { documents, selectedIds, toggleDocument, retryDocument, removeDocument, isAnalyzing, error, clearError } = useWorkspace();
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
    <ul className="divide-y rounded-xl border bg-white px-4">
      {documents.map((document) => {
        const processing = document.status === "processing";
        const ready = document.status === "ready";
        return <li key={document.id} className="group/row py-3">
          <div className="flex items-center gap-3">
            <label className="-my-2 -ml-3 flex size-11 shrink-0 items-center justify-center">
              <input type="checkbox" aria-label={`Select ${document.name} for analysis`}
                className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                disabled={!ready || isAnalyzing || (!selectedIds.includes(document.id) && selectedIds.length >= MAX_ANALYSIS_DOCUMENTS)}
                checked={selectedIds.includes(document.id)} onChange={(event) => toggleDocument(document.id, event.target.checked)} />
            </label>
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {ready ? <button type="button" className="break-words text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none" aria-label={`View text of ${document.name}`} onClick={() => setSelectedId(document.id)}>{document.name}</button>
                : <p className="break-words text-sm font-medium">{document.name}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{document.fileType.toUpperCase()} · {formatFileSize(document.byteSize)}{ready ? ` · ${document.sectionCount} ${document.fileType === "pdf" ? "pages" : "paragraphs"}` : ""}</p>
            </div>
            {processing ? <Badge variant="secondary" className="shrink-0 gap-1 rounded-md text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Processing</Badge> : null}
            {document.status === "failed" ? <Button variant="outline" size="sm" className="shrink-0" aria-label={`Retry extraction of ${document.name}`} onClick={() => retryDocument(document.id)}><RefreshCw className="size-3" aria-hidden="true" />Retry</Button> : null}
            <Button asChild variant="ghost" size="icon-sm" className={rowAction}><a href={document.url} download={document.name} aria-label={`Download original ${document.name}`}><Download aria-hidden="true" /></a></Button>
            <Button variant="ghost" size="icon-sm" className={cn(rowAction, "-mr-2 hover:text-destructive")} aria-label={`Delete ${document.name}`} disabled={processing || isAnalyzing} onClick={() => { clearError(); setDeletingId(document.id); }}><Trash2 aria-hidden="true" /></Button>
          </div>
          {document.error ? <p role="alert" className="mt-2 pl-10 text-xs leading-5 text-destructive">{document.error}</p> : null}
          {document.warnings.map((warning) => <p key={warning} className="mt-2 pl-10 text-xs leading-5 text-muted-foreground">{warning}</p>)}
        </li>;
      })}
    </ul>
    <AnalysisRuns />
    <SelectionBar />
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent className="flex max-h-[85svh] flex-col p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="break-words leading-6">{selected?.name ?? "Extracted text"}</DialogTitle>
          <DialogDescription>Extracted text with source references. Formatting and images are not included.</DialogDescription>
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
