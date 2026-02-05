/**
 * Генерация PDF‑отчётов о проверке на плагиат.
 * Финальная версия (Сценарий Б): справка БГУИР с блоком верификации и двумя QR‑кодами.
 * Используется шрифт DejaVu Sans для корректного отображения кириллицы.
 */

// @ts-ignore - jsPDF может иметь проблемы с типами
import jsPDF from "jspdf"
import QRCode from "qrcode"
import fs from "fs"
import path from "path"
import { signDocumentAccess } from "@/lib/report-access"

const FONT = "DejaVu"

function loadDejaVuFonts(doc: jsPDF) {
  const base = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf")
  const regPath = path.join(base, "DejaVuSans.ttf")
  const boldPath = path.join(base, "DejaVuSans-Bold.ttf")
  if (!fs.existsSync(regPath) || !fs.existsSync(boldPath)) return
  try {
    const regBase64 = fs.readFileSync(regPath).toString("base64")
    const boldBase64 = fs.readFileSync(boldPath).toString("base64")
    doc.addFileToVFS("DejaVuSans.ttf", regBase64)
    doc.addFileToVFS("DejaVuSans-Bold.ttf", boldBase64)
    doc.addFont("DejaVuSans.ttf", FONT, "normal")
    doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold")
  } catch (e) {
    console.error("Failed to load DejaVu fonts for PDF:", e)
  }
}

export interface SimilarDocumentForReport {
  id: number
  title: string
  author: string | null
  userId?: string | null
  similarity: number
  category: string
}

export interface CheckResultForReport {
  filename: string
  title?: string
  author?: string
  checker?: string
  category?: string
  uniquenessPercent: number
  citationPercent?: number
  totalDocumentsChecked: number
  similarDocuments: SimilarDocumentForReport[]
  processingTimeMs: number
  uploadDate?: string
  status?: "draft" | "final"
  documentId?: number
  baseUrl?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  diploma: "Дипломная работа",
  coursework: "Курсовая работа / Проект",
  lab: "Лабораторная работа",
  practice: "Практическое задание",
  uncategorized: "Не указано",
}

function categoryLabel(cat?: string): string {
  if (!cat) return "Не указано"
  return CATEGORY_LABELS[cat] ?? cat
}

