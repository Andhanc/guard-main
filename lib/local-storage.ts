/**
 * Локальное файловое хранилище для системы антиплагиата.
 * Файлы uploads и PDF отчёты хранятся на диске как раньше,
 * а метаданные/контент документов теперь лежат в SQLite.
 */

import fs from "fs"
import path from "path"
import { getSqlite } from "./sqlite"
import { ensureSqliteSeededFromLocalJson } from "./sqlite-seed"

// Типы
export type DocumentStatus = "draft" | "final"

export interface StoredDocument {
  id: number
  title: string
  author: string | null
  filename: string | null
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

function initSqlite() {
  const db = getSqlite()
  ensureSqliteSeededFromLocalJson()
  return db
}

function mapRowToStoredDocument(row: any): StoredDocument {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? null,
    filename: row.filename ?? null,
    filePath: row.file_path ?? null,
    content: row.content,
    wordCount: row.word_count,
    uploadDate: row.upload_date,
    category: row.category,
    status: row.status,
    userId: row.user_id ?? undefined,
    institution: row.institution ?? undefined,
    minhashSignature: row.minhash_signature_json ? JSON.parse(row.minhash_signature_json) : [],
    shingleCount: row.shingle_count ?? 0,
    originalityPercent: typeof row.originality_percent === "number" ? row.originality_percent : undefined,
  }
}

/** Список категорий, для которых есть папка в data/ */
export function getStorageCategories(): string[] {
  const db = initSqlite()
  const rows = db.prepare(`SELECT DISTINCT category FROM documents ORDER BY category`).all() as Array<{ category: string }>
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
export function addDocumentToDb(
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
): StoredDocument {
  const normCategory = category.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"
  ensureCategoryDirs(normCategory)
  const db = initSqlite()
  const relativeFilePath = savedFilename ? `data/${normCategory}/uploads/${savedFilename}` : null
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length
  const uploadDate = new Date().toISOString()

  const info = db
    .prepare(
      `
      INSERT INTO documents
        (title, author, filename, file_path, content, word_count, upload_date, category, status, user_id, institution, minhash_signature_json, shingle_count, originality_percent)
      VALUES
        (@title, @author, @filename, @file_path, @content, @word_count, @upload_date, @category, @status, @user_id, @institution, @minhash_signature_json, @shingle_count, NULL)
    `,
    )
    .run({
      title,
      author: author || null,
      filename: filename || null,
      file_path: relativeFilePath,
      content,
      word_count: wordCount,
      upload_date: uploadDate,
      category: normCategory,
      status,
      user_id: userId ?? null,
      institution: institution ?? null,
      minhash_signature_json: JSON.stringify(minhashSignature ?? []),
      shingle_count: shingleCount ?? 0,
    })

  const id = Number(info.lastInsertRowid)
  return {
    id,
    title,
    author: author || null,
    filename: filename || null,
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
  }
}

function filterDraftTtlAndCleanup(documents: StoredDocument[], category: string): StoredDocument[] {
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
    const sqlite = initSqlite()
    const idsToKeep = new Set(kept.map((d) => d.id))
    const toDelete = documents.filter((d) => d.status === "draft" && !idsToKeep.has(d.id))
    const del = sqlite.prepare(`DELETE FROM documents WHERE id = ?`)
    for (const d of toDelete) del.run(d.id)
  }
  return kept
}

/**
 * Получение документов из БД. Если передан массив categories — только из этих категорий.
 * Для проверки курсовой/диплома передайте ["coursework", "diploma"].
 */
export function getAllDocumentsFromDb(
  excludeUserId?: string,
  institution?: string,
  categories?: string[],
): StoredDocument[] {
  const db = initSqlite()

  const where: string[] = []
  const params: any[] = []

  if (categories && categories.length > 0) {
    where.push(`category IN (${categories.map(() => "?").join(",")})`)
    params.push(...categories)
  }
  if (excludeUserId) {
    where.push(`(user_id IS NULL OR user_id <> ?)`)
    params.push(excludeUserId)
  }
  if (institution) {
    where.push(`institution = ?`)
    params.push(institution)
  }

  const sql = `
    SELECT *
    FROM documents
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY upload_date DESC
  `

  const rows = db.prepare(sql).all(...params)
  const docs = rows.map(mapRowToStoredDocument)

  // TTL cleanup for drafts
  const catsForCleanup = categories?.length ? categories : getStorageCategories()
  const byCat = new Map<string, StoredDocument[]>()
  for (const d of docs) {
    if (!byCat.has(d.category)) byCat.set(d.category, [])
    byCat.get(d.category)!.push(d)
  }
  const out: StoredDocument[] = []
  for (const cat of catsForCleanup) {
    const list = byCat.get(cat) ?? []
    out.push(...filterDraftTtlAndCleanup(list, cat))
  }
  return out.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getUserFinalDocuments(userId: string): StoredDocument[] {
  const db = initSqlite()
  const rows = db
    .prepare(
      `
      SELECT * FROM documents
      WHERE user_id = ? AND status = 'final'
      ORDER BY upload_date DESC
    `,
    )
    .all(userId)
  return rows.map(mapRowToStoredDocument)
}

export function getUserDocuments(userId: string): StoredDocument[] {
  const db = initSqlite()
  const rows = db
    .prepare(
      `
      SELECT * FROM documents
      WHERE user_id = ?
      ORDER BY upload_date DESC
    `,
    )
    .all(userId)
  const docs = rows.map(mapRowToStoredDocument)
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
    out.push(...filterDraftTtlAndCleanup(list, cat))
  }
  return out.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getDocumentByIdFromDb(id: number): StoredDocument | null {
  const db = initSqlite()
  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id)
  return row ? mapRowToStoredDocument(row) : null
}

export function deleteDocumentFromDb(id: number): boolean {
  const doc = getDocumentByIdFromDb(id)
  if (!doc) return false

  if (doc.filePath) {
    const fullPath = path.join(process.cwd(), doc.filePath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }
  const db = initSqlite()
  const info = db.prepare(`DELETE FROM documents WHERE id = ?`).run(id)
  return info.changes > 0
}

export function getDocumentCountFromDb(): number {
  const db = initSqlite()
  const row = db.prepare(`SELECT COUNT(1) AS c FROM documents`).get() as { c: number }
  return row?.c ?? 0
}

export function updateDocumentOriginality(documentId: number, originalityPercent: number): boolean {
  const db = initSqlite()
  const rounded = Math.round(originalityPercent * 100) / 100
  const info = db.prepare(`UPDATE documents SET originality_percent = ? WHERE id = ?`).run(rounded, documentId)
  return info.changes > 0
}

export function updateDocumentStatus(documentId: number, status: DocumentStatus): boolean {
  const db = initSqlite()
  const info = db.prepare(`UPDATE documents SET status = ? WHERE id = ?`).run(status, documentId)
  return info.changes > 0
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
      updateDocumentOriginality(documentId, originalityPercent)
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
