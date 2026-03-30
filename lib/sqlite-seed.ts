import fs from "fs"
import path from "path"
import { getSqlite } from "./sqlite"

type JsonUserDb = { users: any[] }
type JsonCategoryDb = { documents: any[] }

const DATA_DIR = path.join(process.cwd(), "data")

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function listCategoryDocumentFiles(): Array<{ category: string; filePath: string }> {
  if (!fs.existsSync(DATA_DIR)) return []
  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true })
  const out: Array<{ category: string; filePath: string }> = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const name = e.name
    if (name.startsWith("_") || name === "reports" || name === "uploads") continue
    const fp = path.join(DATA_DIR, name, "documents.json")
    if (fs.existsSync(fp)) out.push({ category: name, filePath: fp })
  }
  return out
}

function normalizeCategory(cat: string): string {
  return cat.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_").trim() || "uncategorized"
}

export function ensureSqliteSeededFromLocalJson() {
  const db = getSqlite()

  const documentsCount = db.prepare("SELECT COUNT(1) AS c FROM documents").get() as { c: number }
  const usersCount = db.prepare("SELECT COUNT(1) AS c FROM users").get() as { c: number }

  // Seed only when both tables are empty (first run)
  if ((documentsCount?.c ?? 0) > 0 || (usersCount?.c ?? 0) > 0) return

  const usersJsonPath = path.join(DATA_DIR, "users.json")
  const usersDb = readJsonIfExists<JsonUserDb>(usersJsonPath)

  const categoryFiles = listCategoryDocumentFiles()

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (username, password, role, additional_roles_json, email, full_name, institution, created_at, last_login)
    VALUES
      (@username, @password, @role, @additional_roles_json, @email, @full_name, @institution, @created_at, @last_login)
  `)

  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO documents
      (id, title, author, filename, file_path, content, word_count, upload_date, category, status, user_id, institution, minhash_signature_json, shingle_count, originality_percent)
    VALUES
      (@id, @title, @author, @filename, @file_path, @content, @word_count, @upload_date, @category, @status, @user_id, @institution, @minhash_signature_json, @shingle_count, @originality_percent)
  `)

  db.transaction(() => {
    // Users
    for (const u of usersDb?.users ?? []) {
      insertUser.run({
        username: String(u.username ?? "").trim(),
        password: String(u.password ?? ""),
        role: String(u.role ?? "student"),
        additional_roles_json: u.additionalRoles ? JSON.stringify(u.additionalRoles) : null,
        email: u.email ?? null,
        full_name: u.fullName ?? null,
        institution: u.institution ?? null,
        created_at: u.createdAt ?? new Date().toISOString(),
        last_login: u.lastLogin ?? null,
      })
    }

    // Documents
    for (const { category, filePath } of categoryFiles) {
      const json = readJsonIfExists<JsonCategoryDb>(filePath)
      for (const d of json?.documents ?? []) {
        const cat = normalizeCategory(String(d.category ?? category))
        const minhash = Array.isArray(d.minhashSignature) ? d.minhashSignature : []
        insertDoc.run({
          id: typeof d.id === "number" ? d.id : Number.parseInt(String(d.id), 10),
          title: String(d.title ?? ""),
          author: d.author ?? null,
          filename: d.filename ?? null,
          file_path: d.filePath ?? null,
          content: String(d.content ?? ""),
          word_count:
            typeof d.wordCount === "number"
              ? d.wordCount
              : String(d.content ?? "")
                  .split(/\s+/)
                  .filter((w: string) => w.length > 0).length,
          upload_date: d.uploadDate ?? new Date().toISOString(),
          category: cat,
          status: d.status ?? "draft",
          user_id: d.userId ?? null,
          institution: d.institution ?? null,
          minhash_signature_json: JSON.stringify(minhash),
          shingle_count: typeof d.shingleCount === "number" ? d.shingleCount : 0,
          originality_percent: typeof d.originalityPercent === "number" ? d.originalityPercent : null,
        })
      }
    }
  })()
}

