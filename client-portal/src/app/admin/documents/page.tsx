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
import { formatDate, formatFileSize } from '@/lib/utils'
import { Plus, FileText, Building2, Trash2 } from 'lucide-react'
import Link from 'next/link'

async function getDocuments() {
  const documents = await prisma.document.findMany({
    include: {
      property: true,
      uploader: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return documents
}

const categoryLabels = {
  K1: 'K-1',
  STATEMENT: 'Statement',
  REPORT: 'Report',
  LEGAL: 'Legal',
  TAX: 'Tax',
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

export default async function AdminDocumentsPage() {
  const documents = await getDocuments()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            Upload and manage investor documents
          </p>
        </div>
        <Link href="/admin/documents/upload">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </Link>
      </div>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={categoryColors[doc.category]}
                    >
                      {categoryLabels[doc.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {doc.property ? (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {doc.property.name}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">General</span>
                    )}
                  </TableCell>
                  <TableCell>{doc.year || '-'}</TableCell>
                  <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                  <TableCell>
                    <div>
                      <p>{formatDate(doc.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        by {doc.uploader.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No documents uploaded yet
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
