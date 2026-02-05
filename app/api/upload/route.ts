import { type NextRequest, NextResponse } from "next/server"
import { saveFileToDisk, addDocumentToDb } from "@/lib/local-storage"
import { createShingles, MinHash, normalizeContentForCheck } from "@/lib/plagiarism/algorithms"
import { logInfo, logError } from "@/lib/logger"

const NUM_HASHES = 128

// POST - Загрузка файла и добавление в базу
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string
    const author = formData.get("author") as string | null
    const category = formData.get("category") as string | null
    const content = formData.get("content") as string
    const status = (formData.get("status") as "draft" | "final") || "draft"
    const userId = formData.get("userId") as string | null
    const institution = formData.get("institution") as string | null

    if (!file || !title || !content) {
      return NextResponse.json({ success: false, error: "Файл, название и содержимое обязательны" }, { status: 400 })
    }

    const normCategory = (category || "uncategorized").replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"

    // Сохраняем файл в папку категории (coursework, diploma и т.д.)
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const savedFilename = saveFileToDisk(fileBuffer, file.name, normCategory)

    // Нормализуем содержимое для целей проверки (убираем титульный лист, содержание, приложения)
    const normalizedContent = normalizeContentForCheck(content)

    // Создаем MinHash сигнатуру
    const shingles = createShingles(normalizedContent, 5)
    const minhash = new MinHash(NUM_HASHES)
    const signature = minhash.computeSignature(shingles)

    // Добавляем в базу данных этой категории
    const doc = addDocumentToDb(
      title,
      normalizedContent,
      signature,
      shingles.size,
      author || undefined,
      file.name,
      savedFilename,
      normCategory,
      status,
      userId || undefined,
      institution || undefined,
    )

    logInfo("Документ загружен", userId || undefined, undefined, "upload", {
      documentId: doc.id,
      title: doc.title,
      category: category,
      status: status,
    })

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        filePath: doc.filePath,
        wordCount: doc.wordCount,
      },
      message: `Файл сохранен: ${doc.filePath}`,
    })
  } catch (error) {
    logError("Ошибка при загрузке файла", error instanceof Error ? error : String(error), undefined, undefined, "upload")
    return NextResponse.json({ success: false, error: "Ошибка при загрузке файла" }, { status: 500 })
  }
}
