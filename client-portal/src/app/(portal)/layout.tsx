import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole={session.role} />
      <div className="lg:pl-64">
        <Header user={session} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
