"use client"

import { useCallback, useRef } from "react"
import type { ClipboardEvent, KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  className?: string
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = false,
  className,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  const focusAt = useCallback(
    (index: number) => {
      const target = inputsRef.current[index]
      if (target) {
        target.focus()
        target.select()
      }
    },
    [],
  )

  const handleChange = useCallback(
    (index: number, raw: string) => {
      const digit = raw.replace(/\D/g, "").slice(-1)

      if (!digit) {
        const chars = value.split("")
        if (index < chars.length) {
          chars.splice(index, 1)
          onChange(chars.join(""))
        }
        return
      }

      const chars = value.split("")
      chars[index] = digit
      onChange(chars.join("").slice(0, length))

      if (index < length - 1) {
        focusAt(index + 1)
      }
    },
    [focusAt, length, onChange, value],
  )

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        event.preventDefault()
        const chars = value.split("")

        if (index < chars.length) {
          chars.splice(index, 1)
          onChange(chars.join(""))
        } else if (index > 0) {
          chars.splice(index - 1, 1)
          onChange(chars.join(""))
          focusAt(index - 1)
        }
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        focusAt(Math.max(0, index - 1))
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        focusAt(Math.min(length - 1, index + 1))
      }
    },
    [focusAt, length, onChange, value],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault()
      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
      if (!pasted) return

      onChange(pasted)
      focusAt(Math.min(pasted.length, length - 1))
    },
    [focusAt, length, onChange],
  )

  return (
    <div className={cn("flex justify-between gap-2 sm:gap-2.5", className)}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            inputsRef.current[index] = node
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid}
          data-filled={index < value.length}
          data-invalid={invalid}
          value={value[index] ?? ""}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.currentTarget.select()}
          className="auth-otp h-14 w-full min-w-0 rounded-xl text-center text-xl font-semibold tabular-nums sm:h-16 sm:text-2xl"
        />
      ))}
    </div>
  )
}
