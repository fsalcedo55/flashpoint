import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/workspace-provider";
import type { Preference } from "@/lib/preferences";

export function PreferenceEditor({ preference }: { preference: Preference }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preference.rule);
  const { decide, isSaving, isUnavailable, error } = useWorkspace();
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft.trim().length < 10 || draft.trim().length > 500 || isSaving) return;
    setFailed(false);
    const saved = await decide(preference.id, "confirmed", draft.trim());
    if (saved) setOpen(false);
    else setFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (isSaving) return; if (next) { setDraft(preference.rule); setFailed(false); } setOpen(next); }}>
      <DialogTrigger asChild>
        <Button disabled={isSaving || isUnavailable} variant="outline" className="h-10 gap-2 px-3"><PencilLine className="size-3.5" aria-hidden="true" /> Edit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isSaving}>
        <form onSubmit={save} aria-busy={isSaving} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit preference</DialogTitle>
            <DialogDescription>Edit the rule, then save it to your confirmed preferences.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={"rule-" + preference.id}>Preference</Label>
            <Textarea id={"rule-" + preference.id} value={draft} disabled={isSaving} onChange={(event) => setDraft(event.target.value)} minLength={10} maxLength={500} required className="min-h-32 text-base leading-6 sm:text-sm" aria-describedby={"rule-hint-" + preference.id} />
            <p id={"rule-hint-" + preference.id} className="text-xs text-muted-foreground">Use 10–500 characters to describe how you like to work.</p>
          </div>
          {failed && error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={draft.trim().length < 10 || draft.trim().length > 500 || isSaving || isUnavailable}><IconSwap active={isSaving} activeIcon={<LoaderCircle className="animate-spin motion-reduce:animate-none" />} inactiveIcon={<Check />} /> {isSaving ? "Saving…" : "Save and confirm"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
