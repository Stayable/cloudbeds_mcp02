import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get document
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        documentAccess: {
          where: { userId: session.id },
        },
      },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if user has access
    // User has access if:
    // 1. They have explicit DocumentAccess
    // 2. They're invested in the property
    // 3. It's a general document (no property)
    const hasAccess =
      document.documentAccess.length > 0 ||
      document.propertyId === null ||
      (document.propertyId &&
        (await prisma.investment.findUnique({
          where: {
            userId_propertyId: {
              userId: session.id,
              propertyId: document.propertyId,
            },
          },
        })))

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Log access
    await prisma.documentAccess.create({
      data: {
        documentId: id,
        userId: session.id,
      },
    })

    // Read file
    const filePath = path.join(process.cwd(), 'uploads', document.filePath)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const fileBuffer = await readFile(filePath)

    // Return file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.name}"`,
        'Content-Length': document.fileSize.toString(),
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
