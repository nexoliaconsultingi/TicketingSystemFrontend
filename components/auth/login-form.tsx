"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LifeBuoy,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { authApi, ApiError } from "@/lib/api"
import { reconcileSession, setPendingAuth } from "@/lib/auth"

interface LoginFormProps {
  initialEmail?: string
}

export function LoginForm({ initialEmail = "" }: LoginFormProps) {
  const router = useRouter()

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const passwordRef = useRef<HTMLInputElement>(null)
  const sessionCheckRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    let active = true

    const check = reconcileSession()
    sessionCheckRef.current = check

    void check.then((ok) => {
      if (!active) return
      if (ok) {
        router.replace("/")
        return
      }
      if (initialEmail) setEmail(initialEmail)
    })

    return () => {
      active = false
    }
  }, [initialEmail, router])

  useEffect(() => {
    if (email) return
    passwordRef.current?.focus()
  }, [email])

  const triggerError = (message: string) => {
    setError(message)
    setShake(true)
    window.setTimeout(() => setShake(false), 450)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      triggerError("Please enter your email address and password.")
      return
    }

    setPending(true)
    setError(null)

    try {
      if (sessionCheckRef.current) {
        const sessionStillValid = await sessionCheckRef.current
        if (sessionStillValid) {
          router.replace("/")
          return
        }
      }

      await authApi.login({ email: trimmedEmail, password })
      setPendingAuth(trimmedEmail, remember)
      router.push("/verify")
    } catch (err) {
      triggerError(
        err instanceof ApiError
          ? translateAuthError(err)
          : "Something went wrong. Please try again in a moment.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cde6e6] bg-[#f2fbfb] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#147878]">
          <ShieldCheck className="size-3.5" />
          Secure sign-in
        </p>
        <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight text-[#183b56] sm:text-[2rem]">
          Welcome back
        </h2>
        <p className="mt-2.5 text-sm leading-6 text-slate-500">
          Enter your work credentials to access your service workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && (
          <div
            role="alert"
            className="auth-shake flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="block text-[13px] font-medium text-slate-600">
            Work email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="first.last@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(error)}
              className="auth-field h-12 w-full rounded-xl pl-11 pr-4 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-[13px] font-medium text-slate-600">
              Password
            </label>
            <span className="text-[11px] text-slate-400">At least 8 characters</span>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              ref={passwordRef}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(error)}
              className="auth-field h-12 w-full rounded-xl pl-11 pr-12 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              disabled={pending}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#f1f5f9] hover:text-[#183b56] disabled:opacity-50"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer select-none items-center gap-3 text-[13px] text-slate-500">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={pending}
            className="size-4 shrink-0 cursor-pointer rounded border-[#cbd5e1] bg-white accent-[#1aa6a6]"
          />
          Keep me signed in on this device
        </label>

        <Button
          type="submit"
          disabled={pending}
          className="auth-cta group h-12 w-full rounded-xl text-[14px] font-semibold text-white"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </>
          )}
        </Button>

        <p className="flex items-center justify-center gap-2 pt-1 text-center text-[12px] text-slate-500">
          <ShieldCheck className="size-3.5 shrink-0 text-[#1aa6a6]" />
          We&apos;ll email you a one-time verification code.
        </p>
      </form>

      {/* Mot de passe oublié : passe au bureau du responsable système.
          Aucun formulaire en libre-service, pour qu'une demande ne puisse
          pas être déposée au nom d'un collègue. */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#e5eaf2] bg-[#f8fafc] p-4">
        <LifeBuoy className="mt-0.5 size-4 shrink-0 text-[#1aa6a6]" aria-hidden="true" />
        <p className="text-[12px] leading-5 text-slate-600">
          <span className="font-medium text-slate-700">Forgot your password?</span> Please go to
          the ticketing system manager&apos;s office and ask them to update it for you. The new
          password will be sent to your work email address.
        </p>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-[#e5eaf2]" />
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
          Restricted access
        </span>
        <span className="h-px flex-1 bg-[#e5eaf2]" />
      </div>

      <p className="mt-6 text-center text-[13px] leading-6 text-slate-500">
        Don&apos;t have an account yet?{" "}
        <span className="font-medium text-[#147878]">Contact your Nexolia administrator</span>{" "}
        to get access.
      </p>
    </AuthShell>
  )
}

function translateAuthError(error: ApiError): string {
  const message = error.message.toLowerCase()

  if (message.includes("email or password")) {
    return "Incorrect email address or password."
  }
  if (message.includes("code")) {
    return "The verification code you were sent is no longer valid. Please sign in again."
  }
  if (error.status === 0) {
    return "The authentication service is currently unreachable."
  }
  return error.message
}
