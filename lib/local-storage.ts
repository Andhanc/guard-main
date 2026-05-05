/**
 * Локальное файловое хранилище для системы антиплагиата.
 * Файлы uploads и PDF отчёты хранятся на диске как раньше,
 * а метаданные/контент документов теперь лежат в SQLite.
 */

import fs from "fs"
import path from "path"
import { prisma } from "./prisma"
import { ensureSqliteSeededFromLocalJson } from "./sqlite-seed"

// Типы
export type DocumentStatus = "draft" | "final"

export interface StoredDocument {
  id: number
  title: string
  author: string | null
  filename: string | null
  documentType?: "word" | "pdf"
  filePath: string | null
  content: string
  wordCount: number
  uploadDate: string
  category: string
  status: DocumentStatus
  userId?: string
  institution?: string
  minhashSignature: number[]
  shingleCount: number
  originalityPercent?: number
  /** Векторный плагиат (Python / Qdrant), % */
  plagiarismPercentMl?: number
  /** Оценка AI-признаков (Python), % */
  aiPercentMl?: number
  processingTimeMs?: number
}

const DATA_DIR = path.join(process.cwd(), "data")
const REPORTS_DIR = path.join(DATA_DIR, "reports")
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

function safeCategoryDir(category: string): string {
  const safe = category.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"
  return path.join(DATA_DIR, safe)
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function ensureCategoryDirs(category: string) {
  ensureDataDir()
  const dir = safeCategoryDir(category)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const uploads = path.join(dir, "uploads")
  if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true })
}

async function initDb() {
  await ensureSqliteSeededFromLocalJson()
  return prisma
}

function mapRowToStoredDocument(row: any): StoredDocument {
  const docType = row.documentType === "pdf" || row.documentType === "word" ? row.documentType : undefined
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? null,
    filename: row.filename ?? null,
    documentType: docType,
    filePath: row.filePath ?? null,
    content: row.content,
    wordCount: row.wordCount,
    uploadDate: row.uploadDate instanceof Date ? row.uploadDate.toISOString() : row.uploadDate,
    category: row.category,
    status: row.status,
    userId: row.userId ?? undefined,
    institution: row.institution ?? undefined,
    minhashSignature: row.minhashSignatureJson ? JSON.parse(row.minhashSignatureJson) : [],
    shingleCount: row.shingleCount ?? 0,
    originalityPercent: typeof row.originalityPercent === "number" ? row.originalityPercent : undefined,
    plagiarismPercentMl:
      typeof row.plagiarismPercentMl === "number" ? row.plagiarismPercentMl : undefined,
    aiPercentMl: typeof row.aiPercentMl === "number" ? row.aiPercentMl : undefined,
    processingTimeMs: typeof row.processingTimeMs === "number" ? row.processingTimeMs : undefined,
  }
}

/** Список категорий, для которых есть папка в data/ */
export async function getStorageCategories(): Promise<string[]> {
  const db = await initDb()
  const rows = await db.document.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  })
  const cats = rows.map((r) => r.category).filter(Boolean)
  return cats.length > 0 ? cats : ["uncategorized"]
}

// Сохранение файла в папку категории
export function saveFileToDisk(
  fileBuffer: Buffer,
  originalFilename: string,
  category: string,
): string {
  ensureCategoryDirs(category)
  const uploadsDir = path.join(safeCategoryDir(category), "uploads")
  const timestamp = Date.now()
  const ext = path.extname(originalFilename)
  const baseName = path.basename(originalFilename, ext)
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_")
  const newFilename = `${timestamp}_${safeBaseName}${ext}`
  const filePath = path.join(uploadsDir, newFilename)
  fs.writeFileSync(filePath, fileBuffer)
  return newFilename
}

