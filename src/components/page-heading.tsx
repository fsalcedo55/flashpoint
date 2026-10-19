import type { ReactNode } from "react";

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <h1 className="font-heading text-[32px] leading-[1.15] font-normal tracking-[-0.025em] text-heading sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-3 max-w-[590px] text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
