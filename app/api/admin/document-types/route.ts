import { type NextRequest, NextResponse } from "next/server"
import { getDocumentTypes, addDocumentType } from "@/lib/document-types"
import { requireAdminApi } from "@/lib/require-admin-api"

/** GET — список типов (для админки) */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi(request)
  if (!gate.ok) return gate.response
  try {
    const types = getDocumentTypes()
    return NextResponse.json({ success: true, types })
  } catch (error) {
    console.error("Error fetching document types:", error)
    return NextResponse.json({ success: false, error: "Ошибка загрузки типов" }, { status: 500 })
  }
}

/** POST — создать тип задания */
export async function POST(request: NextRequest) {
  const gate = await requireAdminApi(request)
  if (!gate.ok) return gate.response
  try {
    const body = await request.json()
    const { id, label } = body
    if (!id || !label) {
      return NextResponse.json({ success: false, error: "Укажите идентификатор и название" }, { status: 400 })
    }
    const result = addDocumentType(String(id), String(label))
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, types: getDocumentTypes() })
  } catch (error) {
    console.error("Error creating document type:", error)
    return NextResponse.json({ success: false, error: "Ошибка создания типа" }, { status: 500 })
  }
}