// Добавление документа в базу (SQLite). ID — автоинкремент SQLite.
export async function addDocumentToDb(
  title: string,
  content: string,
  minhashSignature: number[],
  shingleCount: number,
  author?: string,
  filename?: string,
  savedFilename?: string,
  category = "uncategorized",
  status: DocumentStatus = "draft",
  userId?: string,
  institution?: string,
  originalityPercent?: number,
  plagiarismPercentMl?: number,
  aiPercentMl?: number,
  processingTimeMs?: number,
  documentType?: "word" | "pdf",
): Promise<StoredDocument> {
  const normCategory = category.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"
  ensureCategoryDirs(normCategory)
  const db = await initDb()
  const relativeFilePath = savedFilename ? `data/${normCategory}/uploads/${savedFilename}` : null
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length
  const uploadDate = new Date().toISOString()

  const created = await db.document.create({
    data: {
      title,
      author: author || null,
      filename: filename || null,
      documentType: documentType ?? null,
      filePath: relativeFilePath,
      content,
      wordCount,
      uploadDate: new Date(uploadDate),
      category: normCategory,
      status,
      userId: userId ?? null,
      institution: institution ?? null,
      minhashSignatureJson: JSON.stringify(minhashSignature ?? []),
      shingleCount: shingleCount ?? 0,
      originalityPercent: typeof originalityPercent === "number" ? Math.round(originalityPercent * 100) / 100 : null,
      plagiarismPercentMl: typeof plagiarismPercentMl === "number" ? plagiarismPercentMl : null,
      aiPercentMl: typeof aiPercentMl === "number" ? aiPercentMl : null,
      processingTimeMs: typeof processingTimeMs === "number" ? Math.max(0, Math.round(processingTimeMs)) : null,
    },
  })
  const id = created.id
  return {
    id,
    title,
    author: author || null,
    filename: filename || null,
    documentType: documentType,
    filePath: relativeFilePath,
    content,
    wordCount,
    uploadDate,
    category: normCategory,
    status,
    userId,
    institution,
    minhashSignature,
    shingleCount,
    originalityPercent,
    plagiarismPercentMl: plagiarismPercentMl,
    aiPercentMl: aiPercentMl,
    processingTimeMs: processingTimeMs,
  }
}

async function filterDraftTtlAndCleanup(documents: StoredDocument[], category: string): Promise<StoredDocument[]> {
  const now = Date.now()
  const kept = documents.filter((doc) => {
    if (doc.status !== "draft") return true
    const uploadTime = new Date(doc.uploadDate).getTime()
    if (now - uploadTime >= DRAFT_TTL_MS) {
      if (doc.filePath) {
        const fullPath = path.join(process.cwd(), doc.filePath)
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath)
          } catch (err) {
            console.error("Error deleting draft file:", err)
          }
        }
      }
      return false
    }
    return true
  })
  if (kept.length !== documents.length) {
    // Persist deletions in SQLite
    const db = await initDb()
    const idsToKeep = new Set(kept.map((d) => d.id))
    const toDelete = documents.filter((d) => d.status === "draft" && !idsToKeep.has(d.id))
    if (toDelete.length > 0) {
      await db.document.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } })
    }
  }
  return kept
}

/**
 * Получение документов из БД. Если передан массив categories — только из этих категорий.
 * Для проверки курсовой/диплома передайте ["coursework", "diploma"].
 */
