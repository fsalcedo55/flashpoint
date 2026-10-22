import { useRef, useState, type DragEvent } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES, formatFileSize } from "@/lib/documents";
import { useWorkspace } from "@/components/workspace-provider";
import { SavedDocuments } from "@/components/saved-documents";

export default function DocumentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const { documents, addFiles } = useWorkspace();
  const isEmpty = documents.length === 0;

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDragLeave: (event: DragEvent) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); },
    onDrop: (event: DragEvent) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(Array.from(event.dataTransfer.files)); },
  };

  return (
    <div>
      <PageHeading title="Your documents" />

      <input ref={inputRef} type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        multiple className="sr-only" tabIndex={-1} aria-label="Select document files"
        onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />

      {isEmpty ? (
        // First run: the upload area is the page.
        <div {...dropHandlers}
          className={cn("relative flex min-h-[310px] flex-col items-center justify-center rounded-xl border border-dashed px-5 py-10 text-center transition-colors sm:min-h-[330px]", dragging ? "border-primary bg-accent" : "border-input bg-white")}>
          <div className="stagger-item mb-6 flex size-[60px] items-center justify-center rounded-2xl bg-secondary text-foreground">
            <Upload className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="stagger-item text-lg font-semibold">{dragging ? "Drop your documents here" : "Add your documents"}</h2>
          <p className="stagger-item mt-2 max-w-md text-sm leading-6 text-muted-foreground">Drag text-based PDF, DOCX or PPTX files here, or choose them below.</p>
          <Button className="stagger-item mt-6 h-10 gap-2 px-5" onClick={() => inputRef.current?.click()}>
            <Plus className="size-4" aria-hidden="true" /> Choose files
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">Up to {formatFileSize(MAX_FILE_BYTES)} each · Scanned pages aren’t read yet</p>
        </div>
      ) : (
        // Returning: a slim strip keeps upload one step away without burying the list.
        <div {...dropHandlers}
          className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-dashed px-4 py-3 transition-colors", dragging ? "border-primary bg-accent" : "border-input bg-white")}>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="hidden whitespace-nowrap sm:inline">{dragging ? "Drop to add documents" : "Drag documents here, or"}</span>
            <Button variant="outline" size="sm" className="bg-white" onClick={() => inputRef.current?.click()}>
              <Plus aria-hidden="true" /> Choose files
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">PDF, DOCX or PPTX · {formatFileSize(MAX_FILE_BYTES)} each</p>
        </div>
      )}

      <SavedDocuments />
    </div>
  );
}
