/**
 * Локальное файловое хранилище для системы антиплагиата.
 * У каждого типа документа (категории) своя папка и своя БД:
 * data/{category}/documents.json, data/{category}/uploads/
 * Глобальный индекс data/_index.json хранит nextId и idToCategory для поиска документа по id.
 */

import fs from "fs"
import path from "path"

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

interface CategoryDatabase {
  documents: StoredDocument[]
}

interface GlobalIndex {
  nextId: number
  idToCategory: Record<string, string>
}

const DATA_DIR = path.join(process.cwd(), "data")
const REPORTS_DIR = path.join(DATA_DIR, "reports")
const INDEX_FILE = path.join(DATA_DIR, "_index.json")
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

function readGlobalIndex(): GlobalIndex {
  ensureDataDir()
  if (!fs.existsSync(INDEX_FILE)) {
    const initial: GlobalIndex = { nextId: 1, idToCategory: {} }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(initial, null, 2), "utf-8")
    return initial
  }
  const data = fs.readFileSync(INDEX_FILE, "utf-8")
  return JSON.parse(data)
}

function writeGlobalIndex(index: GlobalIndex) {
  ensureDataDir()
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8")
}

function getCategoryDbPath(category: string): string {
  return path.join(safeCategoryDir(category), "documents.json")
}

function readCategoryDatabase(category: string): CategoryDatabase {
  ensureCategoryDirs(category)
  const dbPath = getCategoryDbPath(category)
  if (!fs.existsSync(dbPath)) {
    const initial: CategoryDatabase = { documents: [] }
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), "utf-8")
    return initial
  }
  const data = fs.readFileSync(dbPath, "utf-8")
  return JSON.parse(data)
}

function writeCategoryDatabase(category: string, db: CategoryDatabase) {
  ensureCategoryDirs(category)
  fs.writeFileSync(getCategoryDbPath(category), JSON.stringify(db, null, 2), "utf-8")
}

/** Список категорий, для которых есть папка в data/ */
export function getStorageCategories(): string[] {
  ensureDataDir()
  const names = fs.readdirSync(DATA_DIR, { withFileTypes: true })
  const categories: string[] = []
  for (const e of names) {
    if (!e.isDirectory()) continue
    const name = e.name
    if (name.startsWith("_") || name === "reports" || name === "uploads") continue
    const dbPath = path.join(DATA_DIR, name, "documents.json")
    if (fs.existsSync(dbPath)) categories.push(name)
  }
  return categories.length > 0 ? categories : ["uncategorized"]
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

// Добавление документа в базу категории (глобальный id из _index)
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
  const index = readGlobalIndex()
  const id = index.nextId++
  index.idToCategory[String(id)] = normCategory
  writeGlobalIndex(index)

  const db = readCategoryDatabase(normCategory)
  const relativeFilePath = savedFilename
    ? `data/${normCategory}/uploads/${savedFilename}`
    : null

  const doc: StoredDocument = {
    id,
    title,
    author: author || null,
    filename: filename || null,
    filePath: relativeFilePath,
    content,
    wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
    uploadDate: new Date().toISOString(),
    category: normCategory,
    status,
    userId,
    institution,
    minhashSignature,
    shingleCount,
  }

  db.documents.push(doc)
  writeCategoryDatabase(normCategory, db)
  return doc
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
    const db = readCategoryDatabase(category)
    db.documents = kept
    writeCategoryDatabase(category, db)
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
  const list = categories ?? getStorageCategories()
  const all: StoredDocument[] = []

  for (const cat of list) {
    const db = readCategoryDatabase(cat)
    const afterDraft = filterDraftTtlAndCleanup(db.documents, cat)
    all.push(...afterDraft)
  }

  let filtered = all
  if (excludeUserId) filtered = filtered.filter((doc) => doc.userId !== excludeUserId)
  if (institution) filtered = filtered.filter((doc) => doc.institution === institution)

  return filtered.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getUserFinalDocuments(userId: string): StoredDocument[] {
  const list = getStorageCategories()
  const all: StoredDocument[] = []
  for (const cat of list) {
    const db = readCategoryDatabase(cat)
    all.push(...db.documents.filter((doc) => doc.userId === userId && doc.status === "final"))
  }
  return all.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getUserDocuments(userId: string): StoredDocument[] {
  const list = getStorageCategories()
  const now = Date.now()
  const all: StoredDocument[] = []
  for (const cat of list) {
    const db = readCategoryDatabase(cat)
    for (const doc of db.documents) {
      if (doc.userId !== userId) continue
      if (doc.status === "final") {
        all.push(doc)
        continue
      }
      if (doc.status === "draft") {
        const uploadTime = new Date(doc.uploadDate).getTime()
        if (now - uploadTime < DRAFT_TTL_MS) all.push(doc)
      }
    }
  }
  return all.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getDocumentByIdFromDb(id: number): StoredDocument | null {
  const index = readGlobalIndex()
  const category = index.idToCategory[String(id)]
  if (!category) return null
  const db = readCategoryDatabase(category)
  return db.documents.find((doc) => doc.id === id) || null
}

export function deleteDocumentFromDb(id: number): boolean {
  const index = readGlobalIndex()
  const category = index.idToCategory[String(id)]
  if (!category) return false

  const db = readCategoryDatabase(category)
  const idx = db.documents.findIndex((doc) => doc.id === id)
  if (idx === -1) return false

  const doc = db.documents[idx]
  if (doc.filePath) {
    const fullPath = path.join(process.cwd(), doc.filePath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }

  db.documents.splice(idx, 1)
  writeCategoryDatabase(category, db)
  delete index.idToCategory[String(id)]
  writeGlobalIndex(index)
  return true
}

export function getDocumentCountFromDb(): number {
  const list = getStorageCategories()
  let count = 0
  for (const cat of list) {
    count += readCategoryDatabase(cat).documents.length
  }
  return count
}

export function updateDocumentOriginality(documentId: number, originalityPercent: number): boolean {
  const doc = getDocumentByIdFromDb(documentId)
  if (!doc) return false
  const db = readCategoryDatabase(doc.category)
  const d = db.documents.find((x) => x.id === documentId)
  if (!d) return false
  d.originalityPercent = Math.round(originalityPercent * 100) / 100
  writeCategoryDatabase(doc.category, db)
  return true
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
