import { type NextRequest, NextResponse } from "next/server"
import { getUserByUsername, updateLastLogin } from "@/lib/user-storage"
import { logInfo, logError } from "@/lib/logger"

// POST - Авторизация пользователя
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    const normalizedUsername = typeof username === "string" ? username.trim() : ""
    const normalizedPassword = typeof password === "string" ? password.trim() : ""

    if (!normalizedUsername || !normalizedPassword) {
      return NextResponse.json({ success: false, error: "Логин и пароль обязательны" }, { status: 400 })
    }

    // Проверяем локальную базу пользователей
    const storedUser = getUserByUsername(normalizedUsername)
    if (storedUser && storedUser.password === normalizedPassword) {
      updateLastLogin(normalizedUsername)
      logInfo("Пользователь авторизован", normalizedUsername, storedUser.role, "login")

      return NextResponse.json({
        success: true,
        user: {
          username: storedUser.username,
          role: storedUser.role,
          additionalRoles: storedUser.additionalRoles ?? [],
          email: storedUser.email,
          fullName: storedUser.fullName,
          institution: storedUser.institution,
        },
      })
    }

    // Fallback на тестовых пользователей
    const testUsers: Record<string, { username: string; password: string; role: string; email?: string; fullName?: string }> = {
      student: { username: "student", password: "student", role: "student", fullName: "Студент Тестовый" },
      teacher: { username: "teacher", password: "teacher", role: "teacher", fullName: "Преподаватель Тестовый" },
      admin: { username: "admin", password: "admin", role: "admin", fullName: "Администратор Тестовый" },
      superadmin: { username: "superadmin", password: "superadmin", role: "superadmin", fullName: "Главный Администратор" },
    }

    const testUser = testUsers[normalizedUsername]
    if (testUser && testUser.password === normalizedPassword) {
      logInfo("Тестовый пользователь авторизован", normalizedUsername, testUser.role, "login")
      return NextResponse.json({
        success: true,
        user: {
          username: testUser.username,
          role: testUser.role as any,
          additionalRoles: [],
          email: testUser.email,
          fullName: testUser.fullName,
        },
      })
    }

    logError("Неудачная попытка входа", `Invalid credentials for ${username}`, username, undefined, "login")
    return NextResponse.json({ success: false, error: "Неверный логин или пароль" }, { status: 401 })
  } catch (error) {
    logError("Ошибка при авторизации", error instanceof Error ? error : String(error), undefined, undefined, "login")
    return NextResponse.json({ success: false, error: "Ошибка при авторизации" }, { status: 500 })
  }
}
