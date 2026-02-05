import { type NextRequest, NextResponse } from "next/server"
import { getDocumentByIdFromDb, getReportPdfPath } from "@/lib/local-storage"

/**
 * GET /api/report/verify?documentId=123
 * Для QR-кода «подтверждение подлинности и актуальности справки».
 * Возвращает метаданные отчёта из локального хранилища.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get("documentId")
    const raw = searchParams.get("raw") === "1"

    if (!documentId) {
      return NextResponse.json({ success: false, error: "documentId обязателен" }, { status: 400 })
    }

    const id = parseInt(documentId, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ success: false, error: "Некорректный documentId" }, { status: 400 })
    }

    const doc = getDocumentByIdFromDb(id)
    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Документ не найден в локальном хранилище" },
        { status: 404 },
      )
    }

    const reportExists = !!getReportPdfPath(id)

    const payload = {
      success: true,
      documentId: doc.id,
      title: doc.title,
      author: doc.author,
      institution: doc.institution ?? "БГУИР",
      status: doc.status,
      uploadDate: doc.uploadDate,
      reportStored: reportExists,
      verifiedAt: new Date().toISOString(),
    }

    if (raw) {
      return NextResponse.json(payload)
    }

    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Верификация справки</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;"><h1>Проверка подлинности справки</h1><p>Документ №${doc.id} — <strong>${doc.title ?? "—"}</strong></p><p>Автор: ${doc.author ?? "—"}</p><p>Дата загрузки: ${doc.uploadDate ? new Date(doc.uploadDate).toLocaleString("ru-RU") : "—"}</p><p>Отчёт в хранилище: ${reportExists ? "да" : "нет"}</p><p style="color:#666;font-size:0.9rem;">Верификация выполнена в системе БГУИР.ПЛАГИАТ.</p></body></html>`,
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    )
  } catch (e) {
    console.error("Report verify error:", e)
    return NextResponse.json({ success: false, error: "Ошибка верификации" }, { status: 500 })
  }
}
