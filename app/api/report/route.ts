import { type NextRequest, NextResponse } from "next/server"
import { generatePDFReport } from "@/lib/pdf-report"
import { saveReportPdf } from "@/lib/local-storage"
import { logInfo } from "@/lib/logger"

const DEFAULT_REPORT_BASE_URL = "http://172.16.82.130:3000"

function getBaseUrl(_request: NextRequest): string {
  // Для QR нужен публичный адрес, который гарантированно открывается для пользователей.
  const configured = (process.env.REPORT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured.replace(/\/$/, "")
  }

  // Fallback: фиксированный адрес сервера для QR-ссылок.
  return DEFAULT_REPORT_BASE_URL
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
