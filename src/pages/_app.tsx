import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { ApiProvider } from "@/components/api-provider";
import { MotionConfig } from "motion/react";
import { inter, jakarta, newsreader } from "@/lib/fonts";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style>{`
        :root {
          --font-inter: ${inter.style.fontFamily};
          --font-newsreader: ${newsreader.style.fontFamily};
          --font-jakarta: ${jakarta.style.fontFamily};
        }
      `}</style>
      {/* Reduced motion: Motion keeps fades and drops movement, matching the CSS rules. */}
      <MotionConfig reducedMotion="user">
        <ApiProvider>
          <WorkspaceProvider>
            <AppShell>
              <Component {...pageProps} />
            </AppShell>
          </WorkspaceProvider>
        </ApiProvider>
      </MotionConfig>
    </>
  );
}
