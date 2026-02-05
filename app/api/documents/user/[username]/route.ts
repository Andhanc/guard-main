import { type NextRequest, NextResponse } from "next/server"
import { getUserDocuments, getReportPdfPath } from "@/lib/local-storage"
import { signDocumentAccess } from "@/lib/report-access"
import { categoryLabel } from "@/lib/category-labels"

function getBaseUrl(request: NextRequest): string {
  const origin = request.nextUrl.origin
  if (origin) return origin
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") ?? "http"
  return host ? `${proto === "https" ? "https" : "http"}://${host}` : ""
}

// GET - Документы пользователя (финальные и черновики в пределах 24 ч)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params

    if (!username) {
      return NextResponse.json({ success: false, error: "Username is required" }, { status: 400 })
    }

    const documents = getUserDocuments(username)
    const baseUrl = getBaseUrl(request)

    const documentsSummary = documents.map((doc) => {
      const hasReport = doc.status === "final" && !!getReportPdfPath(doc.id)
      const sig = hasReport ? signDocumentAccess("report", doc.id) : null
      const reportViewUrl =
        baseUrl && sig ? `${baseUrl}/api/report/${doc.id}/view?sig=${encodeURIComponent(sig)}` : null

      return {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        filename: doc.filename,
        category: doc.category,
        categoryLabel: categoryLabel(doc.category),
        uploadDate: doc.uploadDate,
        status: doc.status,
        reportViewUrl,
      }
    })

    return NextResponse.json({
      success: true,
      count: documentsSummary.length,
      documents: documentsSummary,
    })
  } catch (error) {
    console.error("Error fetching user documents:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch documents" }, { status: 500 })
  }
}