export async function getAllDocumentsFromDb(
  excludeUserId?: string,
  institution?: string,
  categories?: string[],
): Promise<StoredDocument[]> {
  const db = await initDb()

  const where: any = {}

  if (categories && categories.length > 0) {
    where.category = { in: categories }
  }
  if (excludeUserId) {
    where.OR = [{ userId: null }, { userId: { not: excludeUserId } }]
  }
  if (institution) {
    where.institution = institution
  }
  const rows = await db.document.findMany({
    where,
    orderBy: { uploadDate: "desc" },
  })
  const docs: StoredDocument[] = rows.map(mapRowToStoredDocument)

  // TTL cleanup for drafts
  const catsForCleanup = categories?.length ? categories : await getStorageCategories()
  const byCat = new Map<string, StoredDocument[]>()
  for (const d of docs) {
    if (!byCat.has(d.category)) byCat.set(d.category, [])
    byCat.get(d.category)!.push(d)
  }
  const out: StoredDocument[] = []
  for (const cat of catsForCleanup) {
    const list = byCat.get(cat) ?? []
    out.push(...(await filterDraftTtlAndCleanup(list, cat)))
  }
  return out.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export async function getUserFinalDocuments(userId: string): Promise<StoredDocument[]> {
  const db = await initDb()
  const rows = await db.document.findMany({
    where: { userId, status: "final" },
    orderBy: { uploadDate: "desc" },
  })
  return rows.map(mapRowToStoredDocument)
}

export async function getUserDocuments(userId: string): Promise<StoredDocument[]> {
  const db = await initDb()
  const rows = await db.document.findMany({
    where: { userId },
    orderBy: { uploadDate: "desc" },
  })
  const docs: StoredDocument[] = rows.map(mapRowToStoredDocument)
  const now = Date.now()
  const filtered = docs.filter((d) => d.status === "final" || now - new Date(d.uploadDate).getTime() < DRAFT_TTL_MS)
  // cleanup for expired drafts (and delete their files)
  const byCat = new Map<string, StoredDocument[]>()
  for (const d of filtered) {
    if (!byCat.has(d.category)) byCat.set(d.category, [])
    byCat.get(d.category)!.push(d)
  }
  const out: StoredDocument[] = []
  for (const [cat, list] of byCat.entries()) {
    out.push(...(await filterDraftTtlAndCleanup(list, cat)))
  }
  return out.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export async function getDocumentByIdFromDb(id: number): Promise<StoredDocument | null> {
  const db = await initDb()
  const row = await db.document.findUnique({ where: { id } })
  return row ? mapRowToStoredDocument(row) : null
}

export async function deleteDocumentFromDb(id: number): Promise<boolean> {
  const doc = await getDocumentByIdFromDb(id)
  if (!doc) return false

  if (doc.filePath) {
    const fullPath = path.join(process.cwd(), doc.filePath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }
  const db = await initDb()
  const info = await db.document.deleteMany({ where: { id } })
  return info.count > 0
}

export async function getDocumentCountFromDb(): Promise<number> {
  const db = await initDb()
  return db.document.count()
}

export async function updateDocumentOriginality(documentId: number, originalityPercent: number): Promise<boolean> {
  const db = await initDb()
  const rounded = Math.round(originalityPercent * 100) / 100
  const info = await db.document.updateMany({
    where: { id: documentId },
    data: { originalityPercent: rounded },
  })
  return info.count > 0
}

export async function updateDocumentMlScores(
  documentId: number,
  plagiarismPercentMl: number,
  aiPercentMl: number,
): Promise<boolean> {
  const db = await initDb()
  const p = Math.round(plagiarismPercentMl * 100) / 100
  const a = Math.round(aiPercentMl * 100) / 100
  const info = await db.document.updateMany({
    where: { id: documentId },
    data: { plagiarismPercentMl: p, aiPercentMl: a },
  })
  return info.count > 0
}

export async function updateDocumentStatus(documentId: number, status: DocumentStatus): Promise<boolean> {
  const db = await initDb()
  const info = await db.document.updateMany({ where: { id: documentId }, data: { status } })
  return info.count > 0
}

// ——— Отчёты (PDF) ———

function ensureReportsDir() {
  ensureDataDir()
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true })
}

export function saveReportPdf(
  documentId: number,
  pdfBuffer: Buffer,
  originalityPercent?: number,
): boolean {
  ensureReportsDir()
  const filePath = path.join(REPORTS_DIR, `${documentId}.pdf`)
  try {
    fs.writeFileSync(filePath, pdfBuffer)
    if (originalityPercent !== undefined) {
      void updateDocumentOriginality(documentId, originalityPercent)
    }
    return true
  } catch (err) {
    console.error("Error saving report PDF:", err)
    return false
  }
}

export function getReportPdfPath(documentId: number): string | null {
  const filePath = path.join(REPORTS_DIR, `${documentId}.pdf`)
  return fs.existsSync(filePath) ? filePath : null
}

export function getReportPdfBuffer(documentId: number): Buffer | null {
  const p = getReportPdfPath(documentId)
  if (!p) return null
  try {
    return fs.readFileSync(p)
  } catch {
    return null
  }
}

export function deleteReportPdf(documentId: number): boolean {
  const p = getReportPdfPath(documentId)
  if (!p) return false
  try {
    fs.unlinkSync(p)
    return true
  } catch (err) {
    console.error("Error deleting report PDF:", err)
    return false
  }
}
