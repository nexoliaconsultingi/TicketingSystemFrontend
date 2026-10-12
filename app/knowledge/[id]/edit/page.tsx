"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ShieldAlert } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { ArticleForm } from "@/components/knowledge/article-form"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { getToken } from "@/lib/auth"
import { useSessionUser } from "@/lib/use-session"
import { ApiError, knowledgeApi, type KnowledgeArticle } from "@/lib/api"

/**
 * « Edit article » : corriger une référence.
 *
 * Seul le créateur de l'article peut le modifier — ni l'administrateur, ni un
 * autre superviseur. La page vérifie la propriété avant de faire appel au
 * serveur, qui la vérifie à son tour ; un article sans droit répond à l'écran
 * comme à l'API : il n'existe pas pour celui qui cherche à l'écrire.
 */
export default function EditKnowledgePage() {
  return (
    <AuthGuard>
      <EditArticle />
    </AuthGuard>
  )
}

function EditArticle() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const user = useSessionUser()
  const id = params?.id ?? ""

  const [article, setArticle] = useState<KnowledgeArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token || !id) return
    void knowledgeApi
      .get(token, id)
      .then(setArticle)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load the article."))
      .finally(() => setLoading(false))
  }, [id])

  if (user === null || loading) {
    return (
      <DashboardShell title="Edit article" subtitle="Loading the article…" breadcrumb="Recommendations">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading the article…
        </p>
      </DashboardShell>
    )
  }

  const forbidden = error !== null || article === null || String(article.createdBy) !== String(user._id)

  if (forbidden) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#f7f9fc] px-5 text-[#172033]">
        <div className="w-full max-w-md rounded-xl border border-[#e5eaf2] bg-white p-7 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-lg font-semibold text-[#183b56]">Edit not available</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error ?? "Only the author of an article can modify it."}
          </p>
          <Link href="/knowledge">
            <Button className="mt-6 w-full">Back to the knowledge base</Button>
          </Link>
        </div>
      </div>
    )
  }

  return <ArticleForm mode="edit" initial={article} onDone={() => router.replace("/knowledge")} />
}