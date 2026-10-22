"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon, Loader2Icon } from "lucide-react"

// Aurex-style pop-ups: always a dark rounded card, with a coloured round icon per kind.
const dot = (cls: string, icon: React.ReactNode) => (
  <span className={`flex size-6 items-center justify-center rounded-full ${cls}`}>{icon}</span>
)

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: dot("bg-[#eff323] text-black", <CheckIcon className="size-3.5" strokeWidth={3} />),
        info: dot("bg-white/15 text-white", <InfoIcon className="size-3.5" />),
        warning: dot("bg-[#e0702e] text-white", <TriangleAlertIcon className="size-3.5" />),
        error: dot("bg-[#ff5a5f] text-white", <XIcon className="size-3.5" strokeWidth={3} />),
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "#111111",
          "--normal-text": "#ffffff",
          "--normal-border": "rgb(255 255 255 / 0.1)",
          "--border-radius": "1.25rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !gap-3 !py-3.5 !shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)] !backdrop-blur-xl",
          title: "!font-medium",
          description: "!text-white/60",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
