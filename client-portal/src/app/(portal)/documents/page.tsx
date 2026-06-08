import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, formatFileSize } from '@/lib/utils'
import { FileText, Download, Search, Filter, FolderOpen } from 'lucide-react'
import Link from 'next/link'

async function getDocuments(userId: string) {
  // Get user's investments to find their properties
  const investments = await prisma.investment.findMany({
    where: { userId },
    select: { propertyId: true },
  })

  const propertyIds = investments.map((i) => i.propertyId)

  // Get documents that are either:
  // 1. Specifically shared with this user (via DocumentAccess)
  // 2. Associated with properties they're invested in
  // 3. General documents (no property association)
  const documents = await prisma.document.findMany({
    where: {
      OR: [
        { documentAccess: { some: { userId } } },
        { propertyId: { in: propertyIds } },
        { propertyId: null },
      ],
    },
    include: {
      property: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
  })

  return { documents, properties }
}

const categoryLabels = {
  K1: 'K-1 Tax Documents',
  STATEMENT: 'Statements',
  REPORT: 'Reports',
  LEGAL: 'Legal Documents',
  TAX: 'Tax Documents',
  OTHER: 'Other',
}

const categoryColors = {
  K1: 'bg-purple-100 text-purple-800',
  STATEMENT: 'bg-blue-100 text-blue-800',
  REPORT: 'bg-green-100 text-green-800',
  LEGAL: 'bg-orange-100 text-orange-800',
  TAX: 'bg-red-100 text-red-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; property?: string; year?: string }>
}) {
  const session = await getSession()
  if (!session) return null

  const params = await searchParams
  const { documents, properties } = await getDocuments(session.id)

  // Filter documents based on search params
  let filteredDocuments = documents
  if (params.category) {
    filteredDocuments = filteredDocuments.filter(
      (d) => d.category === params.category
    )
  }
  if (params.property) {
    filteredDocuments = filteredDocuments.filter(
      (d) => d.propertyId === params.property
    )
  }
  if (params.year) {
    filteredDocuments = filteredDocuments.filter(
      (d) => d.year === parseInt(params.year!)
    )
  }

  // Get unique years
  const years = [...new Set(documents.map((d) => d.year).filter(Boolean))].sort(
    (a, b) => (b ?? 0) - (a ?? 0)
  )

  // Group documents by category
  const documentsByCategory = filteredDocuments.reduce((acc, doc) => {
    const cat = doc.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(doc)
    return acc
  }, {} as Record<string, typeof documents>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Access your investment documents, tax forms, and reports
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search documents..." className="pl-10" />
              </div>
            </div>
            <Select defaultValue={params.category || 'all'}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue={params.property || 'all'}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue={params.year || 'all'}>
              <SelectTrigger className="w-full md:w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={year!.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Document Categories */}
      {Object.entries(documentsByCategory).length > 0 ? (
        Object.entries(documentsByCategory).map(([category, docs]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {categoryLabels[category as keyof typeof categoryLabels]}
                <Badge variant="secondary">{docs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {doc.property && (
                            <>
                              <span>{doc.property.name}</span>
                              <span>-</span>
                            </>
                          )}
                          {doc.year && <span>{doc.year}</span>}
                          <span>-</span>
                          <span>{formatFileSize(doc.fileSize)}</span>
                          <span>-</span>
                          <span>{formatDate(doc.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <Link href={`/api/documents/${doc.id}/download`}>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No documents found</h3>
            <p className="text-sm text-muted-foreground">
              {params.category || params.property || params.year
                ? 'Try adjusting your filters'
                : 'Documents will appear here when available'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
