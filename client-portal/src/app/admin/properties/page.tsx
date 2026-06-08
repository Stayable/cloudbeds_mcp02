import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Building2, Users, MapPin } from 'lucide-react'
import Link from 'next/link'

async function getProperties() {
  const properties = await prisma.property.findMany({
    include: {
      _count: { select: { investments: true } },
      investments: {
        select: { amount: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return properties.map((property) => ({
    ...property,
    totalInvested: property.investments.reduce((sum, inv) => sum + inv.amount, 0),
  }))
}

const statusColors = {
  ACTIVE: 'success',
  SOLD: 'secondary',
  DEVELOPMENT: 'warning',
  PENDING: 'outline',
} as const

const typeLabels = {
  MULTIFAMILY: 'Multifamily',
  OFFICE: 'Office',
  RETAIL: 'Retail',
  INDUSTRIAL: 'Industrial',
  MIXED_USE: 'Mixed Use',
  LAND: 'Land',
}

export default async function PropertiesPage() {
  const properties = await getProperties()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">
            Manage your real estate properties
          </p>
        </div>
        <Link href="/admin/properties/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Property
          </Button>
        </Link>
      </div>

      {/* Properties Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Properties ({properties.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Investors</TableHead>
                <TableHead>Total Invested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((property) => (
                <TableRow key={property.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-slate-600" />
                      </div>
                      <span className="font-medium">{property.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{typeLabels[property.type]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {property.city}, {property.state}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {property._count.investments}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(property.totalInvested)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[property.status]}>
                      {property.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/properties/${property.id}`}>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {properties.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No properties yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
