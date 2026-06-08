import { prisma } from '@/lib/db'
import { StatsCard } from '@/components/dashboard/stats-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import {
  Users,
  Building2,
  FileText,
  DollarSign,
  TrendingUp,
  MessageSquare,
} from 'lucide-react'

async function getAdminStats() {
  const [
    userCount,
    investorCount,
    propertyCount,
    documentCount,
    communicationCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'INVESTOR' } }),
    prisma.property.count(),
    prisma.document.count(),
    prisma.communication.count(),
  ])

  const investments = await prisma.investment.aggregate({
    _sum: { amount: true },
  })

  const distributions = await prisma.capitalActivity.aggregate({
    where: { type: 'DISTRIBUTION', status: 'COMPLETED' },
    _sum: { amount: true },
  })

  const recentInvestors = await prisma.user.findMany({
    where: { role: 'INVESTOR' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const recentProperties = await prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      _count: { select: { investments: true } },
    },
  })

  return {
    userCount,
    investorCount,
    propertyCount,
    documentCount,
    communicationCount,
    totalInvested: investments._sum.amount || 0,
    totalDistributed: distributions._sum.amount || 0,
    recentInvestors,
    recentProperties,
  }
}

export default async function AdminDashboard() {
  const stats = await getAdminStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your investor portal and track key metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Investors"
          value={stats.investorCount.toString()}
          icon={Users}
          description={`${stats.userCount} total users`}
        />
        <StatsCard
          title="Properties"
          value={stats.propertyCount.toString()}
          icon={Building2}
          description="Active properties"
        />
        <StatsCard
          title="Total Invested"
          value={formatCurrency(stats.totalInvested)}
          icon={DollarSign}
          description="Across all properties"
        />
        <StatsCard
          title="Total Distributed"
          value={formatCurrency(stats.totalDistributed)}
          icon={TrendingUp}
          description="To investors"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatsCard
          title="Documents"
          value={stats.documentCount.toString()}
          icon={FileText}
          description="Uploaded documents"
        />
        <StatsCard
          title="Communications"
          value={stats.communicationCount.toString()}
          icon={MessageSquare}
          description="Posted updates"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Investors */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Investors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentInvestors.map((investor) => (
                <div
                  key={investor.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{investor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {investor.email}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(investor.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {stats.recentInvestors.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No investors yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Properties */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentProperties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{property.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {property.city}, {property.state}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {property._count.investments} investors
                  </p>
                </div>
              ))}
              {stats.recentProperties.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No properties yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
