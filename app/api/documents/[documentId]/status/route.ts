import { type NextRequest, NextResponse } from "next/server"
import { getDocumentByIdFromDb, updateDocumentStatus } from "@/lib/local-storage"
import { getSession } from "@/lib/auth"
import { logInfo, logError } from "@/lib/logger"
import type { DocumentStatus } from "@/lib/local-storage"

/**
 * PATCH /api/documents/:documentId/status
 * Обновление статуса документа (draft -> final)
 * Доступно только владельцу документа
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params
    const id = parseInt(documentId, 10)

    if (Number.isNaN(id)) {
      return NextResponse.json({ success: false, error: "Некорректный ID документа" }, { status: 400 })
    }

    const body = await request.json()
    const { status } = body

    if (!status || (status !== "draft" && status !== "final")) {
      return NextResponse.json(
        { success: false, error: "Некорректный статус. Допустимые значения: draft, final" },
        { status: 400 },
      )
    }

    const doc = getDocumentByIdFromDb(id)
    if (!doc) {
      return NextResponse.json({ success: false, error: "Документ не найден" }, { status: 404 })
    }

    // Проверяем авторизацию
    const user = getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: "Необходима авторизация" }, { status: 401 })
    }

    // Проверяем, что пользователь является владельцем документа
    if (doc.userId !== user.username) {
      return NextResponse.json(
        { success: false, error: "Нельзя изменить статус чужого документа" },
        { status: 403 },
      )
    }

    const updated = updateDocumentStatus(id, status as DocumentStatus)

    if (updated) {
      logInfo(
        `Статус документа изменен на ${status}`,
        user.username,
        user.role,
        "document_update",
        { documentId: id, status },
      )
      return NextResponse.json({
        success: true,
        message: `Статус документа изменен на ${status === "final" ? "финальный" : "черновой"}`,
        document: {
          id: doc.id,
          status: status,
        },
      })
    }

    return NextResponse.json(
      { success: false, error: "Не удалось обновить статус документа" },
      { status: 500 },
    )
  } catch (error) {
    console.error("Error updating document status:", error)
    logError(
      "Ошибка при обновлении статуса документа",
      error instanceof Error ? error.message : String(error),
      undefined,
      undefined,
      "document_update",
    )
    return NextResponse.json(
      { success: false, error: "Ошибка при обновлении статуса" },
      { status: 500 },
    )
  }
}
