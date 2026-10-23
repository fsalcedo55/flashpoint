import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCheck, FileText, ListChecks, Quote, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import type { Preference } from "@/lib/preferences";
import { PageHeading } from "@/components/page-heading";
import { PreferenceEditor } from "@/components/preference-editor";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";
import { documentPurposeLabels, preferencePurposeSchema, type PreferencePurpose } from "@/lib/document-purpose";

export default function ReviewPage() {
  const { preferences, documents, decide } = useWorkspace();
  const profileHref = "/profile";
  const [view, setView] = useState("pending");
  const [purpose, setPurpose] = useState<PreferencePurpose | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scoped = preferences.filter((item) => purpose === "all" || item.purpose === purpose);
  const pending = scoped.filter((item) => item.status === "pending");
  const reviewed = scoped.filter((item) => item.status !== "pending");
  const visible = view === "pending" ? pending : reviewed;
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const hasOtherPending = purpose !== "all" && preferences.some((item) => item.status === "pending" && item.purpose !== purpose);
  const completionTitle = purpose === "all" ? "Review complete" : "Review complete for this type";
  const purposes = preferencePurposeSchema.options.filter((type) => preferences.some((item) => item.purpose === type));
  const detailRef = useRef<HTMLElement>(null);

  // A decision moves the item to the other tab; keep the reviewer's place by selecting its neighbour.
  function decideAndAdvance(id: string, status: Preference["status"]) {
    if (decide(id, status)) advanceFrom(id);
  }
  function advanceFrom(id: string) {
    const index = visible.findIndex((item) => item.id === id);
    setSelectedId((visible[index + 1] ?? visible[index - 1])?.id ?? null);
    const top = detailRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) detailRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  return (
    <>
      <PageHeading title="Review preferences" />

      {!preferences.length ? (
        <div className="flex min-h-[370px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
          <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><ListChecks className="size-6" strokeWidth={1.5} aria-hidden="true" /></span>
          <h2 className="stagger-item text-lg font-semibold">No preferences to review</h2>
          <p className="stagger-item mt-3 max-w-md text-sm leading-7 text-muted-foreground">Upload documents, then select documents and choose Find preferences.</p>
          <Button asChild className="stagger-item mt-6 h-10 gap-2 px-5"><Link href="/">Your documents <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      ) : (
        <Tabs value={view} onValueChange={setView} className="gap-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <TabsList aria-label="Filter preferences">
              <TabsTrigger value="pending" className="px-4">To review <span className="ml-1 text-xs tabular-nums">{pending.length}</span></TabsTrigger>
              <TabsTrigger value="reviewed" className="px-4">Reviewed <span className="ml-1 text-xs tabular-nums">{reviewed.length}</span></TabsTrigger>
            </TabsList>
            {/* Filtering only means something once suggestions span more than one document type. */}
            {purposes.length > 1 || purpose !== "all" ? (
              <NativeSelect aria-label="Document type" value={purpose} onChange={(event) => { setPurpose(event.target.value as PreferencePurpose | "all"); setSelectedId(null); }} className="w-full bg-white sm:w-auto [&_select]:h-10">
                <NativeSelectOption value="all">All document types ({preferences.length})</NativeSelectOption>
                {preferencePurposeSchema.options.map((type) => {
                  const count = preferences.filter((item) => item.purpose === type).length;
                  return <NativeSelectOption key={type} value={type} disabled={!count}>{documentPurposeLabels[type]} ({count})</NativeSelectOption>;
                })}
              </NativeSelect>
            ) : null}
          </div>

          <TabsContent value={view} className="mt-0">
          {!selected ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
              <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><CheckCheck className="size-6" aria-hidden="true" /></span>
              <h2 className="stagger-item text-lg font-semibold">{!scoped.length ? "No preferences for this type" : view === "pending" ? completionTitle : "No reviewed preferences"}</h2>
              <p className="stagger-item mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{!scoped.length ? "Choose another document type to see its suggestions." : view === "pending" ? "All suggestions in this view have been reviewed. Confirmed preferences are in your profile." : "Reviewed suggestions will appear here after you confirm or deny them."}</p>
              {!scoped.length || (view === "pending" && hasOtherPending) ? (
                <Button variant="outline" className="stagger-item mt-6 h-10 px-5" onClick={() => { setPurpose("all"); setView("pending"); }}>Review other types <ArrowRight aria-hidden="true" /></Button>
              ) : view === "pending" ? (
                <Button asChild className="stagger-item mt-6 h-10 px-5"><Link href={profileHref}>Go to your profile <ArrowRight aria-hidden="true" /></Link></Button>
              ) : <Button variant="outline" className="stagger-item mt-6 h-10 px-5" onClick={() => setView("pending")}>Back to suggestions</Button>}
            </div>
          ) : (
            <div className="grid items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="grid min-w-0 gap-2 md:hidden">
                <Label htmlFor="mobile-preference">Choose a preference</Label>
                <NativeSelect id="mobile-preference" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="w-full bg-white [&_select]:h-11">
                  {visible.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="hidden space-y-2 md:block" aria-label="Preference suggestions">
                {visible.map((item) => (
                  <button key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selected.id}
                    className={cn("flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", item.id === selected.id ? "border-primary bg-accent" : "border-border bg-white hover:border-input")}>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-muted-foreground">{purposes.length > 1 && purpose === "all" ? `${documentPurposeLabels[item.purpose]} · ` : ""}{item.category}</span>
                      <span className="mt-2 block text-sm leading-6 font-medium">{item.title}</span>
                      <span className="mt-2 block text-xs text-muted-foreground">{item.status === "pending" ? item.evidence.length + (item.evidence.length === 1 ? " example" : " examples") : item.status === "confirmed" ? "Confirmed" : "Denied"}</span>
                    </div>
                  </button>
                ))}
              </div>

              <article ref={detailRef} key={selected.id} aria-label="Selected preference" className="min-w-0 scroll-mt-6 rounded-xl border bg-white">
                <div className="p-5 sm:p-7">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-md px-2 py-1 text-xs font-medium">{documentPurposeLabels[selected.purpose]}</Badge>
                    <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">{selected.category}</Badge>
                    <span className="text-xs text-muted-foreground">{selected.status === "pending" ? "Suggested preference" : selected.status === "confirmed" ? "Confirmed preference" : "Denied preference"}</span>
                  </div>
                  <h2 className="max-w-2xl break-words text-xl leading-normal font-medium tracking-[-0.02em]">{selected.rule}</h2>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{selected.rationale}</p>

                  <div className="mt-7 border-t pt-6">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Quote className="size-4 shrink-0 text-primary" aria-hidden="true" /> Source evidence</h3>
                    <div className="space-y-3">
                      {selected.evidence.map((evidence) => {
                        const document = documents.find((item) => item.id === evidence.documentId);
                        const imageId = document?.sections.find((section) => section.location === evidence.location)?.imageId;
                        const image = imageId ? document?.assets?.[imageId] : undefined;
                        return (
                        <figure key={(evidence.documentId ?? evidence.document) + evidence.location} className="rounded-md bg-secondary p-4">
                          <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-start gap-1.5 font-medium"><FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{evidence.documentId ? <a href={document?.url} download={evidence.document} className="min-w-0 break-words underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`Download source ${evidence.document}`}>{evidence.document}</a> : <span className="min-w-0 break-words">{evidence.document}</span>}</span>
                            <span className="text-muted-foreground">{evidence.location}</span>
                          </figcaption>
                          {evidence.kind === "image" ? <>
                            {/* Already resized and validated during upload; no remote image fetch. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {image ? <img src={image} alt={`Source image from ${evidence.location}`} className="mb-3 max-h-72 max-w-full rounded object-contain" /> : <p className="text-xs">Source image is unavailable in this session.</p>}
                            <p className="mb-1 text-xs font-medium text-muted-foreground">AI image observation · verify visually</p>
                            <p className="text-sm leading-relaxed whitespace-pre-line break-words">{evidence.quote}</p>
                          </> : <blockquote className="border-l-2 border-input pl-3 text-sm leading-relaxed whitespace-pre-line break-words">{evidence.quote}</blockquote>}
                        </figure>
                      ); })}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">{selected.evidence.some((item) => item.kind === "image") ? "Image references are checked, but visual observations need your review." : "Quotes are checked against the extracted document text. Review whether they support the suggested preference."}</p>
                  </div>
                </div>
                {/* Pinned to the viewport bottom so a decision never waits on scrolling past long evidence. */}
                <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7">
                  {selected.status === "pending" ? (
                    <>
                      <Button variant="ghost" className="h-10 gap-2 px-3 text-muted-foreground" onClick={() => decideAndAdvance(selected.id, "denied")}><X className="size-3.5" aria-hidden="true" /> Deny</Button>
                      <div className="flex gap-2">
                        <PreferenceEditor preference={selected} onSaved={() => advanceFrom(selected.id)} />
                        <Button className="h-10 gap-2 px-4" onClick={() => decideAndAdvance(selected.id, "confirmed")}><Check className="size-3.5" /> Confirm</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" className="h-10 gap-2 px-3 text-sm" onClick={() => decideAndAdvance(selected.id, "pending")}><RotateCcw className="size-3.5" aria-hidden="true" /> Return to review</Button>
                      <PreferenceEditor preference={selected} />
                    </>
                  )}
                </div>
              </article>
            </div>
          )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
