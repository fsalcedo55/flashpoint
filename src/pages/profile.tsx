import Link from "next/link";
import { ArrowRight, CheckCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { PreferenceEditor } from "@/components/preference-editor";
import { DeletePreference } from "@/components/delete-preference";
import { useWorkspace } from "@/components/workspace-provider";
import { documentPurposeLabels } from "@/lib/document-purpose";

export default function ProfilePage() {
  const { preferences, decide } = useWorkspace();
  const reviewHref = "/review";
  const confirmed = preferences.filter((item) => item.status === "confirmed");
  const categories = [...new Set(confirmed.map((item) => item.category))];

  return (
    <>
      <PageHeading title="Preference profile" />

      {!confirmed.length ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border bg-white px-6 py-12 text-center">
          <span className="stagger-item mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><CheckCheck className="size-6" strokeWidth={1.5} aria-hidden="true" /></span>
          <h2 className="stagger-item text-lg font-semibold">No confirmed preferences</h2>
          <p className="stagger-item mt-3 max-w-md text-sm leading-7 text-muted-foreground">Confirm a suggestion in the review to add your first preference. Pending and denied suggestions stay out.</p>
          <Button asChild className="stagger-item mt-6 h-10 gap-2 px-5"><Link href={reviewHref}>Review suggestions <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      ) : (
        <div className="max-w-3xl space-y-7">
          {categories.map((category) => (
            <section key={category} aria-label={category}>
              <h2 className="mb-3 text-lg font-semibold">{category}</h2>
              <div className="space-y-3">
                {confirmed.filter((item) => item.category === category).map((item) => (
                  <article key={item.id} className="group/preference rounded-xl border bg-white p-5 sm:p-6">
                    <h3 className="break-words text-base leading-7 font-medium">{item.rule}</h3>
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <p className="mr-auto text-xs text-muted-foreground">{documentPurposeLabels[item.purpose]} · {item.evidence.length} {item.evidence.length === 1 ? "reference" : "references"}</p>
                      <DeletePreference preference={item} className="text-muted-foreground/60 opacity-0 transition-[opacity,color] duration-150 group-hover/preference:opacity-100 group-focus-within/preference:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" />
                      <Button variant="ghost" className="h-10 gap-2 px-3 text-sm text-muted-foreground" onClick={() => void decide(item.id, "pending")}><RotateCcw className="size-3.5" aria-hidden="true" /> Return to review</Button>
                      <PreferenceEditor preference={item} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
