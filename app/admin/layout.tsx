"use client"

import { usePathname, useRouter } from "next/navigation"
import { getSession, clearSession, hasRole, type User } from "@/lib/auth"
import { useEffect, useState } from "react"
import { Users, Database, BarChart3, FileText, LogOut, Home, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BsuirLogo } from "@/components/bsuir-logo"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    const user = getSession()
    if (!user || (!hasRole(user, "admin") && !hasRole(user, "superadmin") && !hasRole(user, "teacher"))) {
      router.push("/login")
      setUser(null)
    } else {
      setUser(user)
    }
  }, [router])

  const handleLogout = () => {
    clearSession()
    router.push("/login")
  }

  // Пока не знаем, авторизован ли пользователь, рендерим стабильный placeholder,
  // одинаковый на сервере и на клиенте, чтобы избежать ошибок гидрации.
  if (user === undefined) {
    return <div className="min-h-screen bg-background" />
  }

  if (!user) {
    return null
  }

  const navItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/users", label: "Пользователи", icon: Users },
    ...(hasRole(user, "admin") || hasRole(user, "superadmin")
      ? [{ href: "/admin/document-types", label: "Типы заданий", icon: Tags }]
      : []),
    { href: "/admin/storage", label: "Хранилище", icon: Database },
    { href: "/admin/statistics", label: "Статистика", icon: BarChart3 },
    { href: "/admin/logs", label: "Журналы", icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-gradient-to-r from-blue-50 to-white dark:from-gray-900 dark:to-gray-900">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BsuirLogo href="/admin" />
            {(() => {
              const role = user.role
              const label =
                role === "superadmin"
                  ? "Главный администратор"
                  : role === "admin"
                    ? "Администратор"
                    : "Преподаватель"
              const colorClasses =
                role === "superadmin"
                  ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-500/40"
                  : role === "admin"
                    ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-500/40"
                    : "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-100 dark:border-indigo-500/40"
              return (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${colorClasses}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {label}
                </Badge>
              )
            })()}
          </div>
          <nav className="flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href))
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  onClick={() => router.push(item.href)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              )
            })}
            <Button variant="outline" className="gap-2 bg-transparent ml-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
