"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  /** Beschriftung des Bestätigen-Knopfs (Standard „OK“). */
  confirmLabel?: string
  cancelLabel?: string
  /** Löschen & Co.: Bestätigen-Knopf in Warnfarbe. */
  destructive?: boolean
}

/**
 * Steply-Ersatz für das native `confirm()`: `const [confirm, confirmDialog] = useConfirm()`,
 * `{confirmDialog}` einmal rendern, dann `if (!(await confirm({ title: … }))) return;`.
 * Schließen per Esc/Klick daneben zählt als „Abbrechen“.
 */
export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  // Inhalt bleibt nach dem Schließen stehen (sonst wäre der Dialog in der Ausblend-Animation leer).
  const [state, setState] = React.useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void; open: boolean }) | null
  >(null)

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve, open: true })
      }),
    [],
  )

  const close = (ok: boolean) => {
    if (!state?.open) return
    state.resolve(ok)
    setState({ ...state, open: false })
  }

  const element = (
    <Dialog
      open={state?.open === true}
      onOpenChange={(o) => {
        if (!o) close(false)
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md" data-testid="confirm-dialog">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.description && <DialogDescription>{state.description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => close(false)}>
            {state?.cancelLabel ?? "Abbrechen"}
          </Button>
          <Button
            variant={state?.destructive ? "destructive" : "default"}
            onClick={() => close(true)}
          >
            {state?.confirmLabel ?? "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return [confirm, element]
}
