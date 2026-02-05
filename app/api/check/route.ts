import { type NextRequest, NextResponse } from "next/server"
import { getAllDocumentsFromDb } from "@/lib/local-storage"
import { createShingles, MinHash, compareMinHashSignatures, normalizeContentForCheck } from "@/lib/plagiarism/algorithms"
import { logInfo, logError } from "@/lib/logger"

const NUM_HASHES = 128

// POST - Проверка документа на плагиат
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, topK = 5, institution, category } = body

    if (!content) {
      return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 })
    }

    if (content.length < 50) {
      return NextResponse.json({ success: false, error: "Content must be at least 50 characters" }, { status: 400 })
    }

    const startTime = Date.now()

    // Убираем титульный лист, содержание и приложения перед расчётом оригинальности
    const normalizedContent = normalizeContentForCheck(content)

    // Создаем сигнатуру для проверяемого документа
    const shingles = createShingles(normalizedContent, 5)
    const minhash = new MinHash(NUM_HASHES)
    const signature = minhash.computeSignature(shingles)

    // Выбираем, по каким базам сравнивать: у каждого типа документа своя БД (папка).
    // Курсовая и дипломная сравниваются по двум базам: coursework + diploma.
    const normCategory = (category || "").replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"
    let categoriesToCompare: string[]
    if (normCategory === "coursework" || normCategory === "diploma") {
      categoriesToCompare = ["coursework", "diploma"]
    } else if (normCategory && normCategory !== "all") {
      categoriesToCompare = [normCategory]
    } else {
      categoriesToCompare = [] // все категории — передаём undefined ниже
    }

    const documents = categoriesToCompare.length > 0
      ? getAllDocumentsFromDb(undefined, institution, categoriesToCompare)
      : getAllDocumentsFromDb(undefined, institution)

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        processingTimeMs: Date.now() - startTime,
        uniquenessPercent: 100,
        totalDocumentsChecked: 0,
        similarDocuments: [],
        message: "База документов пуста",
      })
    }

    // Сравниваем с каждым документом в базе
    const similarities: Array<{
      id: number
      title: string
      author: string | null
      userId: string | null
      filename: string | null
      filePath: string | null
      similarity: number
      category: string
    }> = []

    for (const doc of documents) {
      // Используем сохраненную MinHash сигнатуру
      const similarity = compareMinHashSignatures(signature, doc.minhashSignature)

      similarities.push({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        userId: doc.userId || null,
        filename: doc.filename,
        filePath: doc.filePath,
        similarity: Math.round(similarity * 100),
        category: doc.category,
      })
    }

    // Сортируем по убыванию схожести и берем топ-K
    similarities.sort((a, b) => b.similarity - a.similarity)
    const topSimilar = similarities.slice(0, topK)

    // Вычисляем процент уникальности
    const maxSimilarity = topSimilar.length > 0 ? topSimilar[0].similarity : 0
    const uniquenessPercent = 100 - maxSimilarity

    const processingTime = Date.now() - startTime

    logInfo("Проверка документа завершена", body.userId, body.userRole, "check", {
      uniquenessPercent,
      totalDocumentsChecked: documents.length,
      similarDocumentsCount: topSimilar.length,
      processingTimeMs: processingTime,
    })

    return NextResponse.json({
      success: true,
      processingTimeMs: processingTime,
      uniquenessPercent,
      totalDocumentsChecked: documents.length,
      similarDocuments: topSimilar,
    })
  } catch (error) {
    logError("Ошибка при проверке документа", error instanceof Error ? error : String(error), undefined, undefined, "check")
    return NextResponse.json({ success: false, error: "Failed to check document" }, { status: 500 })
  }
}
