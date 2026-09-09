import { useState, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = '确认',
  destructive = false,
  pending = false,
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!pending || !nextOpen) setOpen(nextOpen) }}>
      <AlertDialogTrigger render={trigger as React.ReactElement} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={() => { setOpen(false); onConfirm() }}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
