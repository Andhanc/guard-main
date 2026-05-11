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
        router.replace(hasRole(user, "teacher") && !hasRole(user, "student") ? "/admin" : "/check")
      } else if (hasRole(user, "admin") || hasRole(user, "superadmin")) {
        router.replace("/admin")
      } else {
        router.replace("/check")
      }
    }
  }, [router])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#eaf1fb] flex items-center justify-center" suppressHydrationWarning>
        <Loader2 className="h-8 w-8 animate-spin text-[#2563eb]" />
      </div>
    )
  }

  const user = getSession()
  if (user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" suppressHydrationWarning>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <iframe
      src="/antiplagiarism-landing.html"
      title="Антиплагиат БГУИР — проверка на оригинальность"
      className="block h-[100dvh] min-h-[600px] w-full border-0"
    />
  )
}
