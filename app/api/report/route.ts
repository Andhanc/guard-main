import { type NextRequest, NextResponse } from "next/server"
import { generatePDFReport } from "@/lib/pdf-report"
import { saveReportPdf } from "@/lib/local-storage"
import { logInfo } from "@/lib/logger"

function getBaseUrl(request: NextRequest): string {
  // Приоритет 1: переменная окружения (для production)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Приоритет 2: заголовки запроса (для работы через прокси/nginx)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") ?? "http"
  
  if (host) {
    // Проверяем, что это не localhost (для production)
    const hostLower = host.toLowerCase()
    if (!hostLower.includes("localhost") && !hostLower.includes("127.0.0.1")) {
      return `${proto === "https" ? "https" : "http"}://${host}`
    }
  }

  // Fallback: используем переменную окружения или localhost для разработки
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

// POST - Генерация PDF отчета
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = body

    if (!result || !result.filename || result.uniquenessPercent === undefined) {
      return NextResponse.json({ success: false, error: "Недостаточно данных для генерации отчета" }, { status: 400 })
    }

    // Всегда используем серверную функцию getBaseUrl, игнорируя baseUrl с клиента
    // чтобы избежать проблем с localhost на сервере
    const baseUrl = getBaseUrl(request)
    const payload = {
      ...result,
      checker: result.checker ?? undefined,
      baseUrl,
    }

    const pdfBytes = await generatePDFReport(payload)
    const pdfBuffer = Buffer.from(pdfBytes)

    const isFinal = result.status === "final" && result.documentId
    if (isFinal) {
      saveReportPdf(result.documentId, pdfBuffer, result.uniquenessPercent)
    }

    logInfo("PDF отчет сгенерирован", result.userId, result.userRole, "generate_report", {
      filename: result.filename,
      uniquenessPercent: result.uniquenessPercent,
      documentId: result.documentId,
      stored: isFinal,
    })

    const base = result.filename.replace(/\.[^/.]+$/, "")
    const safeBase = base.replace(/[^\x00-\x7F]/g, "_").replace(/_{2,}/g, "_") || "document"
    const fn = isFinal ? `spravka-${safeBase}.pdf` : `report-${safeBase}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    })
  } catch (error) {
    console.error("Error generating PDF report:", error)
    return NextResponse.json({ success: false, error: "Ошибка при генерации отчета" }, { status: 500 })
  }
}
