"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogIn, Loader2, User, Lock, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authenticate, saveSession } from "@/lib/auth"
import { BsuirLogo } from "@/components/bsuir-logo"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      })

      const data = await res.json()

      if (data.success && data.user) {
        saveSession(data.user)
        const u = data.user as { role: string; additionalRoles?: string[] }
        const hasRole = (role: string) => u.role === role || (u.additionalRoles?.includes(role) ?? false)
        if (hasRole("admin") || hasRole("superadmin")) {
          router.push("/admin")
        } else if (hasRole("student") || hasRole("teacher")) {
          router.push("/check")
        } else {
          router.push("/check")
        }
      } else {
        setError(data.error || "Неверный логин или пароль")
        setIsLoading(false)
      }
    } catch (err) {
      setError("Ошибка соединения с сервером")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="flex justify-center">
            <BsuirLogo />
          </div>
          <div>
            <CardTitle className="text-2xl">Вход в систему</CardTitle>
            <CardDescription className="mt-2">Система проверки уникальности работ</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Логин
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Введите логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Пароль
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full gap-2" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Вход...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Войти
                </>
              )}
            </Button>
            <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                В случае возникновения проблем со входом необходимо{" "}
                <a
                  href="https://iis.bsuir.by/password-recovery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  восстановить пароль
                </a>{" "}
                в ИИС «БГУИР: Университет».
              </p>
              <p className="mt-1">
                Если самостоятельно сбросить пароль не удалось, воспользуйтесь пунктом «Восстановление пароля» в{" "}
                <a
                  href="https://courses.bsuir.by/support.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  форме связи с техподдержкой
                </a>
                .
              </p>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              <a
                href="https://bsuir.by"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 transition-colors"
              >
                bsuir.by
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
