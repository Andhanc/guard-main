import { type NextRequest, NextResponse } from "next/server"
import { getAllUsers, registerUser } from "@/lib/user-storage"
import { getAllDocumentsFromDb } from "@/lib/local-storage"
import { logInfo, logError } from "@/lib/logger"

// GET - Получение всех пользователей
export async function GET() {
  try {
    const users = getAllUsers()
    const documents = getAllDocumentsFromDb()

    // Подсчитываем количество документов для каждого пользователя
    const userDocumentCounts = new Map<string, number>()
    documents.forEach((doc) => {
      if (doc.userId) {
        userDocumentCounts.set(doc.userId, (userDocumentCounts.get(doc.userId) || 0) + 1)
      }
    })

    // Возвращаем без паролей
    const usersData = users.map((user) => ({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      additionalRoles: user.additionalRoles ?? [],
      institution: user.institution,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      documentCount: userDocumentCounts.get(user.username) || 0,
    }))

    return NextResponse.json({
      success: true,
      users: usersData,
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST - Добавление нового пользователя
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, role, email, fullName, institution } = body

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Логин и пароль обязательны" }, { status: 400 })
    }

    const result = registerUser(username, password, role || "student", email, fullName, institution)

    if (result.success) {
      logInfo("Пользователь добавлен администратором", username, "admin", "add_user", {
        role,
        institution,
      })
      return NextResponse.json({
        success: true,
        user: result.user,
        message: "Пользователь успешно добавлен",
      })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
  } catch (error) {
    logError("Ошибка при добавлении пользователя", error instanceof Error ? error : String(error), undefined, "admin", "add_user")
    return NextResponse.json({ success: false, error: "Ошибка при добавлении пользователя" }, { status: 500 })
  }
}
