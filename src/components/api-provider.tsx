import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import { TRPCProvider } from "@/lib/trpc";
import type { AppRouter } from "@/server/routers/_app";

export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { retry: false } },
  }));
  const [trpcClient] = useState(() => createTRPCClient<AppRouter>({
    links: [httpBatchStreamLink({ url: "/api/trpc" })],
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
