import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@investorportal.com' },
    update: {},
    create: {
      email: 'admin@investorportal.com',
      name: 'Admin User',
      role: 'ADMIN',
    },
  })
  console.log('Created admin user:', admin.email)

  // Create sample investors
  const investors = await Promise.all([
    prisma.user.upsert({
      where: { email: 'john.doe@example.com' },
      update: {},
      create: {
        email: 'john.doe@example.com',
        name: 'John Doe',
        phone: '+1 (555) 123-4567',
        role: 'INVESTOR',
      },
    }),
    prisma.user.upsert({
      where: { email: 'jane.smith@example.com' },
      update: {},
      create: {
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        phone: '+1 (555) 234-5678',
        role: 'INVESTOR',
      },
    }),
    prisma.user.upsert({
      where: { email: 'bob.johnson@example.com' },
      update: {},
      create: {
        email: 'bob.johnson@example.com',
        name: 'Bob Johnson',
        role: 'INVESTOR',
      },
    }),
  ])
  console.log('Created investors:', investors.length)

  // Create sample properties
  const properties = await Promise.all([
    prisma.property.upsert({
      where: { id: 'prop-sunset-gardens' },
      update: {},
      create: {
        id: 'prop-sunset-gardens',
        name: 'Sunset Gardens Apartments',
        address: '123 Sunset Boulevard',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
        type: 'MULTIFAMILY',
        status: 'ACTIVE',
        description: 'A luxury multifamily property in the heart of downtown Austin with resort-style amenities.',
        totalValue: 15000000,
        totalUnits: 150,
        squareFeet: 125000,
        yearBuilt: 2018,
      },
    }),
    prisma.property.upsert({
      where: { id: 'prop-tech-tower' },
      update: {},
      create: {
        id: 'prop-tech-tower',
        name: 'Tech Tower Office Complex',
        address: '500 Innovation Drive',
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94105',
        type: 'OFFICE',
        status: 'ACTIVE',
        description: 'Class A office space in the South of Market district, fully leased to tech companies.',
        totalValue: 45000000,
        squareFeet: 200000,
        yearBuilt: 2020,
      },
    }),
    prisma.property.upsert({
      where: { id: 'prop-riverside-retail' },
      update: {},
      create: {
        id: 'prop-riverside-retail',
        name: 'Riverside Retail Center',
        address: '789 Commerce Way',
        city: 'Denver',
        state: 'CO',
        zipCode: '80202',
        type: 'RETAIL',
        status: 'DEVELOPMENT',
        description: 'A new mixed-use retail development with premium anchor tenants.',
        totalValue: 25000000,
        squareFeet: 85000,
      },
    }),
  ])
  console.log('Created properties:', properties.length)

  // Create investments
  await Promise.all([
    // John Doe's investments
    prisma.investment.upsert({
      where: { userId_propertyId: { userId: investors[0].id, propertyId: 'prop-sunset-gardens' } },
      update: {},
      create: {
        userId: investors[0].id,
        propertyId: 'prop-sunset-gardens',
        amount: 250000,
        ownershipPercent: 1.67,
        investmentDate: new Date('2023-03-15'),
      },
    }),
    prisma.investment.upsert({
      where: { userId_propertyId: { userId: investors[0].id, propertyId: 'prop-tech-tower' } },
      update: {},
      create: {
        userId: investors[0].id,
        propertyId: 'prop-tech-tower',
        amount: 500000,
        ownershipPercent: 1.11,
        investmentDate: new Date('2023-06-01'),
      },
    }),
    // Jane Smith's investments
    prisma.investment.upsert({
      where: { userId_propertyId: { userId: investors[1].id, propertyId: 'prop-sunset-gardens' } },
      update: {},
      create: {
        userId: investors[1].id,
        propertyId: 'prop-sunset-gardens',
        amount: 150000,
        ownershipPercent: 1.0,
        investmentDate: new Date('2023-04-20'),
      },
    }),
    prisma.investment.upsert({
      where: { userId_propertyId: { userId: investors[1].id, propertyId: 'prop-riverside-retail' } },
      update: {},
      create: {
        userId: investors[1].id,
        propertyId: 'prop-riverside-retail',
        amount: 300000,
        ownershipPercent: 1.2,
        investmentDate: new Date('2024-01-10'),
      },
    }),
    // Bob Johnson's investments
    prisma.investment.upsert({
      where: { userId_propertyId: { userId: investors[2].id, propertyId: 'prop-tech-tower' } },
      update: {},
      create: {
        userId: investors[2].id,
        propertyId: 'prop-tech-tower',
        amount: 750000,
        ownershipPercent: 1.67,
        investmentDate: new Date('2023-08-15'),
      },
    }),
  ])
  console.log('Created investments')

  // Create capital activities
  await Promise.all([
    // Distributions for John Doe
    prisma.capitalActivity.create({
      data: {
        userId: investors[0].id,
        propertyId: 'prop-sunset-gardens',
        type: 'DISTRIBUTION',
        status: 'COMPLETED',
        amount: 5000,
        description: 'Q3 2024 Distribution',
        completedAt: new Date('2024-10-15'),
      },
    }),
    prisma.capitalActivity.create({
      data: {
        userId: investors[0].id,
        propertyId: 'prop-tech-tower',
        type: 'DISTRIBUTION',
        status: 'COMPLETED',
        amount: 12500,
        description: 'Q3 2024 Distribution',
        completedAt: new Date('2024-10-15'),
      },
    }),
    // Capital call for Jane Smith
    prisma.capitalActivity.create({
      data: {
        userId: investors[1].id,
        propertyId: 'prop-riverside-retail',
        type: 'CALL',
        status: 'PENDING',
        amount: 50000,
        description: 'Development Phase 2 Capital Call',
        dueDate: new Date('2025-02-15'),
      },
    }),
    // Completed capital call
    prisma.capitalActivity.create({
      data: {
        userId: investors[1].id,
        propertyId: 'prop-riverside-retail',
        type: 'CALL',
        status: 'COMPLETED',
        amount: 75000,
        description: 'Initial Capital Call',
        completedAt: new Date('2024-01-15'),
      },
    }),
  ])
  console.log('Created capital activities')

  // Create communications
  await Promise.all([
    prisma.communication.create({
      data: {
        title: 'Q4 2024 Portfolio Update',
        content: `Dear Investors,

We are pleased to share our Q4 2024 portfolio update. Our properties continue to perform well despite market headwinds.

Key highlights:
- Sunset Gardens maintains 95% occupancy
- Tech Tower renewed three major tenants
- Riverside Retail development is on track for Q2 2025 completion

We remain committed to delivering strong risk-adjusted returns for our investors.

Best regards,
Investment Management Team`,
        type: 'QUARTERLY_UPDATE',
        authorId: admin.id,
      },
    }),
    prisma.communication.create({
      data: {
        title: 'Annual Investor Meeting - Save the Date',
        content: `Dear Valued Investors,

We are excited to announce our Annual Investor Meeting will be held on March 15, 2025.

Date: March 15, 2025
Time: 2:00 PM - 5:00 PM EST
Location: Virtual (Zoom link to follow)

Agenda:
- 2024 Year in Review
- Portfolio Performance Deep Dive
- 2025 Investment Outlook
- Q&A Session

Please mark your calendars. A calendar invite and meeting details will be sent closer to the date.

Looking forward to seeing you there!`,
        type: 'MEETING',
        authorId: admin.id,
      },
    }),
    prisma.communication.create({
      data: {
        title: 'Important: Tax Documents Available',
        content: `Dear Investors,

Your 2024 K-1 tax documents are now available in the Document Center.

Please log in to your portal and navigate to Documents > K-1 Tax Documents to download your forms.

If you have any questions about your tax documents, please consult with your tax advisor.

Thank you,
Investor Relations`,
        type: 'ANNOUNCEMENT',
        authorId: admin.id,
      },
    }),
  ])
  console.log('Created communications')

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
