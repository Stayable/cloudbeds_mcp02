import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'

async function getCapitalData(userId: string) {
  const activities = await prisma.capitalActivity.findMany({
    where: { userId },
    include: { property: true },
    orderBy: { createdAt: 'desc' },
  })

  const distributions = activities.filter((a) => a.type === 'DISTRIBUTION')
  const calls = activities.filter((a) => a.type === 'CALL')

  const totalDistributions = distributions
    .filter((d) => d.status === 'COMPLETED')
    .reduce((sum, d) => sum + d.amount, 0)

  const totalCalls = calls
    .filter((c) => c.status === 'COMPLETED')
    .reduce((sum, c) => sum + c.amount, 0)

  const pendingCalls = calls
    .filter((c) => c.status === 'PENDING')
    .reduce((sum, c) => sum + c.amount, 0)

  return {
    activities,
    distributions,
    calls,
    totalDistributions,
    totalCalls,
    pendingCalls,
  }
}

export default async function CapitalPage() {
  const session = await getSession()
  if (!session) return null

  const data = await getCapitalData(session.id)

  const statusColors = {
    PENDING: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'secondary',
  } as const

  const statusIcons = {
    PENDING: Clock,
    COMPLETED: CheckCircle,
    CANCELLED: AlertCircle,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Capital Activity</h1>
        <p className="text-muted-foreground">
          Track your capital calls and distributions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Distributions
            </CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.totalDistributions)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Capital Called
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.totalCalls)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Calls
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(data.pendingCalls)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Cash Flow
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                data.totalDistributions - data.totalCalls >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {formatCurrency(data.totalDistributions - data.totalCalls)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Capital Calls Alert */}
      {data.pendingCalls > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold">Pending Capital Calls</h3>
              <p className="text-sm text-muted-foreground">
                You have {formatCurrency(data.pendingCalls)} in pending capital
                calls. Please review and fulfill by the due dates.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Activity</TabsTrigger>
          <TabsTrigger value="distributions">Distributions</TabsTrigger>
          <TabsTrigger value="calls">Capital Calls</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Capital Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityList activities={data.activities} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distributions">
          <Card>
            <CardHeader>
              <CardTitle>Distributions</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityList activities={data.distributions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls">
          <Card>
            <CardHeader>
              <CardTitle>Capital Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityList activities={data.calls} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ActivityList({
  activities,
}: {
  activities: Awaited<ReturnType<typeof getCapitalData>>['activities']
}) {
  const statusColors = {
    PENDING: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'secondary',
  } as const

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No activity found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center justify-between p-4 border rounded-lg"
        >
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center ${
                activity.type === 'DISTRIBUTION'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-orange-100 text-orange-600'
              }`}
            >
              {activity.type === 'DISTRIBUTION' ? (
                <ArrowDownLeft className="h-6 w-6" />
              ) : (
                <ArrowUpRight className="h-6 w-6" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {activity.type === 'DISTRIBUTION'
                  ? 'Distribution'
                  : 'Capital Call'}
              </p>
              <p className="text-sm text-muted-foreground">
                {activity.property?.name || 'General'}
              </p>
              {activity.description && (
                <p className="text-sm text-muted-foreground">
                  {activity.description}
                </p>
              )}
            </div>
          </div>
          <div className="text-right space-y-1">
            <p
              className={`font-semibold text-lg ${
                activity.type === 'DISTRIBUTION'
                  ? 'text-green-600'
                  : 'text-orange-600'
              }`}
            >
              {activity.type === 'DISTRIBUTION' ? '+' : '-'}
              {formatCurrency(activity.amount)}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Badge variant={statusColors[activity.status]}>
                {activity.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {activity.dueDate && activity.status === 'PENDING'
                ? `Due ${formatDate(activity.dueDate)}`
                : formatDate(activity.completedAt || activity.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
