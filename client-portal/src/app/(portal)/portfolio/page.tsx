import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import { Building2, MapPin, Calendar, Users } from 'lucide-react'
import Link from 'next/link'

async function getPortfolioData(userId: string) {
  const investments = await prisma.investment.findMany({
    where: { userId },
    include: {
      property: true,
    },
    orderBy: { investmentDate: 'desc' },
  })

  return investments
}

export default async function PortfolioPage() {
  const session = await getSession()
  if (!session) return null

  const investments = await getPortfolioData(session.id)

  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0)
  const totalValue = investments.reduce(
    (sum, inv) => sum + (inv.amount * (inv.property.totalValue / 100) * inv.ownershipPercent),
    0
  )

  const statusColors = {
    ACTIVE: 'success',
    SOLD: 'secondary',
    DEVELOPMENT: 'warning',
    PENDING: 'outline',
  } as const

  const propertyTypeLabels = {
    MULTIFAMILY: 'Multifamily',
    OFFICE: 'Office',
    RETAIL: 'Retail',
    INDUSTRIAL: 'Industrial',
    MIXED_USE: 'Mixed Use',
    LAND: 'Land',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground">
          View and manage your real estate investments
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Invested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvested)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Properties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{investments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Investments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {investments.filter((i) => i.property.status === 'ACTIVE').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Investment List */}
      <div className="grid gap-6 md:grid-cols-2">
        {investments.map((investment) => (
          <Link key={investment.id} href={`/portfolio/${investment.propertyId}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="p-0">
                {/* Property Image */}
                <div className="h-48 bg-gradient-to-br from-slate-200 to-slate-300 rounded-t-lg flex items-center justify-center">
                  {investment.property.imageUrl ? (
                    <img
                      src={investment.property.imageUrl}
                      alt={investment.property.name}
                      className="w-full h-full object-cover rounded-t-lg"
                    />
                  ) : (
                    <Building2 className="h-16 w-16 text-slate-400" />
                  )}
                </div>

                {/* Property Details */}
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {investment.property.name}
                      </h3>
                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        {investment.property.city}, {investment.property.state}
                      </div>
                    </div>
                    <Badge variant={statusColors[investment.property.status]}>
                      {investment.property.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center">
                      <Building2 className="h-4 w-4 mr-1" />
                      {propertyTypeLabels[investment.property.type]}
                    </span>
                    {investment.property.totalUnits && (
                      <span className="flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {investment.property.totalUnits} units
                      </span>
                    )}
                  </div>

                  <div className="border-t pt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Your Investment</p>
                      <p className="font-semibold">{formatCurrency(investment.amount)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ownership</p>
                      <p className="font-semibold">
                        {formatPercent(investment.ownershipPercent)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 mr-1" />
                    Invested {formatDate(investment.investmentDate)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {investments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No investments yet</h3>
            <p className="text-sm text-muted-foreground">
              Your investment portfolio will appear here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
