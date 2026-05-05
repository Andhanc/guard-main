/**
 * Хранилище пользователей для системы антиплагиата
 * Хранилище пользователей в SQLite (с импортом из старого JSON при первом запуске).
 */

import type { User, UserRole } from "./auth"
import { prisma } from "./prisma"
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

export interface UserDatabase {
  users: StoredUser[]
}

async function initDb() {
  await ensureSqliteSeededFromLocalJson()
  return prisma
}

export async function readUsersDatabase(): Promise<UserDatabase> {
  const users = await getAllUsers()
  return { users }
}

export async function writeUsersDatabase(db: UserDatabase) {
  const client = await initDb()
  await client.$transaction(
    (db.users ?? []).map((u) =>
      client.user.upsert({
        where: { username: u.username },
        update: {
          password: u.password,
          role: u.role,
          additionalRolesJson: u.additionalRoles ? JSON.stringify(u.additionalRoles) : null,
          email: u.email ?? null,
          fullName: u.fullName ?? null,
          institution: u.institution ?? "БГУИР",
          createdAt: new Date(u.createdAt ?? new Date().toISOString()),
          lastLogin: u.lastLogin ? new Date(u.lastLogin) : null,
        },
        create: {
          username: u.username,
          password: u.password,
          role: u.role,
          additionalRolesJson: u.additionalRoles ? JSON.stringify(u.additionalRoles) : null,
          email: u.email ?? null,
          fullName: u.fullName ?? null,
          institution: u.institution ?? "БГУИР",
          createdAt: new Date(u.createdAt ?? new Date().toISOString()),
          lastLogin: u.lastLogin ? new Date(u.lastLogin) : null,
        },
      }),
    ),
  )
}

// Регистрация нового пользователя
export async function registerUser(
  username: string,
  password: string,
  role: UserRole = "student",
  email?: string,
  fullName?: string,
  institution?: string,
): Promise<{ success: boolean; error?: string; user?: User }> {
  const client = await initDb()
  const normalizedUsername = username.trim()

  // Проверка на существующего пользователя
  const existing = await client.user.findUnique({ where: { username: normalizedUsername } })
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

  await client.user.create({
    data: {
      username: newUser.username,
      password: newUser.password,
      role: newUser.role,
      additionalRolesJson: newUser.additionalRoles ? JSON.stringify(newUser.additionalRoles) : null,
      email: newUser.email ?? null,
      fullName: newUser.fullName ?? null,
      institution: newUser.institution ?? "БГУИР",
      createdAt: new Date(newUser.createdAt),
      lastLogin: null,
    },
  })

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
export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  const client = await initDb()
  const row = await client.user.findUnique({ where: { username: username.trim() } })
  if (!row) return null
  return {
    username: row.username,
    password: row.password,
    role: row.role,
    additionalRoles: row.additionalRolesJson ? JSON.parse(row.additionalRolesJson) : [],
    email: row.email ?? undefined,
    fullName: row.fullName ?? undefined,
    institution: row.institution ?? undefined,
    createdAt: row.createdAt.toISOString(),
    lastLogin: row.lastLogin?.toISOString() ?? undefined,
  }
}

// Обновление последнего входа
export async function updateLastLogin(username: string) {
  const client = await initDb()
  await client.user.update({
    where: { username: username.trim() },
    data: { lastLogin: new Date() },
  })
}

// Получение всех пользователей (для админов)
export async function getAllUsers(): Promise<StoredUser[]> {
  const client = await initDb()
  const rows = await client.user.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map((row) => ({
    username: row.username,
    password: row.password,
    role: row.role,
    additionalRoles: row.additionalRolesJson ? JSON.parse(row.additionalRolesJson) : [],
    email: row.email ?? undefined,
    fullName: row.fullName ?? undefined,
    institution: row.institution ?? undefined,
    createdAt: row.createdAt.toISOString(),
    lastLogin: row.lastLogin?.toISOString() ?? undefined,
  }))
}

// Удаление пользователя (для админов)
export async function deleteUser(username: string): Promise<boolean> {
  const client = await initDb()
  const info = await client.user.deleteMany({ where: { username: username.trim() } })
  return info.count > 0
}

// Обновление роли пользователя (для админов)
export async function updateUserRole(username: string, role: UserRole): Promise<boolean> {
  const client = await initDb()
  const info = await client.user.updateMany({ where: { username: username.trim() }, data: { role } })
  return info.count > 0
}

// Обновление дополнительных ролей пользователя (для админов)
export async function updateUserAdditionalRoles(username: string, additionalRoles: UserRole[]): Promise<boolean> {
  const client = await initDb()
  const roles = additionalRoles?.filter(Boolean) ?? []
  const info = await client.user.updateMany({
    where: { username: username.trim() },
    data: { additionalRolesJson: JSON.stringify(roles) },
  })
  return info.count > 0
}

