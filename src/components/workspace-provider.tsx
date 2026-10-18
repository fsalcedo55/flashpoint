import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useTRPC } from "@/lib/trpc";
import type { Preference, PreferenceStatus } from "@/lib/preferences";

type Workspace = {
  preferences: Preference[];
  decide: (id: string, status: PreferenceStatus, rule?: string) => Promise<boolean>;
  removePreference: (id: string) => Promise<boolean>;
  isLoading: boolean;
  isUnavailable: boolean;
  isSaving: boolean;
  error: string | null;
  retry: () => void;
  announcement: string;
};

const WorkspaceContext = createContext<Workspace | null>(null);
const emptyPreferences: Preference[] = [];

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryOptions = trpc.preferences.list.queryOptions();
  const query = useQuery(queryOptions);
  const decision = useMutation(trpc.preferences.decide.mutationOptions());
  const removal = useMutation(trpc.preferences.delete.mutationOptions());
  const preferences = query.data ?? emptyPreferences;
  const [announcement, setAnnouncement] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);
  const isSaving = decision.isPending || removal.isPending;

  async function runAction(action: () => Promise<void>) {
    if (busy.current) return false;
    busy.current = true;
    setActionError(null);
    setAnnouncement("");
    try {
      await queryClient.cancelQueries({ queryKey: queryOptions.queryKey });
      await action();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Your change could not be saved. Try again.");
      if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
        await queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      }
      return false;
    } finally {
      busy.current = false;
    }
  }

  async function decide(id: string, status: PreferenceStatus, rule?: string) {
    const preference = preferences.find((item) => item.id === id);
    if (!preference) return false;
    return runAction(async () => {
      const input = status === "confirmed"
        ? { id, version: preference.version, status, rule }
        : { id, version: preference.version, status };
      const saved = await decision.mutateAsync(input);
      queryClient.setQueryData(queryOptions.queryKey, (current: Preference[] | undefined) =>
        current?.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
      setAnnouncement(preference.title + (status === "pending" ? " returned to review." : " " + status + ".") + " Saved.");
    });
  }

  async function removePreference(id: string) {
    const preference = preferences.find((item) => item.id === id);
    if (!preference) return false;
    return runAction(async () => {
      await removal.mutateAsync({ id });
      queryClient.setQueryData(queryOptions.queryKey, (current: Preference[] | undefined) => current?.filter((item) => item.id !== id));
      setAnnouncement(preference.title + " deleted.");
    });
  }

  function retry() {
    setActionError(null);
    void query.refetch();
  }

  return (
    <WorkspaceContext.Provider value={{ preferences, decide, removePreference, announcement,
      isLoading: query.isPending, isUnavailable: query.isError, isSaving,
      error: actionError ?? query.error?.message ?? null, retry }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
