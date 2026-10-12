"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { OtpInput } from "@/components/auth/otp-input"
import { authApi, ApiError } from "@/lib/api"
import { clearPendingAuth, getPendingAuth, reconcileSession, saveSession } from "@/lib/auth"

const CODE_LENGTH = 6
const EXPIRY_SECONDS = 180

function formatCountdown(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function VerifyCodeForm() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [remember, setRemember] = useState(true)
  const [code, setCode] = useState("")
  const [countdown, setCountdown] = useState(EXPIRY_SECONDS)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [stage, setStage] = useState<"idle" | "verifying" | "success">("idle")

  const mountedRef = useRef(false)
  const autoSubmitRef = useRef(false)

  useEffect(() => {
    let active = true

    void reconcileSession().then((ok) => {
      if (!active) return
      if (ok) {
        router.replace("/")
        return
      }

      const pendingAuth = getPendingAuth()
      if (!pendingAuth) {
        router.replace("/login")
        return
      }

      setEmail(pendingAuth.email)
      setRemember(pendingAuth.remember)
      mountedRef.current = true
    })

    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (countdown <= 0) return

    const timer = window.setInterval(() => {
      setCountdown((previous) => (previous > 0 ? previous - 1 : 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [countdown])

  const triggerError = useCallback((message: string) => {
    setError(message)
    setShake(true)
    window.setTimeout(() => setShake(false), 450)
  }, [])

  const submitCode = useCallback(
    async (value: string) => {
      if (pending || !email) return

      setPending(true)
      setError(null)
      setStage("verifying")

      try {
        const session = await authApi.verifyCode({ email, code: value })
        if (!mountedRef.current) return

        saveSession(session.token, session, remember)
        clearPendingAuth()
        setStage("success")

        await new Promise((resolve) => window.setTimeout(resolve, 550))
        router.replace("/")
        router.refresh()
      } catch (err) {
        if (!mountedRef.current) return
        setStage("idle")
        setCode("")
        triggerError(
          err instanceof ApiError
            ? translateVerifyError(err)
            : "We couldn't verify this code. Please try again in a moment.",
        )
      } finally {
        setPending(false)
      }
    },
    [email, pending, remember, router, triggerError],
  )

  const handleCodeChange = (value: string) => {
    setCode(value)
    if (error) setError(null)

    if (!autoSubmitRef.current && value.length === CODE_LENGTH) {
      autoSubmitRef.current = true
      void submitCode(value)
      window.setTimeout(() => {
        autoSubmitRef.current = false
      }, 800)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.length !== CODE_LENGTH) {
      triggerError("Enter the 6-digit code you received by email.")
      return
    }
    void submitCode(code)
  }

  const resendHref = `/login?email=${encodeURIComponent(email)}`

  return (
    <AuthShell>
      <div className="mb-8">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cde6e6] bg-[#f2fbfb] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#147878]">
          <ShieldCheck className="size-3.5" />
          Second factor
        </p>
        <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight text-[#183b56] sm:text-[2rem]">
          Verify your identity
        </h2>
        <p className="mt-2.5 text-sm leading-6 text-slate-500">
          We sent a 6-digit code to{" "}
          <span className="font-semibold text-[#183b56]">{email || "your email address"}</span>.
        </p>
      </div>

      <ol
        className="mb-8 flex items-center justify-center gap-2.5 sm:gap-3"
        aria-label="Sign-in progress"
      >
        <li className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1aa6a6] text-white">
            <Check className="size-3.5" />
          </span>
          <span className="text-[12px] font-medium whitespace-nowrap text-[#147878]">
            Credentials
          </span>
        </li>
        {/* La ligne relie les deux étapes et reste hors du flux de lecture */}
        <li aria-hidden="true" className="h-px w-8 shrink-0 bg-[#cde6e6] sm:w-14" />
        <li aria-current="step" className="flex items-center gap-2.5">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
              stage === "success"
                ? "bg-emerald-500 text-white"
                : "bg-[#183b56] text-white ring-4 ring-[#edf8f8]"
            }`}
          >
            {stage === "success" ? <Check className="size-3.5" /> : "2"}
          </span>
          <span className="text-[12px] font-medium whitespace-nowrap text-[#183b56]">
            Verification
          </span>
        </li>
      </ol>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {error && (
          <div
            role="alert"
            className="auth-shake flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className={shake ? "auth-shake" : undefined}>
          <OtpInput
            value={code}
            onChange={handleCodeChange}
            length={CODE_LENGTH}
            disabled={pending}
            invalid={Boolean(error)}
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="flex items-center gap-2 text-slate-500">
            <MailCheck className="size-3.5 shrink-0 text-[#1aa6a6]" />
            {countdown > 0 ? (
              <>
                Expires in{" "}
                <span className="font-semibold tabular-nums text-[#183b56]">
                  {formatCountdown(countdown)}
                </span>
              </>
            ) : (
              <span className="font-medium text-amber-600">Code expired</span>
            )}
          </span>
          <a
            href={resendHref}
            aria-disabled={countdown > 0}
            className={`flex shrink-0 items-center gap-1.5 font-medium transition-colors ${
              countdown > 0
                ? "pointer-events-none text-slate-300"
                : "text-[#1aa6a6] hover:text-[#147878]"
            }`}
          >
            <RefreshCw className="size-3.5" />
            Resend code
          </a>
        </div>

        <Button
          type="submit"
          disabled={pending || code.length !== CODE_LENGTH}
          className="auth-cta group h-12 w-full rounded-xl text-[14px] font-semibold text-white"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </>
          ) : (
            "Verify code"
          )}
        </Button>

        <a
          href={resendHref}
          className="flex items-center justify-center gap-2 text-[13px] text-slate-500 transition-colors hover:text-[#183b56]"
        >
          <ArrowLeft className="size-3.5" />
          Use a different account
        </a>
      </form>

      <p className="mt-7 rounded-xl border border-[#e5eaf2] bg-[#f7f9fc] px-4 py-3 text-center text-[12px] leading-5 text-slate-500">
        Nothing arrived? Check your spam folder or contact your organisation&apos;s
        administrator.
      </p>
    </AuthShell>
  )
}

function translateVerifyError(error: ApiError): string {
  const message = error.message.toLowerCase()

  if (message.includes("expired")) {
    return "This code has expired. Request a new one to continue."
  }
  if (message.includes("invalid verification code")) {
    return "Incorrect code. Please check the 6 digits you entered."
  }
  if (message.includes("no verification code")) {
    return "No code is pending. Request a new one to continue."
  }
  if (error.status === 0) {
    return "The authentication service is currently unreachable."
  }
  return error.message
}
