import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowDownLeft, ArrowUpRight, FileText, MessageSquare } from 'lucide-react'

interface Activity {
  id: string
  type: 'distribution' | 'call' | 'document' | 'communication'
  title: string
  description: string
  amount?: number
  date: string
}

interface RecentActivityProps {
  activities: Activity[]
}

const activityIcons = {
  distribution: ArrowDownLeft,
  call: ArrowUpRight,
  document: FileText,
  communication: MessageSquare,
}

const activityColors = {
  distribution: 'bg-green-100 text-green-600',
  call: 'bg-orange-100 text-orange-600',
  document: 'bg-blue-100 text-blue-600',
  communication: 'bg-purple-100 text-purple-600',
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const Icon = activityIcons[activity.type]
            return (
              <div key={activity.id} className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activityColors[activity.type]}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{activity.title}</p>
                    {activity.amount && (
                      <span
                        className={`text-sm font-semibold ${
                          activity.type === 'distribution'
                            ? 'text-green-600'
                            : activity.type === 'call'
                            ? 'text-orange-600'
                            : ''
                        }`}
                      >
                        {activity.type === 'distribution' ? '+' : '-'}
                        {formatCurrency(activity.amount)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activity.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(activity.date)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
