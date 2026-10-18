import { useState } from "react";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTRPC } from "@/lib/trpc";

function plural(total: number, singular: string, pluralForm = singular + "s") {
  return `${total} ${total === 1 ? singular : pluralForm}`;
}

// Start over. The dialog names exactly what goes.
export function ResetWorkspace({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const documents = useQuery(trpc.documents.list.queryOptions());
  const preferences = useQuery(trpc.preferences.list.queryOptions());
  const analyses = useQuery(trpc.analyses.list.queryOptions());
  const reset = useMutation(trpc.workspace.reset.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setOpen(false);
      onDone?.();
      if (router.pathname !== "/") void router.push("/");
    },
  }));
  const own = preferences.data ?? [];
  const counts = [
    plural(documents.data?.length ?? 0, "document"),
    plural(own.filter((item) => item.status === "pending").length, "suggestion to review", "suggestions to review"),
    plural(own.filter((item) => item.status === "confirmed").length, "confirmed preference"),
    plural(own.filter((item) => item.status === "denied").length, "denied suggestion"),
    plural(analyses.data?.length ?? 0, "analysis", "analyses"),
  ];
  const empty = !documents.data?.length && !own.length && !analyses.data?.length;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (reset.isPending) return; if (next) reset.reset(); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" disabled={empty}><Trash2 className="size-3.5" aria-hidden="true" /> Reset workspace</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!reset.isPending}>
        <DialogHeader>
          <DialogTitle>Delete everything in this workspace?</DialogTitle>
          <DialogDescription>This can’t be undone.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {counts.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {reset.isError ? <p role="alert" className="text-sm text-destructive">{reset.error.message}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={reset.isPending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={reset.isPending} onClick={() => reset.mutate()}>{reset.isPending ? "Deleting…" : "Delete everything"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
