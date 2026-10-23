import * as React from "react"
import { cn } from "cn"

// Cross-fades between two icons on an infrequent state change (e.g. a
// loading or success indicator). Both icons stay mounted in one grid cell so
// enter and exit both animate; under reduced motion only the opacity fades.
const layer =
  "[grid-area:1/1] flex transition-[opacity,filter,scale] duration-200 ease-out motion-reduce:scale-100 motion-reduce:blur-[0px]"
const shown = "scale-100 opacity-100 blur-[0px]"
const hidden = "scale-[0.25] opacity-0 blur-[4px]"

function IconSwap({
  active,
  activeIcon,
  inactiveIcon,
  className,
}: {
  active: boolean
  activeIcon: React.ReactNode
  inactiveIcon: React.ReactNode
  className?: string
}) {
  return (
    <span
      data-slot="icon-swap"
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center", className)}
    >
      <span className={cn(layer, active ? shown : hidden)}>{activeIcon}</span>
      <span className={cn(layer, active ? hidden : shown)}>{inactiveIcon}</span>
    </span>
  )
}

export { IconSwap }
