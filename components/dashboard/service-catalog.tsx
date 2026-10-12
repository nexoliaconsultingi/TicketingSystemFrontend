'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Service {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  tickets: number
  team: string
  status: 'active' | 'maintenance'
}

interface ServiceCatalogProps {
  title?: string
  description?: string
  services: Service[]
}

export function ServiceCatalog({
  title = 'Service catalogue',
  description = 'Available services',
  services,
}: ServiceCatalogProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((service) => (
            <Button
              key={service.id}
              variant="outline"
              className={cn(
                'h-auto justify-start gap-3 px-4 py-3 text-left',
                service.status === 'maintenance' && 'opacity-50',
              )}
              disabled={service.status === 'maintenance'}
            >
              <div className="text-muted-foreground flex-shrink-0">{service.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{service.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{service.team}</p>
              </div>
              <Badge variant="secondary" className="flex-shrink-0">
                {service.tickets}
              </Badge>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
