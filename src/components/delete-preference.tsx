import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";
import type { Preference } from "@/lib/preferences";

// Deny is a decision; delete is cleanup.
export function DeletePreference({ preference, className }: { preference: Preference; className?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const { removePreference, isSaving, isUnavailable, error } = useWorkspace();

  async function confirm() {
    setFailed(false);
    if (await removePreference(preference.id)) setOpen(false);
    else setFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (isSaving) return; if (next) setFailed(false); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("text-muted-foreground hover:text-destructive", className)} aria-label={`Delete ${preference.title}`} disabled={isSaving || isUnavailable}><Trash2 className="size-4" aria-hidden="true" /></Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!isSaving}>
        <DialogHeader>
          <DialogTitle>Delete this preference?</DialogTitle>
          <DialogDescription className="break-words">“{preference.rule}” and its source evidence will be removed. This can’t be undone.</DialogDescription>
        </DialogHeader>
        {failed && error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={isSaving} onClick={() => void confirm()}>{isSaving ? "Deleting…" : "Delete preference"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
