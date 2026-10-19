import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { MAX_ANALYSIS_DOCUMENTS, prepareAnalysisSources, type AnalysisResult } from "@/lib/analysis";
import { extractedDocumentSchema, formatFileSize, MAX_FILE_BYTES, MAX_FILES, type SessionDocument } from "@/lib/documents";
import type { PreferenceStatus } from "@/lib/preferences";
import { completeAnalysis, decidePreference, deleteDocument, deletePreference, emptyWorkspace, type WorkspaceState } from "@/lib/workspace";
import type { AnalysisRun } from "@/lib/analysis";

function useSessionWorkspace() {
  const [state, setState] = useState(emptyWorkspace);
  // Synchronous snapshot for queued requests and rapid clicks, never module-level state.
  const current = useRef(state);
  const generation = useRef(0);
  const queue = useRef(Promise.resolve());
  const requests = useRef(new Set<AbortController>());
  const urls = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const configuration = useQuery(trpc.analyses.configuration.queryOptions());

  function update(change: (previous: WorkspaceState) => WorkspaceState) {
    current.current = change(current.current);
    setState(current.current);
  }
  function revoke(url: string) { URL.revokeObjectURL(url); urls.current.delete(url); }
  useEffect(() => {
    const activeRequests = requests.current;
    const activeUrls = urls.current;
    return () => {
      generation.current += 1;
      activeRequests.forEach((request) => request.abort());
      activeRequests.clear();
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
      activeUrls.clear();
    };
  }, []);

  async function extract(id: string, session: number) {
    const document = current.current.documents.find((item) => item.id === id);
    if (!document || session !== generation.current) return;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await document.file.arrayBuffer());
      if (session !== generation.current) return;
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const duplicate = current.current.documents.find((item) => item.id !== id && item.sha256 === sha256 && item.status === "ready");
      if (duplicate) {
        update((previous) => ({ ...previous, documents: previous.documents.filter((item) => item.id !== id),
          selectedIds: [...new Set([...previous.selectedIds, duplicate.id])].slice(0, MAX_ANALYSIS_DOCUMENTS) }));
        revoke(document.url);
        setAnnouncement(`${document.name} is already in this session.`);
        return;
      }
      update((previous) => ({ ...previous, documents: previous.documents.map((item) => item.id === id ? { ...item, sha256 } : item) }));
      const body = new FormData();
      body.append("file", document.file);
      const response = await fetch("/api/documents/upload", { method: "POST", body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]) });
      const result = await response.json().catch(() => { throw new Error("The upload could not be processed. Try a smaller file."); });
      if (!response.ok) throw new Error(result.error || "Upload failed. Try again.");
      const extracted = extractedDocumentSchema.parse(result);
      if (session !== generation.current) return;
      update((previous) => ({ ...previous,
        documents: previous.documents.map((item) => item.id === id ? { ...item, ...extracted, status: "ready", error: undefined } : item),
        selectedIds: [...new Set([...previous.selectedIds, id])].slice(0, MAX_ANALYSIS_DOCUMENTS),
      }));
    } catch (cause) {
      if (session !== generation.current) return;
      const message = cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Extraction timed out. Try again.";
      update((previous) => ({ ...previous, documents: previous.documents.map((item) => item.id === id ? { ...item, status: "failed", error: message } : item) }));
    } finally {
      requests.current.delete(controller);
    }
  }

  function addFiles(files: File[]) {
    const errors: string[] = [];
    const added: SessionDocument[] = [];
    const inFlight = current.current.documents.filter((item) => item.status === "processing").length;
    for (const file of files) {
      if (!/\.(pdf|docx)$/i.test(file.name)) { errors.push(`${file.name}: choose a PDF or DOCX.`); continue; }
      if (!file.size || file.size > MAX_FILE_BYTES) { errors.push(`${file.name}: choose a nonempty file up to ${formatFileSize(MAX_FILE_BYTES)}.`); continue; }
      if (inFlight + added.length >= MAX_FILES) { errors.push(`Add up to ${MAX_FILES} files at a time.`); break; }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      added.push({ id: crypto.randomUUID(), name: file.name.slice(0, 255), file, url, byteSize: file.size,
        fileType: /\.pdf$/i.test(file.name) ? "pdf" : "docx", status: "processing",
        sections: [], warnings: [], characterCount: 0, sectionCount: 0 });
    }
    setError(errors.join(" ") || null);
    update((previous) => ({ ...previous, documents: [...previous.documents, ...added] }));
    const session = generation.current;
    for (const document of added) queue.current = queue.current.then(() => extract(document.id, session));
  }

  function retryDocument(id: string) {
    const document = current.current.documents.find((item) => item.id === id);
    if (!document || document.status !== "failed") return;
    update((previous) => ({ ...previous, documents: previous.documents.map((item) => item.id === id ? { ...item, status: "processing", error: undefined } : item) }));
    const session = generation.current;
    queue.current = queue.current.then(() => extract(id, session));
  }

  function toggleDocument(id: string, checked: boolean) {
    update((previous) => {
      if (!previous.documents.some((item) => item.id === id && item.status === "ready")) return previous;
      return { ...previous, selectedIds: checked
        ? [...new Set([...previous.selectedIds, id])].slice(0, MAX_ANALYSIS_DOCUMENTS)
        : previous.selectedIds.filter((item) => item !== id) };
    });
  }
  function clearSelection() { update((previous) => ({ ...previous, selectedIds: [] })); }

  async function startAnalysis(ids: string[]) {
    if (current.current.analyses.some((run) => run.status === "running")) return;
    const documents = ids.map((id) => current.current.documents.find((item) => item.id === id));
    if (!ids.length || ids.length > MAX_ANALYSIS_DOCUMENTS || new Set(ids).size !== ids.length || documents.some((item) => item?.status !== "ready")) {
      setError("Select one to five ready documents."); return;
    }
    const selected = documents.filter((item): item is SessionDocument => Boolean(item)).sort((a, b) => a.id.localeCompare(b.id));
    const key = JSON.stringify([configuration.data?.model, selected.map((item) => item.sha256)]);
    if (current.current.analyses.some((run) => run.key === key && run.status === "completed")) {
      clearSelection(); setAnnouncement("This selection has already been analyzed in this session."); return;
    }
    const input = { documents: selected.map(({ id, name, sections }) => ({ id, name, sections })) };
    try {
      prepareAnalysisSources(input);
    } catch (cause) {
      setError((cause as Error).message); return;
    }
    const id = crypto.randomUUID();
    const session = generation.current;
    const controller = new AbortController();
    requests.current.add(controller);
    setError(null);
    update((previous) => ({ ...previous, analyses: [{ id, key, sources: selected.map(({ id, name }) => ({ id, name })),
      status: "running", suggestionCount: 0, rejectedCount: 0, startedAt: Date.now() }, ...previous.analyses.filter((run) => run.key !== key)] }));
    const patch = (change: Partial<AnalysisRun>) => update((previous) => ({ ...previous,
      analyses: previous.analyses.map((run) => run.id === id ? { ...run, ...change } : run) }));
    // Reasoning arrives in small deltas; batch them so each one doesn't re-render the workspace.
    let pendingNotes = "";
    let flush: ReturnType<typeof setTimeout> | undefined;
    const flushNotes = () => {
      flush = undefined;
      if (!pendingNotes || session !== generation.current) return;
      const text = pendingNotes; pendingNotes = "";
      update((previous) => ({ ...previous, analyses: previous.analyses.map((run) => run.id === id ? { ...run, notes: (run.notes ?? "") + text } : run) }));
    };
    try {
      const events = await trpcClient.analyses.start.mutate(input, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(110_000)]) });
      let result: AnalysisResult | undefined;
      for await (const event of events) {
        if (event.type === "note") { pendingNotes += event.text; flush ??= setTimeout(flushNotes, 120); }
        else result = event.result;
      }
      if (flush) clearTimeout(flush);
      flushNotes();
      if (session !== generation.current) return;
      if (!result) throw new Error("The analysis ended without a result. Try again.");
      const completedResult = result;
      update((previous) => completeAnalysis(previous, id, completedResult));
      patch({ finishedAt: Date.now() });
      setAnnouncement("Analysis complete. Suggestions are ready for review.");
    } catch (cause) {
      if (flush) clearTimeout(flush);
      if (session !== generation.current) return;
      const message = cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Analysis timed out. Try again.";
      patch({ status: "failed", error: message, finishedAt: Date.now() });
    } finally { requests.current.delete(controller); }
  }

  function decide(id: string, status: PreferenceStatus, rule?: string) {
    try {
      update((previous) => decidePreference(previous, id, status, rule));
      setError(null); setAnnouncement(status === "pending" ? "Preference returned to review." : `Preference ${status}.`);
      return true;
    } catch (cause) { setError((cause as Error).message); return false; }
  }
  function removePreference(id: string) {
    update((previous) => deletePreference(previous, id));
    setError(null); setAnnouncement("Preference deleted from this session.");
  }
  function removeDocument(id: string) {
    const document = current.current.documents.find((item) => item.id === id);
    try {
      update((previous) => deleteDocument(previous, id));
      if (document) revoke(document.url);
      setError(null); return true;
    } catch (cause) { setError((cause as Error).message); return false; }
  }
  function resetWorkspace() {
    generation.current += 1;
    requests.current.forEach((request) => request.abort());
    requests.current.clear();
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
    queue.current = Promise.resolve();
    update(emptyWorkspace);
    setError(null); setAnnouncement("Workspace cleared.");
  }

  return { ...state, configuration, addFiles, retryDocument, toggleDocument, clearSelection, startAnalysis,
    decide, removePreference, removeDocument, resetWorkspace, error, clearError: () => setError(null), announcement,
    isUploading: state.documents.some((item) => item.status === "processing"),
    isAnalyzing: state.analyses.some((run) => run.status === "running") };
}

const WorkspaceContext = createContext<ReturnType<typeof useSessionWorkspace> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useSessionWorkspace();
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
