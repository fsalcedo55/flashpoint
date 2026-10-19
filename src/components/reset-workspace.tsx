import { useState } from "react";
import { useRouter } from "next/router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-provider";

export function ResetWorkspace({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { documents, preferences, analyses, resetWorkspace } = useWorkspace();
  const empty = !documents.length && !preferences.length && !analyses.length;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" disabled={empty}><Trash2 className="size-3.5" aria-hidden="true" /> Reset workspace</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Clear this session?</DialogTitle>
        <DialogDescription>This clears {documents.length} documents, {preferences.length} preferences, and {analyses.length} analyses from this tab. Results from any requests in progress will be discarded.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="destructive" onClick={() => { resetWorkspace(); setOpen(false); onDone?.(); if (router.pathname !== "/") void router.push("/"); }}>Clear session</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
