/**
 * Хранилище пользователей для системы антиплагиата
 * Локальное хранилище пользователей в JSON файле
 */

import fs from "fs"
import path from "path"
import type { User, UserRole } from "./auth"

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

const DATA_DIR = path.join(process.cwd(), "data")
const USERS_FILE = path.join(DATA_DIR, "users.json")

// Инициализация
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(USERS_FILE)) {
    const initialDb: UserDatabase = { users: [] }
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialDb, null, 2), "utf-8")
  }
}

export function readUsersDatabase(): UserDatabase {
  ensureDirectories()
  const data = fs.readFileSync(USERS_FILE, "utf-8")
  return JSON.parse(data)
}

export function writeUsersDatabase(db: UserDatabase) {
  ensureDirectories()
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2), "utf-8")
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
  const db = readUsersDatabase()

  // Проверка на существующего пользователя
  if (db.users.find((u) => u.username === username)) {
    return { success: false, error: "Пользователь с таким логином уже существует" }
  }

  // Валидация
  if (username.length < 3) {
    return { success: false, error: "Логин должен содержать минимум 3 символа" }
  }

  if (password.length < 6) {
    return { success: false, error: "Пароль должен содержать минимум 6 символов" }
  }

  // Создание пользователя
  const newUser: StoredUser = {
    username,
    password, // В реальном приложении здесь должен быть хеш пароля
    role,
    email,
    fullName,
    institution: institution || "БГУИР", // По умолчанию БГУИР
    createdAt: new Date().toISOString(),
  }

  db.users.push(newUser)
  writeUsersDatabase(db)

  return {
    success: true,
    user: {
      username: newUser.username,
      role: newUser.role,
      email: newUser.email,
      fullName: newUser.fullName,
    },
  }
}

// Получение пользователя по логину
export function getUserByUsername(username: string): StoredUser | null {
  const db = readUsersDatabase()
  return db.users.find((u) => u.username === username) || null
}

// Обновление последнего входа
export function updateLastLogin(username: string) {
  const db = readUsersDatabase()
  const user = db.users.find((u) => u.username === username)
  if (user) {
    user.lastLogin = new Date().toISOString()
    writeUsersDatabase(db)
  }
}

// Получение всех пользователей (для админов)
export function getAllUsers(): StoredUser[] {
  const db = readUsersDatabase()
  return db.users
}

// Удаление пользователя (для админов)
export function deleteUser(username: string): boolean {
  const db = readUsersDatabase()
  const index = db.users.findIndex((u) => u.username === username)
  if (index === -1) return false

  db.users.splice(index, 1)
  writeUsersDatabase(db)
  return true
}

// Обновление роли пользователя (для админов)
export function updateUserRole(username: string, role: UserRole): boolean {
  const db = readUsersDatabase()
  const user = db.users.find((u) => u.username === username)
  if (!user) return false

  user.role = role
  writeUsersDatabase(db)
  return true
}

// Обновление дополнительных ролей пользователя (для админов)
export function updateUserAdditionalRoles(username: string, additionalRoles: UserRole[]): boolean {
  const db = readUsersDatabase()
  const user = db.users.find((u) => u.username === username)
  if (!user) return false

  user.additionalRoles = additionalRoles?.filter(Boolean) ?? []
  writeUsersDatabase(db)
  return true
}

