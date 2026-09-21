"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * Ein/Aus-Schalter (Base UI). Optik wie der Status-Schalter der Bibliothek:
 * Teal-Spur 38×22, weißer Knopf; aus = warmes Beige. Rendert role="switch".
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full bg-[#e3d7c2] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked]:bg-teal data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-[3px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[19px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
