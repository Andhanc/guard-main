import { type NextRequest, NextResponse } from "next/server"
import { getAllDocumentsFromDb, deleteDocumentFromDb, getDocumentCountFromDb } from "@/lib/local-storage"

// GET - Список всех документов
export async function GET() {
  try {
    const documents = getAllDocumentsFromDb()
    const count = getDocumentCountFromDb()

    // Возвращаем без content для экономии трафика
    const documentsSummary = documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      author: doc.author,
      filename: doc.filename,
      filePath: doc.filePath,
      wordCount: doc.wordCount,
      uploadDate: doc.uploadDate,
      category: doc.category,
      status: doc.status,
      userId: doc.userId,
      institution: doc.institution,
      originalityPercent: doc.originalityPercent,
    }))

    return NextResponse.json({
      success: true,
      count,
      documents: documentsSummary,
    })
  } catch (error) {
    console.error("Error fetching documents:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch documents" }, { status: 500 })
  }
}

// DELETE - Удаление документа (и файла с диска)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ success: false, error: "Document ID is required" }, { status: 400 })
    }

    const deleted = deleteDocumentFromDb(Number.parseInt(id))

    if (deleted) {
      return NextResponse.json({
        success: true,
        message: "Документ и файл удалены",
      })
    } else {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Error deleting document:", error)
    return NextResponse.json({ success: false, error: "Failed to delete document" }, { status: 500 })
  }
}
