import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import {
  MessageSquare,
  Megaphone,
  BarChart3,
  Calendar,
  Circle,
  CheckCircle,
} from 'lucide-react'
import Link from 'next/link'

async function getCommunications(userId: string) {
  const communications = await prisma.communication.findMany({
    include: {
      author: {
        select: { name: true },
      },
      reads: {
        where: { userId },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const unreadCount = communications.filter((c) => c.reads.length === 0).length

  return { communications, unreadCount }
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

export default async function CommunicationsPage() {
  const session = await getSession()
  if (!session) return null

  const { communications, unreadCount } = await getCommunications(session.id)

  const announcements = communications.filter(
    (c) => c.type === 'ANNOUNCEMENT'
  )
  const updates = communications.filter(
    (c) => c.type === 'QUARTERLY_UPDATE'
  )
  const meetings = communications.filter((c) => c.type === 'MEETING')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
          <p className="text-muted-foreground">
            Stay updated with the latest news and announcements
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {unreadCount} unread
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="updates">Quarterly Updates</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <CommunicationList communications={communications} />
        </TabsContent>

        <TabsContent value="announcements">
          <CommunicationList communications={announcements} />
        </TabsContent>

        <TabsContent value="updates">
          <CommunicationList communications={updates} />
        </TabsContent>

        <TabsContent value="meetings">
          <CommunicationList communications={meetings} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CommunicationList({
  communications,
}: {
  communications: Awaited<ReturnType<typeof getCommunications>>['communications']
}) {
  if (communications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No communications</h3>
          <p className="text-sm text-muted-foreground">
            New updates will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {communications.map((comm) => {
        const Icon = typeIcons[comm.type]
        const isRead = comm.reads.length > 0

        return (
          <Link key={comm.id} href={`/communications/${comm.id}`}>
            <Card
              className={`hover:shadow-md transition-shadow cursor-pointer ${
                !isRead ? 'border-primary/50 bg-primary/5' : ''
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${
                      typeColors[comm.type]
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg truncate">
                            {comm.title}
                          </h3>
                          {!isRead && (
                            <Circle className="h-2 w-2 fill-primary text-primary" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {comm.author.name} - {formatDate(comm.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={typeColors[comm.type]}
                      >
                        {typeLabels[comm.type]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-2 line-clamp-2">
                      {comm.content.substring(0, 200)}
                      {comm.content.length > 200 ? '...' : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
