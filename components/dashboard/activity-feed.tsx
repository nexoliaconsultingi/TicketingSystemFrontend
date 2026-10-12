'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  user: string
  userInitials: string
  action: string
  details: string
  timestamp: string
  type: 'ticket' | 'assignment' | 'resolution' | 'escalation' | 'comment'
}

const typeStyles = {
  ticket: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  assignment: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  resolution: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  escalation: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  comment: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200',
}

const typeLabels = {
  ticket: 'Ticket',
  assignment: 'Assignment',
  resolution: 'Resolution',
  escalation: 'Escalation',
  comment: 'Comment',
}

interface ActivityFeedProps {
  title?: string
  description?: string
  activities: ActivityItem[]
  maxHeight?: boolean
}

export function ActivityFeed({
  title = 'Recent activity',
  description = 'Latest events',
  activities,
  maxHeight = false,
}: ActivityFeedProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn('flex-1', maxHeight && 'flex flex-col overflow-hidden')}>
        <div className={cn('space-y-3', maxHeight && 'overflow-y-auto')}>
          {activities.length > 0 ? (
            activities.map((activity) => (
              <div key={activity.id} className="flex gap-3">
                <Avatar className="size-8 flex-shrink-0">
                  <AvatarFallback className="text-xs bg-muted">
                    {activity.userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {activity.user}{' '}
                        <span className="font-normal text-muted-foreground">
                          {activity.action}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {activity.details}
                      </p>
                    </div>
                    <Badge variant="secondary" className={cn(typeStyles[activity.type])}>
                      {typeLabels[activity.type]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
