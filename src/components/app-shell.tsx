import { useState, type ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { CheckCheck, ChevronRight, Files, ListChecks, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ResetWorkspace } from "@/components/reset-workspace";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Your documents", icon: Files },
  { href: "/review", label: "Review preferences", icon: ListChecks },
  { href: "/profile", label: "Preference profile", icon: CheckCheck },
];

function Brand() {
  return (
    <Link href="/" className="flex w-fit items-center gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-label="Flashpoint.AI home">
      <Image src="/brand/flashpoint-mark.png" alt="" width={182} height={232} className="h-5 w-auto shrink-0" unoptimized />
      <span className="font-brand text-base font-semibold tracking-[0.01em] text-heading">Flashpoint.AI</span>
    </Link>
  );
}

// A count that goes up while you watch (an analysis just landed suggestions)
// flashes brand orange once, pointing at the next step. Arriving on the page doesn't.
function CountBadge({ count }: { count: number }) {
  const [previous, setPrevious] = useState(count);
  const [flash, setFlash] = useState(false);
  if (count !== previous) {
    setPrevious(count);
    setFlash(count > previous);
  }
  // Stays mounted at zero so the common 0 → 1 jump is seen.
  if (count === 0) return null;
  return (
    <span key={flash ? count : "still"} className={cn("flex size-5 shrink-0 items-center justify-center rounded bg-white text-xs tabular-nums", flash && "animate-[badge-flash_1.2s_ease-out_both]")}>
      {count}
    </span>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { preferences } = useWorkspace();
  const pending = preferences.filter((item) => item.status === "pending").length;
  const confirmed = preferences.filter((item) => item.status === "confirmed").length;
  return (
    <nav aria-label="Main navigation" className="space-y-1.5">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = router.pathname === href;
        const count = href === "/review" ? pending : href === "/profile" ? confirmed : 0;
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors [&_svg_*]:[vector-effect:non-scaling-stroke] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", active ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:bg-white/70 hover:text-foreground")}>
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1 whitespace-nowrap">{label}</span>
            <CountBadge count={count} />
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { announcement, error, clearError } = useWorkspace();
  const title = navigation.find((item) => item.href === router.pathname)?.label ?? "Preferences";

  return (
    <div className="min-h-svh lg:pl-60">
      <Head>
        <title>{title + " · Flashpoint.AI"}</title>
        <meta name="description" content="Review suggested preferences from your documents and manage your confirmed profile." />
        <link rel="icon" href="/brand/flashpoint-mark.png" type="image/png" />
      </Head>
      <a href="#main-content" className="sr-only fixed top-3 left-3 z-50 rounded-lg bg-primary px-4 py-3 text-white focus:not-sr-only">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-sidebar px-4 lg:flex">
        <div className="flex h-[76px] items-center px-3"><Brand /></div>
        <div className="pt-6"><Navigation /></div>
        <div className="mt-auto pb-5"><ResetWorkspace /></div>
      </aside>

      <header className="flex h-[76px] items-center justify-between gap-3 border-b bg-white px-5 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu aria-hidden="true" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar px-4">
              <SheetHeader className="px-3 pt-7">
                <SheetTitle className="flex items-center gap-4 font-brand text-base font-semibold tracking-[0.01em]">
                  <Image src="/brand/flashpoint-mark.png" alt="" width={182} height={232} className="h-5 w-auto shrink-0" unoptimized />
                  Flashpoint.AI
                </SheetTitle>
                <SheetDescription className="sr-only">Navigate between documents, preference review, and your profile.</SheetDescription>
              </SheetHeader>
              <Navigation onNavigate={() => setMenuOpen(false)} />
              <SheetFooter className="px-3"><ResetWorkspace onDone={() => setMenuOpen(false)} /></SheetFooter>
            </SheetContent>
          </Sheet>
          <span className="hidden text-sm text-muted-foreground sm:inline">Your workspace</span>
          <ChevronRight className="hidden size-3 text-muted-foreground/60 sm:block" aria-hidden="true" />
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
      </header>

      {/* One reading column for every page, centered in the space beside the sidebar. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-8 outline-none sm:px-8 sm:py-11 lg:px-10">
        {error ? (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-white p-4 text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={clearError}>Dismiss</Button>
          </div>
        ) : null}
        {children}
      </main>
      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}
