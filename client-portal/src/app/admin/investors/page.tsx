import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, Plus, Mail, Building2 } from 'lucide-react'
import Link from 'next/link'

async function getInvestors() {
  const investors = await prisma.user.findMany({
    where: { role: 'INVESTOR' },
    include: {
      investments: {
        include: { property: true },
      },
      _count: {
        select: { investments: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return investors.map((investor) => ({
    ...investor,
    totalInvested: investor.investments.reduce((sum, inv) => sum + inv.amount, 0),
  }))
}

export default async function InvestorsPage() {
  const investors = await getInvestors()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investors</h1>
          <p className="text-muted-foreground">
            Manage your LP investors and their investments
          </p>
        </div>
        <Link href="/admin/investors/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Investor
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search investors..." className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {/* Investors Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Investors ({investors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead>Total Invested</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((investor) => (
                <TableRow key={investor.id}>
                  <TableCell className="font-medium">{investor.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {investor.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {investor._count.investments}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(investor.totalInvested)}
                  </TableCell>
                  <TableCell>{formatDate(investor.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/admin/investors/${investor.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {investors.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No investors yet
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
