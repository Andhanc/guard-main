/**
 * File parser for extracting text from PDF and DOCX files
 * Works in browser environment
 */

import mammoth from "mammoth"

const PDFJS_VERSION = "5.4.394"

let pdfjs: any = null

if (typeof window !== "undefined") {
  import("pdfjs-dist").then((module) => {
    pdfjs = module
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`
  })
}

export interface ParsedFile {
  text: string
  wordCount: number
  filename: string
  fileType: "pdf" | "docx" | "doc"
}

/**
 * Extract text from PDF file
 */
async function parsePDF(file: File): Promise<string> {
  if (!pdfjs) {
    const module = await import("pdfjs-dist")
    pdfjs = module
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const textParts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(" ")
    textParts.push(pageText)
  }

  return textParts.join("\n\n")
}

/**
 * Extract text from DOCX file
 */
async function parseDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * Parse uploaded file and extract text
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const filename = file.name
  const extension = filename.split(".").pop()?.toLowerCase()

  let text: string
  let fileType: "pdf" | "docx" | "doc"

  if (extension === "pdf") {
    text = await parsePDF(file)
    fileType = "pdf"
  } else if (extension === "docx" || extension === "doc") {
    text = await parseDOCX(file)
    fileType = extension as "docx" | "doc"
  } else {
    throw new Error(`Unsupported file type: ${extension}. Please upload PDF or DOCX files.`)
  }

  // Clean up text
  text = text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()

  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length

  return {
    text,
    wordCount,
    filename,
    fileType,
  }
}

/**
 * Validate file before parsing
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 20 * 1024 * 1024 // 20 МБ
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]
  const allowedExtensions = ["pdf", "docx"]

  const extension = file.name.split(".").pop()?.toLowerCase()

  if (!extension || !allowedExtensions.includes(extension)) {
    return { valid: false, error: "Поддерживаются только файлы DOCX и PDF" }
  }

  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(0)
    return { valid: false, error: `Максимальный размер файла — ${maxSizeMB} МБ` }
  }

  return { valid: true }
}
