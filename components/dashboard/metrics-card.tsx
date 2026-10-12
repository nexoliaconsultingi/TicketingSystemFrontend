'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface MetricsCardProps {
  label: string
  value: string | number
  metric?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  icon?: React.ReactNode
  variant?: 'default' | 'critical' | 'warning' | 'success'
}

const variantStyles = {
  default: 'bg-card border-border',
  critical: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
  success: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
}

const labelColorVariants = {
  default: 'text-muted-foreground',
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  success: 'text-green-600 dark:text-green-400',
}

const valueColorVariants = {
  default: 'text-foreground',
  critical: 'text-red-700 dark:text-red-200',
  warning: 'text-yellow-700 dark:text-yellow-200',
  success: 'text-green-700 dark:text-green-200',
}

export function MetricsCard({
  label,
  value,
  metric,
  trend,
  trendValue,
  icon,
  variant = 'default',
}: MetricsCardProps) {
  return (
    <Card className={cn(variantStyles[variant], 'border')}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <p className={cn('text-sm font-medium', labelColorVariants[variant])}>
              {label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-2xl sm:text-3xl font-bold', valueColorVariants[variant])}>
                {value}
              </span>
              {metric && (
                <span className={cn('text-xs sm:text-sm', labelColorVariants[variant])}>
                  {metric}
                </span>
              )}
            </div>
            {trendValue && (
              <div className="flex items-center gap-1 mt-1">
                {trend === 'up' && (
                  <ArrowUp className="size-3 text-green-600 dark:text-green-400" />
                )}
                {trend === 'down' && (
                  <ArrowDown className="size-3 text-red-600 dark:text-red-400" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' && 'text-green-600 dark:text-green-400',
                    trend === 'down' && 'text-red-600 dark:text-red-400',
                  )}
                >
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          {icon && <div className="text-muted-foreground flex-shrink-0">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
