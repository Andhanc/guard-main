import { type NextRequest, NextResponse } from "next/server"
import { getUserByUsername, deleteUser, readUsersDatabase, writeUsersDatabase } from "@/lib/user-storage"
import type { UserRole } from "@/lib/auth"
import { logInfo, logError } from "@/lib/logger"

// PUT - Редактирование пользователя
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params
    const body = await request.json()
    const { password, role, additionalRoles, email, fullName, institution } = body

    const user = getUserByUsername(username)
    if (!user) {
      return NextResponse.json({ success: false, error: "Пользователь не найден" }, { status: 404 })
    }

    // Обновляем данные пользователя
    const db = readUsersDatabase()
    const userIndex = db.users.findIndex((u) => u.username === username)

    if (userIndex === -1) {
      return NextResponse.json({ success: false, error: "Пользователь не найден" }, { status: 404 })
    }

    if (password && password.length > 0) {
      db.users[userIndex].password = password
    }
    if (role) {
      db.users[userIndex].role = role as UserRole
    }
    if (additionalRoles !== undefined && Array.isArray(additionalRoles)) {
      db.users[userIndex].additionalRoles = additionalRoles.filter((r): r is UserRole => Boolean(r))
    }
    if (email !== undefined) {
      db.users[userIndex].email = email
    }
    if (fullName !== undefined) {
      db.users[userIndex].fullName = fullName
    }
    if (institution !== undefined) {
      db.users[userIndex].institution = institution
    }

    writeUsersDatabase(db)

    logInfo("Пользователь отредактирован администратором", username, "admin", "edit_user")
    return NextResponse.json({
      success: true,
      message: "Пользователь успешно обновлен",
    })
  } catch (error) {
    logError("Ошибка при редактировании пользователя", error instanceof Error ? error : String(error), undefined, "admin", "edit_user")
    return NextResponse.json({ success: false, error: "Ошибка при редактировании пользователя" }, { status: 500 })
  }
}

// DELETE - Удаление пользователя
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params

    const deleted = deleteUser(username)
    if (deleted) {
      logInfo("Пользователь удален администратором", username, "admin", "delete_user")
      return NextResponse.json({
        success: true,
        message: "Пользователь успешно удален",
      })
    } else {
      return NextResponse.json({ success: false, error: "Пользователь не найден" }, { status: 404 })
    }
  } catch (error) {
    logError("Ошибка при удалении пользователя", error instanceof Error ? error : String(error), undefined, "admin", "delete_user")
    return NextResponse.json({ success: false, error: "Ошибка при удалении пользователя" }, { status: 500 })
  }
}
