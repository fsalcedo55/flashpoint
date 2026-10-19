import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";
import type { Preference } from "@/lib/preferences";

export function DeletePreference({ preference, className }: { preference: Preference; className?: string }) {
  const [open, setOpen] = useState(false);
  const { removePreference } = useWorkspace();
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" className={cn("text-muted-foreground hover:text-destructive", className)} aria-label={`Delete ${preference.title}`}><Trash2 className="size-4" aria-hidden="true" /></Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete this preference?</DialogTitle>
        <DialogDescription className="break-words">“{preference.rule}” and its source evidence will be removed from this session.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="destructive" onClick={() => { removePreference(preference.id); setOpen(false); }}>Delete preference</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
