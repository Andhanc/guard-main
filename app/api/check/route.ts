import { type NextRequest, NextResponse } from "next/server"
import { normalizeContentForCheck } from "@/lib/plagiarism/algorithms"
import { analyzeWithMlService } from "@/lib/analysis-client"
import { logInfo, logError } from "@/lib/logger"

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function roundPercent(n: number): number {
  return Math.round(clampPercent(n) * 100) / 100
}

// POST - Проверка документа на плагиат
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, filename: checkFilename } = body

    if (!content) {
      return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 })
    }

    if (content.length < 50) {
      return NextResponse.json({ success: false, error: "Content must be at least 50 characters" }, { status: 400 })
    }

    const startTime = Date.now()

    // Убираем титульный лист, содержание и приложения перед расчётом оригинальности
    const normalizedContent = normalizeContentForCheck(content)

    const ml = await analyzeWithMlService(normalizedContent, {
      filename: typeof checkFilename === "string" ? checkFilename : undefined,
    })

    const processingTime = Date.now() - startTime

    if (!ml) {
      return NextResponse.json(
        {
          success: false,
          error: "ML analysis service is unavailable. Set ANALYSIS_SERVICE_URL and ensure antiplagiarism is running.",
        },
        { status: 503 },
      )
    }

    const plagiarismPercent = roundPercent(clampPercent(ml.plagiarismPercent))
    const uniquenessPercent = roundPercent(100 - plagiarismPercent)

    logInfo("Проверка документа завершена", body.userId, body.userRole, "check", {
      uniquenessPercent,
      plagiarismPercent,
      processingTimeMs: processingTime,
      mlAnalysisUsed: Boolean(ml),
    })

    return NextResponse.json({
      success: true,
      processingTimeMs: processingTime,
      plagiarismPercent,
      uniquenessPercent,
      totalDocumentsChecked: 0,
      similarDocuments: [],
      mlPlagiarismPercent: roundPercent(ml.plagiarismPercent),
      mlAiPercent: roundPercent(ml.aiPercent),
    })
  } catch (error) {
    logError("Ошибка при проверке документа", error instanceof Error ? error : String(error), undefined, undefined, "check")
    return NextResponse.json({ success: false, error: "Failed to check document" }, { status: 500 })
  }
}
