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
import { formatDate } from '@/lib/utils'
import { Plus, MessageSquare, Megaphone, BarChart3, Calendar, Eye } from 'lucide-react'
import Link from 'next/link'

async function getCommunications() {
  const communications = await prisma.communication.findMany({
    include: {
      author: {
        select: { name: true },
      },
      _count: {
        select: { reads: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalInvestors = await prisma.user.count({ where: { role: 'INVESTOR' } })

  return { communications, totalInvestors }
}

const typeIcons = {
  ANNOUNCEMENT: Megaphone,
  QUARTERLY_UPDATE: BarChart3,
  MEETING: Calendar,
  GENERAL: MessageSquare,
}

const typeLabels = {
  ANNOUNCEMENT: 'Announcement',
  QUARTERLY_UPDATE: 'Quarterly Update',
  MEETING: 'Meeting',
  GENERAL: 'General',
}

const typeColors = {
  ANNOUNCEMENT: 'bg-red-100 text-red-800',
  QUARTERLY_UPDATE: 'bg-blue-100 text-blue-800',
  MEETING: 'bg-purple-100 text-purple-800',
  GENERAL: 'bg-gray-100 text-gray-800',
}

export default async function AdminCommunicationsPage() {
  const { communications, totalInvestors } = await getCommunications()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
          <p className="text-muted-foreground">
            Send updates and announcements to investors
          </p>
        </div>
        <Link href="/admin/communications/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Communication
          </Button>
        </Link>
      </div>

      {/* Communications Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Communications ({communications.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Read By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {communications.map((comm) => {
                const Icon = typeIcons[comm.type]
                const readPercentage = totalInvestors > 0
                  ? Math.round((comm._count.reads / totalInvestors) * 100)
                  : 0

                return (
                  <TableRow key={comm.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            typeColors[comm.type]
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{comm.title}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                            {comm.content.substring(0, 100)}...
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeColors[comm.type]}>
                        {typeLabels[comm.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>{comm.author.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span>{comm._count.reads} / {totalInvestors}</span>
                        <span className="text-muted-foreground">({readPercentage}%)</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(comm.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/communications/${comm.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
              {communications.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No communications yet
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
