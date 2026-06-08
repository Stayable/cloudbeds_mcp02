import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const data = await request.json()

    const {
      name,
      address,
      city,
      state,
      zipCode,
      type,
      status,
      description,
      totalValue,
      totalUnits,
      squareFeet,
      yearBuilt,
    } = data

    if (!name || !address || !city || !state || !zipCode || !type || !totalValue) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const property = await prisma.property.create({
      data: {
        name,
        address,
        city,
        state,
        zipCode,
        type,
        status: status || 'ACTIVE',
        description: description || null,
        totalValue: parseFloat(totalValue),
        totalUnits: totalUnits ? parseInt(totalUnits) : null,
        squareFeet: squareFeet ? parseInt(squareFeet) : null,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
      },
    })

    return NextResponse.json({ property })
  } catch (error) {
    console.error('Create property error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    await requireAdmin()

    const properties = await prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ properties })
  } catch (error) {
    console.error('Get properties error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
