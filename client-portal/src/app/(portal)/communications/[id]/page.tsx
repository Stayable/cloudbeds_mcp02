import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Megaphone,
  BarChart3,
  Calendar,
  MessageSquare,
  User,
  Clock,
} from 'lucide-react'
import Link from 'next/link'

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

async function getCommunication(id: string, userId: string) {
  const communication = await prisma.communication.findUnique({
    where: { id },
    include: {
      author: {
        select: { name: true },
      },
    },
  })

  if (!communication) return null

  // Mark as read
  await prisma.communicationRead.upsert({
    where: {
      communicationId_userId: {
        communicationId: id,
        userId,
      },
    },
    create: {
      communicationId: id,
      userId,
    },
    update: {},
  })

  return communication
}

export default async function CommunicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) return null

  const { id } = await params
  const communication = await getCommunication(id, session.id)

  if (!communication) {
    notFound()
  }

  const Icon = typeIcons[communication.type]

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link href="/communications">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Communications
        </Button>
      </Link>

      {/* Content */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div
              className={`h-14 w-14 rounded-full flex items-center justify-center shrink-0 ${
                typeColors[communication.type]
              }`}
            >
              <Icon className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <CardTitle className="text-2xl">{communication.title}</CardTitle>
                <Badge variant="outline" className={typeColors[communication.type]}>
                  {typeLabels[communication.type]}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {communication.author.name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDate(communication.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-slate max-w-none">
            {communication.content.split('\n').map((paragraph, index) => (
              <p key={index} className="mb-4">
                {paragraph}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
