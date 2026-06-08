'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  FileText,
  DollarSign,
  MessageSquare,
  Settings,
  Users,
  Upload,
  BarChart3,
} from 'lucide-react'

interface SidebarProps {
  userRole: 'INVESTOR' | 'ADMIN'
}

const investorNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: Building2 },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/capital', label: 'Capital Activity', icon: DollarSign },
  { href: '/communications', label: 'Communications', icon: MessageSquare },
]

const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/investors', label: 'Investors', icon: Users },
  { href: '/admin/properties', label: 'Properties', icon: Building2 },
  { href: '/admin/documents', label: 'Documents', icon: Upload },
  { href: '/admin/communications', label: 'Communications', icon: MessageSquare },
]

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')
  const navItems = isAdmin ? adminNavItems : investorNavItems

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-slate-800">
        <Building2 className="h-8 w-8 text-white" />
        <span className="ml-3 text-xl font-semibold text-white">InvestorHub</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Role Switcher (for admins) */}
      {userRole === 'ADMIN' && (
        <div className="px-4 py-4 border-t border-slate-800">
          <Link
            href={isAdmin ? '/dashboard' : '/admin'}
            className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <Settings className="h-5 w-5 mr-3" />
            {isAdmin ? 'Investor View' : 'Admin Panel'}
          </Link>
        </div>
      )}
    </aside>
  )
}
