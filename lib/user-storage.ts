/**
 * Хранилище пользователей для системы антиплагиата
 * Хранилище пользователей в SQLite (с импортом из старого JSON при первом запуске).
 */

import type { User, UserRole } from "./auth"
import { getSqlite } from "./sqlite"
import { ensureSqliteSeededFromLocalJson } from "./sqlite-seed"

export interface StoredUser {
  username: string
  password: string // В реальном приложении должен быть хеш
  role: UserRole
  /** Дополнительные роли (админ может выдавать) */
  additionalRoles?: UserRole[]
  email?: string
  fullName?: string
  institution?: string // Учебное заведение (БГУИР по умолчанию)
  createdAt: string
  lastLogin?: string
}

interface UserDatabase {
  users: StoredUser[]
}

function initSqlite() {
  const db = getSqlite()
  ensureSqliteSeededFromLocalJson()
  return db
}

export function readUsersDatabase(): UserDatabase {
  const users = getAllUsers()
  return { users }
}

export function writeUsersDatabase(db: UserDatabase) {
  const sqlite = initSqlite()
  const insert = sqlite.prepare(`
    INSERT OR REPLACE INTO users
      (username, password, role, additional_roles_json, email, full_name, institution, created_at, last_login)
    VALUES
      (@username, @password, @role, @additional_roles_json, @email, @full_name, @institution, @created_at, @last_login)
  `)
  sqlite.transaction(() => {
    for (const u of db.users ?? []) {
      insert.run({
        username: u.username,
        password: u.password,
        role: u.role,
        additional_roles_json: u.additionalRoles ? JSON.stringify(u.additionalRoles) : null,
        email: u.email ?? null,
        full_name: u.fullName ?? null,
        institution: u.institution ?? "БГУИР",
        created_at: u.createdAt ?? new Date().toISOString(),
        last_login: u.lastLogin ?? null,
      })
    }
  })()
}

// Регистрация нового пользователя
export function registerUser(
  username: string,
  password: string,
  role: UserRole = "student",
  email?: string,
  fullName?: string,
  institution?: string,
): { success: boolean; error?: string; user?: User } {
  const sqlite = initSqlite()
  const normalizedUsername = username.trim()

  // Проверка на существующего пользователя
  const existing = sqlite.prepare(`SELECT 1 FROM users WHERE username = ?`).get(normalizedUsername)
  if (existing) {
    return { success: false, error: "Пользователь с таким логином уже существует" }
  }

  // Валидация
  if (normalizedUsername.length < 3) {
    return { success: false, error: "Логин должен содержать минимум 3 символа" }
  }

  if (password.length < 6) {
    return { success: false, error: "Пароль должен содержать минимум 6 символов" }
  }

  // Создание пользователя
  const newUser: StoredUser = {
    username: normalizedUsername,
    password, // В реальном приложении здесь должен быть хеш пароля
    role,
    email,
    fullName,
    institution: institution || "БГУИР", // По умолчанию БГУИР
    createdAt: new Date().toISOString(),
  }

  sqlite
    .prepare(
      `
      INSERT INTO users
        (username, password, role, additional_roles_json, email, full_name, institution, created_at, last_login)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `,
    )
    .run(
      newUser.username,
      newUser.password,
      newUser.role,
      newUser.additionalRoles ? JSON.stringify(newUser.additionalRoles) : null,
      newUser.email ?? null,
      newUser.fullName ?? null,
      newUser.institution ?? "БГУИР",
      newUser.createdAt,
    )

  return {
    success: true,
    user: {
      username: newUser.username,
      role: newUser.role,
      email: newUser.email,
      fullName: newUser.fullName,
      institution: newUser.institution,
    },
  }
}

// Получение пользователя по логину
export function getUserByUsername(username: string): StoredUser | null {
  const sqlite = initSqlite()
  const row = sqlite.prepare(`SELECT * FROM users WHERE username = ?`).get(username.trim()) as any
  if (!row) return null
  return {
    username: row.username,
    password: row.password,
    role: row.role,
    additionalRoles: row.additional_roles_json ? JSON.parse(row.additional_roles_json) : [],
    email: row.email ?? undefined,
    fullName: row.full_name ?? undefined,
    institution: row.institution ?? undefined,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? undefined,
  }
}

// Обновление последнего входа
export function updateLastLogin(username: string) {
  const sqlite = initSqlite()
  sqlite.prepare(`UPDATE users SET last_login = ? WHERE username = ?`).run(new Date().toISOString(), username.trim())
}

// Получение всех пользователей (для админов)
export function getAllUsers(): StoredUser[] {
  const sqlite = initSqlite()
  const rows = sqlite.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all() as any[]
  return rows.map((row) => ({
    username: row.username,
    password: row.password,
    role: row.role,
    additionalRoles: row.additional_roles_json ? JSON.parse(row.additional_roles_json) : [],
    email: row.email ?? undefined,
    fullName: row.full_name ?? undefined,
    institution: row.institution ?? undefined,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? undefined,
  }))
}

// Удаление пользователя (для админов)
export function deleteUser(username: string): boolean {
  const sqlite = initSqlite()
  const info = sqlite.prepare(`DELETE FROM users WHERE username = ?`).run(username.trim())
  return info.changes > 0
}

// Обновление роли пользователя (для админов)
export function updateUserRole(username: string, role: UserRole): boolean {
  const sqlite = initSqlite()
  const info = sqlite.prepare(`UPDATE users SET role = ? WHERE username = ?`).run(role, username.trim())
  return info.changes > 0
}

// Обновление дополнительных ролей пользователя (для админов)
export function updateUserAdditionalRoles(username: string, additionalRoles: UserRole[]): boolean {
  const sqlite = initSqlite()
  const roles = additionalRoles?.filter(Boolean) ?? []
  const info = sqlite
    .prepare(`UPDATE users SET additional_roles_json = ? WHERE username = ?`)
    .run(JSON.stringify(roles), username.trim())
  return info.changes > 0
}

