'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QueueTicket {
  id: string
  number: string
  subject: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  service: string
  requester: string
  waitTime: string
  slaStatus: 'breached' | 'at-risk' | 'normal'
}

const priorityColors = {
  P1: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  P2: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  P3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  P4: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
}

const slaStatusIcons = {
  breached: <AlertCircle className="size-4 text-red-600 dark:text-red-400" />,
  'at-risk': <Clock className="size-4 text-orange-600 dark:text-orange-400" />,
  normal: <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />,
}

const slaStatusText = {
  breached: 'SLA breached',
  'at-risk': 'SLA at risk',
  normal: 'SLA on track',
}

interface TicketQueueProps {
  title?: string
  description?: string
  tickets: QueueTicket[]
  maxHeight?: boolean
}

export function TicketQueue({
  title = 'Ticket queue',
  description = 'Overview of priority tickets',
  tickets,
  maxHeight = false,
}: TicketQueueProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn('flex-1', maxHeight && 'flex flex-col overflow-hidden')}>
        <div className={cn('space-y-2', maxHeight && 'overflow-y-auto')}>
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {ticket.number}: {ticket.subject}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ticket.service} • {ticket.requester}
                      </p>
                    </div>
                    <Badge className={cn(priorityColors[ticket.priority])} variant="secondary">
                      {ticket.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-muted-foreground">{ticket.waitTime}</span>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {slaStatusIcons[ticket.slaStatus]}
                      {slaStatusText[ticket.slaStatus]}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No pending ticket</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
