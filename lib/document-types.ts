/**
 * Типы заданий/документов — настраиваемые админом.
 * Хранятся в data/document-types.json.
 */

import fs from "fs"
import path from "path"

export interface DocumentType {
  id: string
  label: string
}

interface DocumentTypesDatabase {
  types: DocumentType[]
}

const DATA_DIR = path.join(process.cwd(), "data")
const FILE_PATH = path.join(DATA_DIR, "document-types.json")

const DEFAULT_TYPES: DocumentType[] = [
  { id: "diploma", label: "Дипломная работа" },
  { id: "coursework", label: "Курсовая работа / Проект" },
  { id: "lab", label: "Лабораторная работа" },
  { id: "practice", label: "Практическое задание" },
]

function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(FILE_PATH)) {
    const initial: DocumentTypesDatabase = { types: DEFAULT_TYPES }
    fs.writeFileSync(FILE_PATH, JSON.stringify(initial, null, 2), "utf-8")
  }
}

function readDb(): DocumentTypesDatabase {
  ensureFile()
  const data = fs.readFileSync(FILE_PATH, "utf-8")
  try {
    const parsed = JSON.parse(data) as DocumentTypesDatabase
    if (Array.isArray(parsed.types)) return parsed
  } catch {
    // ignore
  }
  return { types: DEFAULT_TYPES }
}

function writeDb(db: DocumentTypesDatabase): void {
  ensureFile()
  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf-8")
}

/** Все типы документов */
export function getDocumentTypes(): DocumentType[] {
  const db = readDb()
  if (db.types.length === 0) return DEFAULT_TYPES
  return db.types
}

/** Добавить тип (id — латиница/цифры, уникальный) */
export function addDocumentType(id: string, label: string): { success: boolean; error?: string } {
  const normalizedId = id.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "")
  if (!normalizedId) return { success: false, error: "Некорректный идентификатор" }
  if (!label.trim()) return { success: false, error: "Название обязательно" }

  const db = readDb()
  if (db.types.some((t) => t.id === normalizedId)) {
    return { success: false, error: "Тип с таким идентификатором уже существует" }
  }

  db.types.push({ id: normalizedId, label: label.trim() })
  writeDb(db)
  return { success: true }
}

/** Обновить тип по id */
export function updateDocumentType(id: string, label: string): { success: boolean; error?: string } {
  if (!label.trim()) return { success: false, error: "Название обязательно" }
  const db = readDb()
  const idx = db.types.findIndex((t) => t.id === id)
  if (idx === -1) return { success: false, error: "Тип не найден" }
  db.types[idx].label = label.trim()
  writeDb(db)
  return { success: true }
}

/** Удалить тип по id */
export function deleteDocumentType(id: string): { success: boolean; error?: string } {
  const db = readDb()
  const idx = db.types.findIndex((t) => t.id === id)
  if (idx === -1) return { success: false, error: "Тип не найден" }
  db.types.splice(idx, 1)
  writeDb(db)
  return { success: true }
}
