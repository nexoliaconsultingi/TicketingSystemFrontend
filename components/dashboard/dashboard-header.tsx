'use client'

import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'

interface DashboardHeaderProps {
  organizationName?: string
  onRefresh?: () => void
  onCreateTicket?: () => void
}

export function DashboardHeader({
  organizationName = 'Ticketing platform',
  onRefresh,
  onCreateTicket,
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{organizationName}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
        {onCreateTicket && (
          <Button size="sm" onClick={onCreateTicket} className="gap-2">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New ticket</span>
          </Button>
        )}
      </div>
    </div>
  )
}
