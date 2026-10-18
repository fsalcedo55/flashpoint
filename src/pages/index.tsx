import { useRef, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES, MAX_FILES } from "@/lib/documents";
import { useTRPC } from "@/lib/trpc";
import { SavedDocuments, type PendingUpload } from "@/components/saved-documents";

function fileKey(file: File) {
  return [file.name, file.size, file.lastModified].join(":");
}

export default function DocumentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  // Files upload as soon as they're chosen; each shows in the list while in flight.
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const documents = useQuery(trpc.documents.list.queryOptions());
  const isEmpty = documents.data?.length === 0 && pending.length === 0;

  function addFiles(incoming: File[]) {
    const errors: string[] = [];
    const accepted: File[] = [];
    const inFlight = pending.filter((item) => !item.error).length;
    for (const file of incoming) {
      if (!/\.(pdf|docx)$/i.test(file.name)) {
        errors.push(file.name + ": choose a PDF or DOCX file.");
      } else if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        errors.push(file.name + ": files must be nonempty and no larger than 10 MB.");
      } else if (pending.some((item) => item.key === fileKey(file)) || accepted.some((item) => fileKey(item) === fileKey(file))) {
        continue;
      } else if (inFlight + accepted.length >= MAX_FILES) {
        errors.push(`You can upload up to ${MAX_FILES} files at a time.`);
        break;
      } else {
        accepted.push(file);
      }
    }
    setError(errors.join(" "));
    if (!accepted.length) return;
    setPending((current) => [...accepted.map((file) => ({ key: fileKey(file), name: file.name, size: file.size })), ...current]);
    for (const file of accepted) queue.current = queue.current.then(() => upload(file));
  }

  async function upload(file: File) {
    const key = fileKey(file);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/documents/upload", { method: "POST", body, signal: AbortSignal.timeout(120_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed. Try again.");
      await queryClient.invalidateQueries({ queryKey: trpc.documents.list.queryKey() });
      setRecentIds((current) => current.includes(result.id) ? current : [...current, result.id]);
      setPending((current) => current.filter((item) => item.key !== key));
    } catch (error) {
      const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "The request timed out. Check Saved documents before retrying.";
      setPending((current) => current.map((item) => item.key === key ? { ...item, error: message } : item));
    }
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDragLeave: (event: DragEvent) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); },
    onDrop: (event: DragEvent) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(Array.from(event.dataTransfer.files)); },
  };

  return (
    <div>
      <PageHeading title="Your documents" />

      <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple className="sr-only" tabIndex={-1} aria-label="Select questionnaire files"
        onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />

      {isEmpty ? (
        // First run: the upload area is the page.
        <div {...dropHandlers}
          className={cn("relative flex min-h-[310px] flex-col items-center justify-center rounded-xl border border-dashed px-5 py-10 text-center transition-colors sm:min-h-[330px]", dragging ? "border-primary bg-accent" : "border-input bg-white")}>
          <div className="stagger-item mb-6 flex size-[60px] items-center justify-center rounded-2xl bg-secondary text-foreground">
            <Upload className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="stagger-item text-lg font-semibold">{dragging ? "Drop your questionnaires here" : "Add your questionnaires"}</h2>
          <p className="stagger-item mt-2 max-w-md text-sm leading-6 text-muted-foreground">Drag text-based PDF or DOCX files here, or choose them below.</p>
          <Button className="stagger-item mt-6 h-10 gap-2 px-5" onClick={() => inputRef.current?.click()}>
            <Plus className="size-4" aria-hidden="true" /> Choose files
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">Up to 10 MB each · Scanned pages aren’t read yet</p>
        </div>
      ) : (
        // Returning: a slim strip keeps upload one step away without burying the list.
        <div {...dropHandlers}
          className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-dashed px-4 py-3 transition-colors", dragging ? "border-primary bg-accent" : "border-input bg-white")}>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="hidden whitespace-nowrap sm:inline">{dragging ? "Drop to add questionnaires" : "Drag questionnaires here, or"}</span>
            <Button variant="outline" size="sm" className="bg-white" onClick={() => inputRef.current?.click()}>
              <Plus aria-hidden="true" /> Choose files
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">PDF or DOCX · 10 MB each</p>
        </div>
      )}

      {error ? <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{error}</p> : null}

      <SavedDocuments pending={pending} recentIds={recentIds} onDismissPending={(key) => setPending((current) => current.filter((item) => item.key !== key))} />
    </div>
  );
}
