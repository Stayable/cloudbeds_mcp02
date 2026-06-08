import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import {
  Building2,
  MapPin,
  Calendar,
  Users,
  Ruler,
  ArrowLeft,
  FileText,
  DollarSign,
} from 'lucide-react'
import Link from 'next/link'

async function getPropertyData(propertyId: string, userId: string) {
  const investment = await prisma.investment.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId,
      },
    },
    include: {
      property: true,
    },
  })

  if (!investment) return null

  const documents = await prisma.document.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const capitalActivities = await prisma.capitalActivity.findMany({
    where: { userId, propertyId },
    orderBy: { createdAt: 'desc' },
  })

  return {
    investment,
    property: investment.property,
    documents,
    capitalActivities,
  }
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) return null

  const { id } = await params
  const data = await getPropertyData(id, session.id)

  if (!data) {
    notFound()
  }

  const { investment, property, documents, capitalActivities } = data

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

  const totalDistributions = capitalActivities
    .filter((ca) => ca.type === 'DISTRIBUTION' && ca.status === 'COMPLETED')
    .reduce((sum, ca) => sum + ca.amount, 0)

  const totalCalls = capitalActivities
    .filter((ca) => ca.type === 'CALL' && ca.status === 'COMPLETED')
    .reduce((sum, ca) => sum + ca.amount, 0)

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link href="/portfolio">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Portfolio
        </Button>
      </Link>

      {/* Property Header */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Property Image */}
        <div className="lg:col-span-1">
          <div className="aspect-video bg-gradient-to-br from-slate-200 to-slate-300 rounded-lg flex items-center justify-center">
            {property.imageUrl ? (
              <img
                src={property.imageUrl}
                alt={property.name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <Building2 className="h-16 w-16 text-slate-400" />
            )}
          </div>
        </div>

        {/* Property Info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{property.name}</h1>
              <div className="flex items-center text-muted-foreground mt-1">
                <MapPin className="h-4 w-4 mr-1" />
                {property.address}, {property.city}, {property.state} {property.zipCode}
              </div>
            </div>
            <Badge variant={statusColors[property.status]} className="text-sm">
              {property.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-medium">{propertyTypeLabels[property.type]}</p>
              </div>
            </div>
            {property.totalUnits && (
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Units</p>
                  <p className="font-medium">{property.totalUnits}</p>
                </div>
              </div>
            )}
            {property.squareFeet && (
              <div className="flex items-center gap-2">
                <Ruler className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Sq Ft</p>
                  <p className="font-medium">{property.squareFeet.toLocaleString()}</p>
                </div>
              </div>
            )}
            {property.yearBuilt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Year Built</p>
                  <p className="font-medium">{property.yearBuilt}</p>
                </div>
              </div>
            )}
          </div>

          {property.description && (
            <p className="text-muted-foreground">{property.description}</p>
          )}
        </div>
      </div>

      {/* Investment Details */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Investment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(investment.amount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ownership
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercent(investment.ownershipPercent)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Distributions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalDistributions)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Property Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(property.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity">Capital Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Capital Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {capitalActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          activity.type === 'DISTRIBUTION'
                            ? 'bg-green-100 text-green-600'
                            : 'bg-orange-100 text-orange-600'
                        }`}
                      >
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {activity.type === 'DISTRIBUTION'
                            ? 'Distribution'
                            : 'Capital Call'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {activity.description || formatDate(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          activity.type === 'DISTRIBUTION'
                            ? 'text-green-600'
                            : 'text-orange-600'
                        }`}
                      >
                        {activity.type === 'DISTRIBUTION' ? '+' : '-'}
                        {formatCurrency(activity.amount)}
                      </p>
                      <Badge
                        variant={
                          activity.status === 'COMPLETED'
                            ? 'success'
                            : activity.status === 'PENDING'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {activity.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {capitalActivities.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No capital activity yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Property Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents?property=${property.id}`}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.category} - {formatDate(doc.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {documents.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No documents available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
