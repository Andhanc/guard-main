import { type NextRequest, NextResponse } from "next/server"
import { updateDocumentType, deleteDocumentType, getDocumentTypes } from "@/lib/document-types"

/** PUT — обновить тип по id */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { label } = body
    if (!label) {
      return NextResponse.json({ success: false, error: "Укажите название" }, { status: 400 })
    }
    const result = updateDocumentType(decodeURIComponent(id), String(label))
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, types: getDocumentTypes() })
  } catch (error) {
    console.error("Error updating document type:", error)
    return NextResponse.json({ success: false, error: "Ошибка обновления типа" }, { status: 500 })
  }
}

/** DELETE — удалить тип по id */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = deleteDocumentType(decodeURIComponent(id))
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, types: getDocumentTypes() })
  } catch (error) {
    console.error("Error deleting document type:", error)
    return NextResponse.json({ success: false, error: "Ошибка удаления типа" }, { status: 500 })
  }
}