function formatDate(s?: string): string {
  if (!s) return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Процент с запятой (32,06) */
function formatPercent(v: number): string {
  return v.toFixed(2).replace(".", ",")
}

/** Рисует блок шапки (логотип + университет) в левом верхнем углу */
function drawHeaderBlock(doc: jsPDF, margin: number, pageWidth: number): number {
  let y = margin
  const logoSize = 12
  const blue = [0.22, 0.45, 0.82] as [number, number, number]

  // Пытаемся загрузить логотип BSUIR (приоритет PNG, так как jsPDF лучше поддерживает PNG)
  let logoLoaded = false
  const possibleLogoPaths = [
    "bsuir-logo.png",
    "bsuir.png",
    "logo-bsuir.png",
    "bsuir-logo.svg",
    "bsuir.svg",
    "logo-bsuir.svg",
  ]

  for (const logoName of possibleLogoPaths) {
    try {
      const logoPath = path.join(process.cwd(), "public", logoName)
      if (fs.existsSync(logoPath)) {
        const img = fs.readFileSync(logoPath)
        if (logoName.endsWith(".png")) {
          const base64 = `data:image/png;base64,${img.toString("base64")}`
          doc.addImage(base64, "PNG", margin, y, logoSize, logoSize)
          logoLoaded = true
          break
        }
        // SVG может не работать напрямую в jsPDF, но попробуем
        else if (logoName.endsWith(".svg")) {
          try {
            const base64 = `data:image/svg+xml;base64,${img.toString("base64")}`
            doc.addImage(base64, "SVG", margin, y, logoSize, logoSize)
            logoLoaded = true
            break
          } catch {
            // SVG не поддерживается, продолжаем поиск
          }
        }
      }
    } catch (e) {
      // Продолжаем поиск следующего файла
    }
  }

  // Если логотип не найден, используем fallback - синий квадрат
  if (!logoLoaded) {
    doc.setFillColor(...blue.map((c) => c * 255))
    doc.rect(margin, y, logoSize, logoSize, "F")
  }

  doc.setFontSize(9)
  doc.setFont(FONT, "normal")
  doc.setTextColor(0, 0, 0)
  doc.text(
    "Белорусский государственный университет информатики и радиоэлектроники",
    margin + logoSize + 4,
    y + logoSize / 2,
    { align: "left", baseline: "middle" },
  )
  y += logoSize + 6
  return y
}

/** Рисует футер (логотип + университет) внизу страницы */
function drawFooterBlock(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number) {
  const logoSize = 10
  const blue = [0.22, 0.45, 0.82] as [number, number, number]
  const y = pageHeight - margin - logoSize - 4

  // Пытаемся загрузить логотип BSUIR (приоритет PNG, так как jsPDF лучше поддерживает PNG)
  let logoLoaded = false
  const possibleLogoPaths = [
    "bsuir-logo.png",
    "bsuir.png",
    "logo-bsuir.png",
    "bsuir-logo.svg",
    "bsuir.svg",
    "logo-bsuir.svg",
  ]

  for (const logoName of possibleLogoPaths) {
    try {
      const logoPath = path.join(process.cwd(), "public", logoName)
      if (fs.existsSync(logoPath)) {
        const img = fs.readFileSync(logoPath)
        if (logoName.endsWith(".png")) {
          const base64 = `data:image/png;base64,${img.toString("base64")}`
          doc.addImage(base64, "PNG", margin, y, logoSize, logoSize)
          logoLoaded = true
          break
        }
        // SVG может не работать напрямую в jsPDF, но попробуем
        else if (logoName.endsWith(".svg")) {
          try {
            const base64 = `data:image/svg+xml;base64,${img.toString("base64")}`
            doc.addImage(base64, "SVG", margin, y, logoSize, logoSize)
            logoLoaded = true
            break
          } catch {
            // SVG не поддерживается, продолжаем поиск
          }
        }
      }
    } catch (e) {
      // Продолжаем поиск следующего файла
    }
  }

  // Если логотип не найден, используем fallback - синий квадрат
  if (!logoLoaded) {
    doc.setFillColor(...blue.map((c) => c * 255))
    doc.rect(margin, y, logoSize, logoSize, "F")
  }

  doc.setFontSize(8)
  doc.setFont(FONT, "normal")
  doc.setTextColor(80, 80, 80)
  doc.text(
    "Белорусский государственный университет информатики и радиоэлектроники",
    margin + logoSize + 3,
    y + logoSize / 2,
    { align: "left", baseline: "middle" },
  )
}

/**
 * Генерация PDF‑отчёта в формате справки БГУИР (финальная версия, Сценарий Б).
 * Для черновика выдаётся упрощённый отчёт без QR‑кодов и верификации.
 */
export async function generatePDFReport(result: CheckResultForReport): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  doc.setProperties({
    title: "Справка о результатах проверки на заимствования",
    creator: "БГУИР.ПЛАГИАТ",
    producer: "БГУИР.ПЛАГИАТ",
  })
  loadDejaVuFonts(doc)
  doc.setFont(FONT, "normal")

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const isFinal = result.status === "final" && result.documentId
  const baseUrl = (result.baseUrl || "").replace(/\/$/, "")

  let y = margin

  // ——— Блок 1: Идентификация (шапка) ———
  y = drawHeaderBlock(doc, margin, pageWidth)
  // Небольшой дополнительный отступ между шапкой и заголовком "Справка"
  y += 4

  doc.setFontSize(16)
  doc.setFont(FONT, "bold")
  doc.setTextColor(0, 0, 0)
  doc.text("Справка", margin, y)
  y += 7
  doc.setFontSize(11)
  doc.setFont(FONT, "normal")
  doc.text("о результатах проверки текстового документа на наличие заимствований", margin, y)
  y += 8

  if (isFinal) {
    doc.setFontSize(9)
    doc.setFont(FONT, "bold")
    doc.text("ПРОВЕРКА ВЫПОЛНЕНА В СИСТЕМЕ БГУИР.ПЛАГИАТ", margin, y)
    y += 6
  }

  doc.setFontSize(10)
  doc.setFont(FONT, "normal")
  doc.text(`ФИО: ${result.author || "—"}`, margin, y)
  y += 6
  doc.text(`Тип работы: ${categoryLabel(result.category)}`, margin, y)
  y += 6
  doc.text(`Название работы: ${result.title || result.filename || "—"}`, margin, y, { maxWidth: pageWidth - 2 * margin })
  y += 6
  doc.text(`Дата проверки: ${formatDate(result.uploadDate)}`, margin, y)
  y += 8
  
  // Размещаем подписи на разных строках, чтобы не накладывались
  doc.text("Работу проверил(а): ___________________________", margin, y)
  y += 6
  doc.text("Подпись проверяющегося: ___________________________", margin, y)
  y += 10

  // ——— Блок 2: Результаты ———
  const matchesPercent = Math.round((100 - result.uniquenessPercent) * 100) / 100
  const origPercent = Math.round(result.uniquenessPercent * 100) / 100

  doc.setFontSize(11)
  doc.setFont(FONT, "bold")
  doc.text("Результаты:", margin, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont(FONT, "normal")
  const barW = 70
  const barH = 5
  const barY = y - 3
  const gray = [230, 230, 230]

  doc.setFillColor(gray[0], gray[1], gray[2])
  doc.rect(margin, barY, barW, barH, "F")
  doc.setFillColor(255, 165, 0)
  doc.rect(margin, barY, barW * (matchesPercent / 100), barH, "F")
  doc.setDrawColor(200, 200, 200)
  doc.rect(margin, barY, barW, barH, "S")
  doc.text(`Совпадения ${formatPercent(matchesPercent)}%`, margin + barW + 6, y)
  y += 10

  const bar2Y = y - 3
  doc.setFillColor(gray[0], gray[1], gray[2])
  doc.rect(margin, bar2Y, barW, barH, "F")
  doc.setFillColor(56, 115, 209)
  doc.rect(margin, bar2Y, barW * (origPercent / 100), barH, "F")
  doc.setDrawColor(200, 200, 200)
  doc.rect(margin, bar2Y, barW, barH, "S")
  doc.text(`Оригинальность ${formatPercent(origPercent)}%`, margin + barW + 6, y)
  y += 12

  // ——— Блок 3: QR-коды (между результатами и таблицей) ———
  if (isFinal && baseUrl) {
    try {
      const id = result.documentId!
      const sigReport = signDocumentAccess("report", id)
      const sigOriginal = signDocumentAccess("original", id)
      const reportPdfUrl = `${baseUrl}/api/report/${id}/view?sig=${encodeURIComponent(sigReport)}`
      const originalWorkUrl = `${baseUrl}/api/report/${id}/original?sig=${encodeURIComponent(sigOriginal)}`
      const qrSize = 26
      const qrGap = 18
      // Ширина подписи не должна "залезать" под соседний QR:
      // captionW <= qrSize + qrGap - небольшой отступ.
      const captionW = qrSize + qrGap - 8 // 26 + 18 - 8 = 36 мм

      const qr1 = await QRCode.toDataURL(reportPdfUrl, { width: 200, margin: 1 })
      const qr2 = await QRCode.toDataURL(originalWorkUrl, { width: 200, margin: 1 })

      doc.addImage(qr1, "PNG", margin, y, qrSize, qrSize)
      doc.setFontSize(8)
      doc.setFont(FONT, "normal")
      // Текст под QR‑кодами рисуем многострочно, чтобы подписи не наезжали друг на друга.
      const qr1Lines = doc.splitTextToSize(
        "Для просмотра PDF-отчёта (справки) отсканируйте QR-код",
        captionW,
      )
      const qr2Lines = doc.splitTextToSize(
        "Для просмотра оригинальной работы (загруженный документ) отсканируйте QR-код",
        captionW,
      )
      const qrTextY = y + qrSize + 4
      const lineHeight = 4 // мм при размере шрифта 8

      doc.text(qr1Lines, margin, qrTextY, { maxWidth: captionW })

      doc.addImage(qr2, "PNG", margin + qrSize + qrGap, y, qrSize, qrSize)
      doc.text(qr2Lines, margin + qrSize + qrGap, qrTextY, { maxWidth: captionW })

      const maxLines = Math.max(qr1Lines.length, qr2Lines.length)
      const textBlockHeight = maxLines * lineHeight

      // Высота QR (26) + отступ (4) + высота текста + дополнительный зазор до следующего блока
      y = qrTextY + textBlockHeight + 8
    } catch (e) {
      console.error("Error generating QR codes:", e)
    }
  } else if (!isFinal) {
    doc.setFontSize(9)
    doc.setFont(FONT, "normal")
    doc.setTextColor(200, 120, 0)
    doc.text(
      "⚠ Черновая версия. Официальная справка с QR-кодами доступна только для финальной версии (Сценарий Б).",
      margin,
      y,
      { maxWidth: pageWidth - 2 * margin },
    )
    doc.setTextColor(0, 0, 0)
    y += 10
  }

  // ——— Блок 4: Таблица «Источники» (под QR-кодами) ———
  const sources = (result.similarDocuments || []).filter((s) => s.similarity > 0)
  if (y > pageHeight - 70) {
    doc.addPage()
    y = margin
  }
  doc.setFontSize(11)
  doc.setFont(FONT, "bold")
  doc.text("Источники", margin, y)
  y += 8

  const colNo = 12
  const colAuthors = 28
  const colShare = 20
  const colSource = pageWidth - margin - colNo - colAuthors - colShare - 6
  const rowH = 7
  const headY = y

  doc.setFontSize(9)
  doc.setFont(FONT, "bold")
  doc.rect(margin, headY - 5, colNo, rowH, "S")
  doc.text("№", margin + colNo / 2, headY + 0.5, { align: "center" })
  doc.rect(margin + colNo, headY - 5, colAuthors, rowH, "S")
  doc.text("Авторы", margin + colNo + colAuthors / 2, headY + 0.5, { align: "center" })
  doc.rect(margin + colNo + colAuthors, headY - 5, colShare, rowH, "S")
  doc.text("Доля", margin + colNo + colAuthors + colShare / 2, headY + 0.5, { align: "center" })
  doc.rect(margin + colNo + colAuthors + colShare, headY - 5, colSource, rowH, "S")
  doc.text("Источник", margin + colNo + colAuthors + colShare + colSource / 2, headY + 0.5, { align: "center" })
  y += rowH + 2

  doc.setFont(FONT, "normal")
  if (sources.length > 0) {
    sources.forEach((s, idx) => {
      if (y > pageHeight - 25) {
        doc.addPage()
        y = margin
      }
      const rowY = y - 4
      doc.rect(margin, rowY, colNo, rowH, "S")
      doc.text(String(idx + 1), margin + colNo / 2, y + 0.5, { align: "center" })
      doc.rect(margin + colNo, rowY, colAuthors, rowH, "S")
      doc.text((s.userId ?? "—").slice(0, 14), margin + colNo + 2, y + 0.5)
      doc.rect(margin + colNo + colAuthors, rowY, colShare, rowH, "S")
      doc.text(formatPercent(s.similarity), margin + colNo + colAuthors + colShare / 2, y + 0.5, { align: "center" })
      doc.rect(margin + colNo + colAuthors + colShare, rowY, colSource, rowH, "S")
      const title = (s.title || "—").slice(0, 55)
      doc.text(title, margin + colNo + colAuthors + colShare + 2, y + 0.5)
      y += rowH + 2
    })
  } else {
    const rowY = y - 4
    doc.rect(margin, rowY, colNo, rowH, "S")
    doc.text("1", margin + colNo / 2, y + 0.5, { align: "center" })
    doc.rect(margin + colNo, rowY, colAuthors, rowH, "S")
    doc.text("—", margin + colNo + 2, y + 0.5)
    doc.rect(margin + colNo + colAuthors, rowY, colShare, rowH, "S")
    doc.text("—", margin + colNo + colAuthors + colShare / 2, y + 0.5, { align: "center" })
    doc.rect(margin + colNo + colAuthors + colShare, rowY, colSource, rowH, "S")
    doc.text("Совпадений не найдено", margin + colNo + colAuthors + colShare + 2, y + 0.5)
    y += rowH + 2
  }
  y += 6

  // Футер на всех страницах
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooterBlock(doc, pageWidth, pageHeight, margin)
    doc.setFontSize(8)
    doc.setFont(FONT, "normal")
    doc.setTextColor(128, 128, 128)
    doc.text(
      `БГУИР.ПЛАГИАТ — Стр. ${i} из ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    )
  }

  return doc.output("arraybuffer") as unknown as Uint8Array
}
