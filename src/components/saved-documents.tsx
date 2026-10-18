import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/lib/trpc";
import { AnalysisNotices, AnalysisRuns, SelectionBar, useDocumentAnalysis } from "@/components/document-analysis";
import { MAX_ANALYSIS_DOCUMENTS } from "@/lib/analysis";

export type PendingUpload = { key: string; name: string; size: number; error?: string };

// Secondary row actions: hidden until the row is hovered or focused, always
// shown on touch screens (no hover there), light at rest, full on hover.
const rowAction = cn(
  "shrink-0 text-muted-foreground/60 opacity-0 transition-[opacity,color] duration-150 hover:text-foreground",
  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
);

function DocumentText({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.documents.get.queryOptions({ id }));
  if (query.isPending) return <p role="status" className="py-8 text-muted-foreground">Loading extracted text…</p>;
  if (query.isError) return <div role="alert"><p>{query.error.message}</p><Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="text-xs text-muted-foreground">{query.data.sectionCount} {query.data.fileType === "pdf" ? "pages" : "paragraphs"} · {query.data.characterCount.toLocaleString()} characters</p>
        <Button asChild variant="outline" size="sm"><a href={`/api/documents/${id}/download`}><Download aria-hidden="true" /> Download original</a></Button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain pr-2">
        {query.data.warnings.map((warning) => <p key={warning} className="mb-5 rounded-lg border bg-secondary p-3 text-xs leading-5">{warning}</p>)}
        <div className="space-y-6">
          {query.data.sections.map((section) => (
            <section key={section.location} aria-label={section.location}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{section.location}</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">{section.text || "No readable text on this page."}</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function SavedDocuments({ pending, recentIds, onDismissPending }: { pending: PendingUpload[]; recentIds: string[]; onDismissPending: (key: string) => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const autoSelected = useRef(new Set<string>());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.documents.list.queryKey() });
  const retry = useMutation(trpc.documents.retry.mutationOptions({ onSettled: invalidate }));
  const remove = useMutation(trpc.documents.delete.mutationOptions({
    onSuccess: ({ id }) => { setCheckedIds((current) => current.filter((item) => item !== id)); setDeleting(null); },
    onSettled: invalidate,
  }));
  const isUploading = pending.some((item) => !item.error);
  const query = useQuery(trpc.documents.list.queryOptions(undefined, {
    refetchInterval: (query) => isUploading || retry.isPending || query.state.data?.some((document) => document.status === "processing") ? 1500 : false,
  }));
  const analysis = useDocumentAnalysis();
  const documents = query.data ?? [];
  const selectedIds = checkedIds.filter((id) => documents.some((document) => document.id === id && document.status === "ready"));
  const disabled = isUploading || query.isError;

  // What you just uploaded is what you most likely want to analyze: select it once it's ready.
  useEffect(() => {
    const ready = recentIds.filter((id) => !autoSelected.current.has(id) && query.data?.some((document) => document.id === id && document.status === "ready"));
    if (!ready.length) return;
    ready.forEach((id) => autoSelected.current.add(id));
    setCheckedIds((current) => [...current, ...ready.filter((id) => !current.includes(id))].slice(0, MAX_ANALYSIS_DOCUMENTS));
  }, [recentIds, query.data]);

  if (query.isPending) return <p role="status" className="mt-8 text-sm text-muted-foreground">Loading documents…</p>;
  if (query.isError) return <div role="alert" className="mt-8 rounded-xl border bg-white p-4 text-sm"><p>{query.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>Reload documents</Button></div>;
  if (!documents.length && !pending.length) return null;

  return (
    <section aria-label="Saved documents" className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">Saved documents</h2>
        {documents.length ? <Badge variant="secondary" className="rounded-md text-xs tabular-nums">{documents.length}</Badge> : null}
      </div>
      <AnalysisNotices analysis={analysis} />
      {retry.isError ? <p role="alert" className="mb-3 text-sm text-destructive">{retry.error.message}</p> : null}
      <ul className="divide-y rounded-xl border bg-white px-4">
        {pending.map((item) => (
          <li key={item.key} className="py-3">
            <div className="flex items-center gap-3">
              <span className="-ml-3 flex size-11 shrink-0 items-center justify-center"><input type="checkbox" disabled className="size-4" aria-hidden="true" tabIndex={-1} /></span>
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(item.size)}</p>
              </div>
              {item.error ? (
                <Button variant="ghost" size="sm" className="-mr-2 shrink-0" onClick={() => onDismissPending(item.key)}>Dismiss</Button>
              ) : <Badge variant="secondary" className="shrink-0 gap-1 rounded-md text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Uploading</Badge>}
            </div>
            {item.error ? <p role="alert" className="mt-2 pl-10 text-xs leading-5 text-destructive">{item.error}</p> : null}
          </li>
        ))}
        {documents.map((document) => {
          const processing = document.status === "processing" || (retry.isPending && retry.variables?.id === document.id);
          const ready = document.status === "ready" && !processing;
          return (
            <li key={document.id} className="group/row py-3">
              <div className="flex items-center gap-3">
                <label className="-my-2 -ml-3 flex size-11 shrink-0 items-center justify-center">
                  <input type="checkbox" aria-label={`Select ${document.name} for analysis`}
                    className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    disabled={!ready || (!checkedIds.includes(document.id) && selectedIds.length >= MAX_ANALYSIS_DOCUMENTS)}
                    checked={checkedIds.includes(document.id)}
                    onChange={(event) => setCheckedIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} />
                </label>
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {ready ? (
                    <button type="button" className="break-words text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none" aria-label={`View text of ${document.name}`} onClick={() => setSelected(document)}>{document.name}</button>
                  ) : <p className="break-words text-sm font-medium">{document.name}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{document.fileType?.toUpperCase()} · {formatFileSize(document.byteSize ?? 0)}{ready ? ` · ${document.sectionCount} ${document.fileType === "pdf" ? "pages" : "paragraphs"}` : ""}</p>
                </div>
                {processing ? <Badge variant="secondary" className="shrink-0 gap-1 rounded-md text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Processing</Badge> : null}
                {document.status === "failed" && !processing ? (
                  <Button variant="outline" size="sm" className="shrink-0" aria-label={`Retry extraction of ${document.name}`} disabled={retry.isPending} onClick={() => retry.mutate({ id: document.id })}><RefreshCw className="size-3" aria-hidden="true" />Retry</Button>
                ) : null}
                <Button asChild variant="ghost" size="icon-sm" className={rowAction}><a href={`/api/documents/${document.id}/download`} aria-label={`Download original ${document.name}`}><Download aria-hidden="true" /></a></Button>
                <Button variant="ghost" size="icon-sm" className={cn(rowAction, "-mr-2 hover:text-destructive")} aria-label={`Delete ${document.name}`} disabled={processing} onClick={() => { remove.reset(); setDeleting(document); }}><Trash2 aria-hidden="true" /></Button>
              </div>
              {document.error && !processing ? <p className="mt-2 pl-10 text-xs leading-5 text-destructive">{document.error}</p> : null}
              {document.warnings.map((warning) => <p key={warning} className="mt-2 pl-10 text-xs leading-5 text-muted-foreground">{warning}</p>)}
            </li>
          );
        })}
      </ul>
      <AnalysisRuns analysis={analysis} disabled={disabled} />
      <SelectionBar analysis={analysis} selectedIds={selectedIds} onClear={() => setCheckedIds([])} disabled={disabled} />

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="flex max-h-[85svh] flex-col p-5 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="break-words leading-6">{selected?.name ?? "Extracted text"}</DialogTitle>
            <DialogDescription>Extracted text with source references. Formatting and images are not included.</DialogDescription>
          </DialogHeader>
          {selected ? <DocumentText id={selected.id} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleting(null); }}>
        <DialogContent showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle className="break-words leading-6">Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>This removes the file and its extracted text from your workspace. It can’t be undone.</DialogDescription>
          </DialogHeader>
          {remove.isError ? <p role="alert" className="text-sm text-destructive">{remove.error.message}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate({ id: deleting.id })}>{remove.isPending ? "Deleting…" : "Delete document"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
