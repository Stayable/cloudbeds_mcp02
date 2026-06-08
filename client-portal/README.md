# Real Estate Investment Manager - Client Portal

A modern client portal for real estate investment managers to provide their LP investors with secure access to portfolio information, documents, capital activity, and communications.

## Features

- **Magic Link Authentication** - Passwordless email-based login
- **Portfolio Dashboard** - Investment summary, property listings, performance charts
- **Document Center** - Categorized documents (K-1s, statements, reports), secure downloads
- **Capital Activity** - Track capital calls and distributions
- **Communications** - Announcements, quarterly updates, meeting notifications
- **Admin Panel** - Manage investors, properties, documents, and communications

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS + shadcn/ui components
- **Authentication**: Magic link (passwordless) with JWT sessions
- **Email**: Nodemailer for transactional emails

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- SMTP credentials for email (Gmail, SendGrid, etc.)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/client_portal"
JWT_SECRET="your-secret-key"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

4. Set up the database:
```bash
npm run db:generate
npm run db:push
```

5. Seed the database with sample data:
```bash
npm run db:seed
```

6. Start the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000)

## Sample Users

After seeding, you can log in with these emails:

- **Admin**: admin@investorportal.com
- **Investors**:
  - john.doe@example.com
  - jane.smith@example.com
  - bob.johnson@example.com

Note: In development, magic link tokens are logged to the console if email sending fails.

## Project Structure

```
client-portal/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data
├── src/
│   ├── app/
│   │   ├── (portal)/      # Investor pages (protected)
│   │   ├── admin/         # Admin pages (admin only)
│   │   ├── api/           # API routes
│   │   └── auth/          # Auth pages
│   ├── components/
│   │   ├── dashboard/     # Dashboard widgets
│   │   ├── layout/        # Layout components
│   │   └── ui/            # UI components (shadcn)
│   └── lib/
│       ├── auth.ts        # Authentication logic
│       ├── db.ts          # Prisma client
│       ├── email.ts       # Email utilities
│       └── utils.ts       # Helper functions
├── uploads/               # Document storage
└── package.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run migrations
- `npm run db:seed` - Seed database
- `npm run db:studio` - Open Prisma Studio

## User Roles

### Investor (LP)
- View dashboard with portfolio summary
- Browse investments and property details
- Download documents (K-1s, statements, reports)
- Track capital calls and distributions
- Read communications and announcements

### Admin
- All investor capabilities
- Manage investors (create, view)
- Manage properties (create, edit)
- Upload and manage documents
- Create and publish communications

## API Routes

- `POST /api/auth/magic-link` - Request magic link
- `POST /api/auth/verify` - Verify magic link token
- `POST /api/auth/logout` - Logout
- `GET /api/documents/[id]/download` - Download document
- `POST /api/admin/investors` - Create investor (admin)
- `POST /api/admin/properties` - Create property (admin)
- `POST /api/admin/communications` - Create communication (admin)

## Customization

### Styling
- Edit `tailwind.config.ts` for theme colors
- Modify `src/app/globals.css` for CSS variables
- Update components in `src/components/ui/`

### Email Templates
- Edit templates in `src/lib/email.ts`
- Add new email types as needed

### Database Schema
- Modify `prisma/schema.prisma`
- Run `npm run db:migrate` to apply changes

## Security Features

- Passwordless authentication (magic links)
- HTTP-only session cookies
- Role-based access control
- Protected API routes
- Secure document downloads with access logging

## License

Private - All rights reserved
