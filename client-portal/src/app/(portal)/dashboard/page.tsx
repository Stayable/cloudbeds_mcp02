import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatsCard } from '@/components/dashboard/stats-card'
import { PortfolioChart } from '@/components/dashboard/portfolio-chart'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'
import {
  DollarSign,
  Building2,
  TrendingUp,
  Wallet,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

async function getDashboardData(userId: string) {
  // Get user's investments with property details
  const investments = await prisma.investment.findMany({
    where: { userId },
    include: { property: true },
  })

  // Get capital activities
  const capitalActivities = await prisma.capitalActivity.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { property: true },
  })

  // Get recent communications
  const communications = await prisma.communication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // Calculate totals
  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0)
  const totalDistributions = capitalActivities
    .filter((ca) => ca.type === 'DISTRIBUTION' && ca.status === 'COMPLETED')
    .reduce((sum, ca) => sum + ca.amount, 0)
  const pendingCalls = capitalActivities
    .filter((ca) => ca.type === 'CALL' && ca.status === 'PENDING')
    .reduce((sum, ca) => sum + ca.amount, 0)

  // Mock portfolio value over time (would come from real calculations)
  const portfolioHistory = [
    { month: 'Jan', value: totalInvested * 0.95 },
    { month: 'Feb', value: totalInvested * 0.97 },
    { month: 'Mar', value: totalInvested * 0.99 },
    { month: 'Apr', value: totalInvested * 1.02 },
    { month: 'May', value: totalInvested * 1.04 },
    { month: 'Jun', value: totalInvested * 1.06 },
    { month: 'Jul', value: totalInvested * 1.05 },
    { month: 'Aug', value: totalInvested * 1.08 },
    { month: 'Sep', value: totalInvested * 1.10 },
    { month: 'Oct', value: totalInvested * 1.12 },
    { month: 'Nov', value: totalInvested * 1.14 },
    { month: 'Dec', value: totalInvested * 1.15 },
  ]

  // Format recent activity
  const recentActivity = capitalActivities.slice(0, 5).map((ca) => ({
    id: ca.id,
    type: ca.type === 'DISTRIBUTION' ? 'distribution' as const : 'call' as const,
    title: ca.type === 'DISTRIBUTION' ? 'Distribution Received' : 'Capital Call',
    description: ca.property?.name || 'General',
    amount: ca.amount,
    date: ca.createdAt.toISOString(),
  }))

  return {
    investments,
    totalInvested,
    totalDistributions,
    pendingCalls,
    portfolioHistory,
    recentActivity,
    propertyCount: investments.length,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null

  const data = await getDashboardData(session.id)

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {session.name.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your investment portfolio
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Invested"
          value={formatCurrency(data.totalInvested)}
          icon={DollarSign}
          description="Across all properties"
        />
        <StatsCard
          title="Total Distributions"
          value={formatCurrency(data.totalDistributions)}
          icon={Wallet}
          trend={{ value: 12.5, isPositive: true }}
          description="Year to date"
        />
        <StatsCard
          title="Properties"
          value={data.propertyCount.toString()}
          icon={Building2}
          description="Active investments"
        />
        <StatsCard
          title="Pending Calls"
          value={formatCurrency(data.pendingCalls)}
          icon={TrendingUp}
          description={data.pendingCalls > 0 ? 'Due soon' : 'No pending calls'}
        />
      </div>

      {/* Chart and Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PortfolioChart data={data.portfolioHistory} />
        <RecentActivity activities={data.recentActivity} />
      </div>

      {/* Properties Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Your Investments</CardTitle>
          <Link
            href="/portfolio"
            className="text-sm text-primary hover:underline flex items-center"
          >
            View all <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.investments.slice(0, 3).map((investment) => (
              <div
                key={investment.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium">{investment.property.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {investment.property.city}, {investment.property.state}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatCurrency(investment.amount)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPercent(investment.ownershipPercent)} ownership
                  </p>
                </div>
                <Badge
                  variant={
                    investment.property.status === 'ACTIVE'
                      ? 'success'
                      : investment.property.status === 'SOLD'
                      ? 'secondary'
                      : 'warning'
                  }
                >
                  {investment.property.status}
                </Badge>
              </div>
            ))}
            {data.investments.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No investments yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
