import { type NextRequest, NextResponse } from "next/server"
import { reportVerifyResponse } from "@/lib/report-verify-get"

/** GET /api/report/verify/:documentId/:sig — тот же смысл, что query-параметры, но без символа & (удобнее для QR). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string; sig: string }> },
) {
  try {
    const { documentId: documentIdRaw, sig: sigRaw } = await params
    const id = parseInt(documentIdRaw, 10)
    const fromQuery = request.nextUrl.searchParams.get("raw") === "1"
    let sig = sigRaw
    try {
      sig = decodeURIComponent(sigRaw)
    } catch {
      sig = sigRaw
    }

    return reportVerifyResponse(id, sig || null, fromQuery)
  } catch (e) {
    console.error("Report verify (path) error:", e)
    return NextResponse.json({ success: false, error: "Ошибка верификации" }, { status: 500 })
  }
}
