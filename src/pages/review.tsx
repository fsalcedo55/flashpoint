import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCheck, ChevronRight, FileText, ListChecks, LoaderCircle, Quote, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { PageHeading } from "@/components/page-heading";
import { PreferenceEditor } from "@/components/preference-editor";
import { DeletePreference } from "@/components/delete-preference";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

export default function ReviewPage() {
  const { preferences, decide, isSaving, isUnavailable } = useWorkspace();
  const profileHref = "/profile";
  const [view, setView] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = preferences.filter((item) => item.status === "pending");
  const reviewed = preferences.filter((item) => item.status !== "pending");
  const visible = view === "pending" ? pending : reviewed;
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];

  return (
    <>
      <PageHeading title="Review preferences"
        description="Check the source evidence, then confirm, edit, or deny each suggestion."
        action={preferences.length ? <Button asChild variant="outline" className="h-10 gap-2 bg-white px-3 text-sm"><Link href={profileHref}>View profile <ArrowRight className="size-3.5" aria-hidden="true" /></Link></Button> : undefined} />

      {!preferences.length ? (
        <div className="flex min-h-[370px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
          <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><ListChecks className="size-6" strokeWidth={1.5} aria-hidden="true" /></span>
          <h2 className="stagger-item text-lg font-semibold">No preferences to review</h2>
          <p className="stagger-item mt-3 max-w-md text-sm leading-7 text-muted-foreground">Upload questionnaires, then select saved documents and choose Find preferences.</p>
          <Button asChild className="stagger-item mt-6 h-10 gap-2 px-5"><Link href="/">Your documents <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      ) : (
        <Tabs value={view} onValueChange={setView} className="gap-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <TabsList aria-label="Filter preferences">
                <TabsTrigger value="pending" className="px-4">To review <span className="ml-1 text-xs tabular-nums">{pending.length}</span></TabsTrigger>
                <TabsTrigger value="reviewed" className="px-4">Reviewed <span className="ml-1 text-xs tabular-nums">{reviewed.length}</span></TabsTrigger>
              </TabsList>
            <span className="text-xs text-muted-foreground">{reviewed.length} of {preferences.length} reviewed</span>
          </div>

          <TabsContent value={view} className="mt-0">
          {!selected ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
              <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><CheckCheck className="size-6" aria-hidden="true" /></span>
              <h2 className="stagger-item text-lg font-semibold">{view === "pending" ? "Review complete" : "No reviewed preferences"}</h2>
              <p className="stagger-item mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{view === "pending" ? "All suggestions have been reviewed. Confirmed preferences are saved to your profile." : "Reviewed suggestions will appear here after you confirm or deny them."}</p>
              {view === "pending" ? (
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
                      <span className="text-xs font-medium text-muted-foreground">{item.category}</span>
                      <span className="mt-2 block text-sm leading-6 font-medium">{item.title}</span>
                      <span className="mt-2 block text-xs text-muted-foreground">{item.status === "pending" ? item.evidence.length + (item.evidence.length === 1 ? " example" : " examples") : item.status === "confirmed" ? "Confirmed" : "Denied"}</span>
                    </div>
                    <ChevronRight className={cn("mt-5 size-3.5 shrink-0", item.id === selected.id ? "text-primary" : "text-muted-foreground/40")} aria-hidden="true" />
                  </button>
                ))}
              </div>

              <article key={selected.id} aria-label="Selected preference" className="min-w-0 overflow-hidden rounded-xl border bg-white">
                <div className="p-5 sm:p-7">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">{selected.category}</Badge>
                    <span className="text-xs text-muted-foreground">{selected.status === "pending" ? "Suggested preference" : selected.status === "confirmed" ? "Confirmed preference" : "Denied preference"}</span>
                  </div>
                  <h2 className="max-w-2xl break-words text-xl leading-normal font-medium tracking-[-0.02em]">{selected.rule}</h2>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{selected.rationale}</p>

                  <div className="mt-7 border-t pt-6">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Quote className="size-4 shrink-0 text-primary" aria-hidden="true" /> Source evidence</h3>
                    <div className="space-y-3">
                      {selected.evidence.map((evidence) => (
                        <figure key={(evidence.documentId ?? evidence.document) + evidence.location} className="rounded-md bg-secondary p-4">
                          <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-start gap-1.5 font-medium"><FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{evidence.documentId ? <a href={`/api/documents/${evidence.documentId}/download`} className="min-w-0 break-words underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`Download source ${evidence.document}`}>{evidence.document}</a> : <span className="min-w-0 break-words">{evidence.document}</span>}</span>
                            <span className="text-muted-foreground">{evidence.location}</span>
                          </figcaption>
                          <blockquote className="border-l-2 border-input pl-3 text-sm leading-relaxed whitespace-pre-line break-words">{evidence.quote}</blockquote>
                        </figure>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">Quotes are checked against the extracted document text. Review whether they support the suggested preference.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background/60 p-5 sm:px-7">
                  {selected.status === "pending" ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Button disabled={isSaving || isUnavailable} variant="ghost" className="h-10 gap-2 px-3 text-muted-foreground" onClick={() => void decide(selected.id, "denied")}><X className="size-3.5" aria-hidden="true" /> Deny</Button>
                        <DeletePreference preference={selected} />
                      </div>
                      <div className="flex gap-2">
                        <PreferenceEditor preference={selected} />
                        <Button disabled={isSaving || isUnavailable} className="h-10 gap-2 px-4" onClick={() => void decide(selected.id, "confirmed")}><IconSwap active={isSaving} activeIcon={<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />} inactiveIcon={<Check className="size-3.5" />} /> {isSaving ? "Saving…" : "Confirm"}</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <Button disabled={isSaving || isUnavailable} variant="ghost" className="h-10 gap-2 px-3 text-sm" onClick={() => void decide(selected.id, "pending")}><RotateCcw className="size-3.5" aria-hidden="true" /> Return to review</Button>
                        <DeletePreference preference={selected} />
                      </div>
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
