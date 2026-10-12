"use client"

import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { ArticleForm } from "@/components/knowledge/article-form"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { useSessionUser } from "@/lib/use-session"

/**
 * « New article » : consigner une référence pour toute l'équipe.
 *
 * L'administrateur et le superviseur écrivent ; le serveur refuserait de toute
 * façon un collaborateur, et l'écran le dit avant d'avoir fait appeler l'API.
 */
export default function NewKnowledgePage() {
  return (
    <AuthGuard>
      <NewArticle />
    </AuthGuard>
  )
}

function NewArticle() {
  const router = useRouter()
  const user = useSessionUser()
  const isPublisher = Boolean(
    user && (user.access.includes("admin") || user.access.includes("manager")),
  )

  if (user === null) {
    return (
      <DashboardShell title="New article" subtitle="Checking your access…" breadcrumb="Services">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Checking your access…
        </p>
      </DashboardShell>
    )
  }

  if (!isPublisher) {
    return <WriteDenied onBack={() => router.replace("/knowledge")} />
  }

  return <ArticleForm mode="create" onDone={() => router.replace("/knowledge")} />
}

/**
 * Refus poli : même cadre que les autres écrans d'écriture. Aucun collaborateur
 * ne doit croire à une panne en arrivant par adresse sur ce formulaire.
 */
function WriteDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f7f9fc] px-5 text-[#172033]">
      <div className="w-full max-w-md rounded-xl border border-[#e5eaf2] bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-lg font-semibold text-[#183b56]">Writing not available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Articles are written by administrators and supervisors. You can still consult and filter
          the knowledge base.
        </p>
        <Button className="mt-6 w-full" onClick={onBack}>
          Back to the knowledge base
        </Button>
      </div>
    </div>
  )
}