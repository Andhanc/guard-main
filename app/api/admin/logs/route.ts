import { type NextRequest, NextResponse } from "next/server"
import { getLogs } from "@/lib/logger"

// GET - Получение логов
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get("level") as "info" | "warning" | "error" | "debug" | null

    const logs = getLogs(undefined, undefined, level || undefined)

    return NextResponse.json({
      success: true,
      logs: logs.slice(0, 1000), // Ограничиваем последними 1000 записями
    })
  } catch (error) {
    console.error("Error fetching logs:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch logs" }, { status: 500 })
  }
}
