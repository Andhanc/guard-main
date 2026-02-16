"use client"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSession, hasRole } from "@/lib/auth"

export default function HomePage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const user = getSession()
    if (user) {
      if (hasRole(user, "student") || hasRole(user, "teacher")) {
        router.push(hasRole(user, "teacher") && !hasRole(user, "student") ? "/admin" : "/check")
      } else if (hasRole(user, "admin") || hasRole(user, "superadmin")) {
        router.push("/admin")
      } else {
        router.push("/check")
      }
    } else {
      router.push("/login")
    }
  }, [router])

  // Показываем стабильный контент до монтирования, чтобы избежать проблем с гидратацией
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" suppressHydrationWarning>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center" suppressHydrationWarning>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
