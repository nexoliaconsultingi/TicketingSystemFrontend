'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface SLAMetric {
  name: string
  compliance: number
  target: number
  status: 'healthy' | 'warning' | 'critical'
}

interface SLAStatusProps {
  title?: string
  description?: string
  metrics: SLAMetric[]
}

const statusColors = {
  healthy: {
    bar: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
  },
  warning: {
    bar: 'bg-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  critical: {
    bar: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
}

export function SLAStatus({
  title = 'SLA status',
  description = 'Compliance against service level agreements',
  metrics,
}: SLAStatusProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((metric) => {
            const percentage = Math.round((metric.compliance / metric.target) * 100)
            const status =
              percentage >= 100
                ? 'healthy'
                : percentage >= 80
                  ? 'warning'
                  : 'critical'

            return (
              <div key={metric.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{metric.name}</span>
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      statusColors[status].text,
                    )}
                  >
                    {percentage}%
                  </span>
                </div>
                <Progress value={Math.min(percentage, 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {metric.compliance}h / {metric.target}h
                </p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
