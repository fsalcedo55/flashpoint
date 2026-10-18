import Link from "next/link";
import { ArrowRight, Check, CheckCheck, ListChecks, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { PreferenceEditor } from "@/components/preference-editor";
import { DeletePreference } from "@/components/delete-preference";
import { useWorkspace } from "@/components/workspace-provider";

export default function ProfilePage() {
  const { preferences, decide, isSaving, isUnavailable } = useWorkspace();
  const reviewHref = "/review";
  const confirmed = preferences.filter((item) => item.status === "confirmed");
  const pendingCount = preferences.filter((item) => item.status === "pending").length;
  const categories = [...new Set(confirmed.map((item) => item.category))];

  return (
    <>
      <PageHeading title="Preference profile"
        description="Manage your confirmed preferences. Edit them or return them to review."
        action={<Button asChild variant="outline" className="h-10 gap-2 bg-white px-3 text-sm"><Link href={reviewHref}><ListChecks className="size-3.5" aria-hidden="true" /> Review preferences</Link></Button>} />

      {!confirmed.length ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
          <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><CheckCheck className="size-6" strokeWidth={1.5} aria-hidden="true" /></span>
          <h2 className="stagger-item text-lg font-semibold">No confirmed preferences</h2>
          <p className="stagger-item mt-3 max-w-md text-sm leading-7 text-muted-foreground">Confirm a suggestion in the review to add your first preference. Pending and denied suggestions stay out.</p>
          <Button asChild className="stagger-item mt-6 h-10 gap-2 px-5"><Link href={reviewHref}>Review suggestions <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      ) : (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-10">
          <div className="space-y-7">
            {categories.map((category) => (
              <section key={category} aria-label={category}>
                <h2 className="mb-3 text-lg font-semibold">{category}</h2>
                <div className="space-y-3">
                  {confirmed.filter((item) => item.category === category).map((item) => (
                    <article key={item.id} className="rounded-xl border bg-white p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-3" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <h3 className="break-words text-base leading-7 font-medium">{item.rule}</h3>
                          <p className="mt-2 text-xs text-muted-foreground">Confirmed by you · {item.evidence.length} {item.evidence.length === 1 ? "excerpt" : "excerpts"}</p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                        <DeletePreference preference={item} className="mr-auto" />
                        <Button disabled={isSaving || isUnavailable} variant="ghost" className="h-10 gap-2 px-3 text-sm text-muted-foreground" onClick={() => void decide(item.id, "pending")}><RotateCcw className="size-3.5" aria-hidden="true" /> Return to review</Button>
                        <PreferenceEditor preference={item} />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <aside className="rounded-xl border bg-secondary p-6">
            <Badge variant="secondary" className="mb-5 gap-1.5 rounded-md bg-white px-2 py-1 text-xs"><Check className="size-3" aria-hidden="true" /> Your confirmed profile</Badge>
            <div className="flex items-baseline gap-2"><span className="text-4xl font-medium tracking-tight tabular-nums">{confirmed.length}</span><span className="text-xs text-muted-foreground">active {confirmed.length === 1 ? "preference" : "preferences"}</span></div>
            {pendingCount ? <Link href={reviewHref} className="mt-5 flex items-center gap-2 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{pendingCount} still to review <ArrowRight className="size-3" aria-hidden="true" /></Link> : null}
          </aside>
        </div>
      )}
    </>
  );
}
