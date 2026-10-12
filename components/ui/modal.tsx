import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof SIZES
  className?: string
  /**
   * Centre la boîte sur les petits écrans au lieu de la coller en bas.
   *
   * Par défaut la boîte se présente en feuille glissante, ce qui libère de la
   * place pour un contenu long sur téléphone. Les dialogues courts — un
   * formulaire de création, une confirmation — se lisent mieux centrés, car le
   * clavier masquerait sinon le bouton d'action.
   */
  centerOnMobile?: boolean
}

const SIZES = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  className,
  centerOnMobile = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
        // Le clavier virtuel occupant le bas de l'écran sur téléphone, une
        // feuille glissante passerait sous ses doigts : un dialogue centré
        // reste lisible et son bouton d'action atteignable.
        centerOnMobile ? "items-center p-3 sm:p-4" : "items-end p-0 sm:items-center sm:p-4",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-[#183b56]/35 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-[#e5eaf2] bg-white shadow-2xl",
          // Une feuille glissante n'a besoin d'arrondir que son sommet ; une
          // boîte centrée est une carte comme les autres.
          centerOnMobile ? "rounded-2xl" : "rounded-t-2xl sm:rounded-2xl",
          SIZES[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#edf0f5] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#183b56]">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-slate-500">{description}</p>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="shrink-0 text-slate-400"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#edf0f5] bg-[#f7f9fc] px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
