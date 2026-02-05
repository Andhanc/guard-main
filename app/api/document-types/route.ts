import { NextResponse } from "next/server"
import { getDocumentTypes } from "@/lib/document-types"

/** Публичный список типов заданий/документов */
export async function GET() {
  try {
    const types = getDocumentTypes()
    return NextResponse.json({ success: true, types })
  } catch (error) {
    console.error("Error fetching document types:", error)
    return NextResponse.json({ success: false, error: "Ошибка загрузки типов" }, { status: 500 })
  }
}
