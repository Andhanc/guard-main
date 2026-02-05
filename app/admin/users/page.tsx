"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  Download,
  Upload,
  User,
  Mail,
  Building2,
  Shield,
  X,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSession } from "@/lib/auth"
import * as XLSX from "xlsx"

interface UserData {
  username: string
  fullName?: string
  email?: string
  role: string
  additionalRoles?: string[]
  institution?: string
  createdAt: string
  lastLogin?: string
  documentCount?: number
}

export default function UsersManagementPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    role: "student",
    additionalRoles: [] as string[],
    institution: "БГУИР",
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
      }
    } catch (error) {
      console.error("Error fetching users:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (data.success) {
        setIsAddDialogOpen(false)
        setFormData({ username: "", password: "", fullName: "", email: "", role: "student", additionalRoles: [], institution: "БГУИР" })
        fetchUsers()
      } else {
        alert(data.error || "Ошибка при добавлении пользователя")
      }
    } catch (error) {
      alert("Ошибка соединения с сервером")
    }
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: formData.password,
          role: formData.role,
          additionalRoles: formData.additionalRoles,
          email: formData.email,
          fullName: formData.fullName,
          institution: formData.institution,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setIsEditDialogOpen(false)
        setSelectedUser(null)
        fetchUsers()
      } else {
        alert(data.error || "Ошибка при редактировании пользователя")
      }
    } catch (error) {
      alert("Ошибка соединения с сервером")
    }
  }

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Вы уверены, что хотите удалить пользователя ${username}?`)) return

    try {
      const res = await fetch(`/api/admin/users/${username}`, {
        method: "DELETE",
      })

      const data = await res.json()
      if (data.success) {
        fetchUsers()
      } else {
        alert(data.error || "Ошибка при удалении пользователя")
      }
    } catch (error) {
      alert("Ошибка соединения с сервером")
    }
  }

  const handleImportCSV = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text.split("\n").filter((line) => line.trim())
      const headers = lines[0].split(",").map((h) => h.trim())

      // Ожидаемые колонки: ФИО, логин, тип пользователя, учреждение образования, пароль
      const fullNameIdx = headers.findIndex((h) => h.toLowerCase().includes("фио") || h.toLowerCase().includes("fullname"))
      const usernameIdx = headers.findIndex((h) => h.toLowerCase().includes("логин") || h.toLowerCase().includes("username"))
      const roleIdx = headers.findIndex((h) => h.toLowerCase().includes("тип") || h.toLowerCase().includes("role"))
      const institutionIdx = headers.findIndex((h) => h.toLowerCase().includes("учреждение") || h.toLowerCase().includes("institution"))
      const passwordIdx = headers.findIndex((h) => h.toLowerCase().includes("пароль") || h.toLowerCase().includes("password"))

      if (usernameIdx === -1 || passwordIdx === -1) {
        alert("CSV файл должен содержать колонки: логин и пароль")
        return
      }

      let successCount = 0
      let errorCount = 0

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim())
        const userData = {
          username: values[usernameIdx],
          password: values[passwordIdx],
          fullName: fullNameIdx !== -1 ? values[fullNameIdx] : "",
          role: roleIdx !== -1 ? values[roleIdx] : "student",
          institution: institutionIdx !== -1 ? values[institutionIdx] : "БГУИР",
        }

        try {
          const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userData),
          })

          const data = await res.json()
          if (data.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (err) {
          errorCount++
        }
      }

      alert(`Импорт завершен: успешно ${successCount}, ошибок ${errorCount}`)
      fetchUsers()
    } catch (error) {
      alert("Ошибка при импорте CSV файла")
    }
  }

  const roleLabels: Record<string, string> = {
    student: "Студент",
    teacher: "Преподаватель",
    admin: "Администратор",
    superadmin: "Главный администратор",
  }

  const getExportData = () => {
    const headers = ["ФИО", "Логин", "Email", "Тип пользователя", "Учреждение", "Дата создания", "Последний вход"]
    const rows = filteredUsers.map((user) => [
      user.fullName || "",
      user.username,
      user.email || "",
      roleLabels[user.role] || user.role,
      user.institution || "БГУИР",
      new Date(user.createdAt).toLocaleDateString("ru-RU"),
      user.lastLogin ? new Date(user.lastLogin).toLocaleDateString("ru-RU") : "",
    ])
    return { headers, rows }
  }

  const handleExportCSV = () => {
    const { headers, rows } = getExportData()
    const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `users-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleExportXLSX = () => {
    const { headers, rows } = getExportData()
    const wsData = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Пользователи")
    XLSX.writeFile(wb, `users-${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.fullName && user.fullName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesRole = roleFilter === "all" || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Управление пользователями</h1>
          <p className="text-muted-foreground">Просмотр, добавление, редактирование и удаление учетных записей</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Список пользователей
                </CardTitle>
                <CardDescription>Всего пользователей: {users.length}</CardDescription>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Download className="h-4 w-4" />
                      Экспорт
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportCSV}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Экспорт CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportXLSX}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Экспорт XLSX
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Добавить пользователя
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Добавить пользователя</DialogTitle>
                      <DialogDescription>Заполните данные нового пользователя</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddUser} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Логин *</Label>
                        <Input
                          id="username"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Пароль *</Label>
                        <Input
                          id="password"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          minLength={6}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fullName">ФИО</Label>
                        <Input
                          id="fullName"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Тип пользователя *</Label>
                        <Select
                          value={formData.role}
                          onValueChange={(value) => setFormData({ ...formData, role: value })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Студент</SelectItem>
                            <SelectItem value="teacher">Преподаватель</SelectItem>
                            <SelectItem value="admin">Администратор</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="institution">Учреждение образования *</Label>
                        <Input
                          id="institution"
                          value={formData.institution}
                          onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                          Отмена
                        </Button>
                        <Button type="submit">Добавить</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement("input")
                    input.type = "file"
                    input.accept = ".csv,.xlsx,.xlsm"
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (file) handleImportCSV(file)
                    }
                    input.click()
                  }}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Импорт CSV/XLSX
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по логину, ФИО, email..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все роли</SelectItem>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="teacher">Преподаватель</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="superadmin">Главный администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Логин</TableHead>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Учреждение</TableHead>
                    <TableHead>Документов</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.username}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.fullName || "-"}</TableCell>
                      <TableCell>{user.email || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary">{roleLabels[user.role] || user.role}</Badge>
                          {(user.additionalRoles?.length ?? 0) > 0 &&
                            user.additionalRoles!.map((r) => (
                              <Badge key={r} variant="outline" className="text-xs">
                                +{roleLabels[r] || r}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>{user.institution || "БГУИР"}</TableCell>
                      <TableCell>{user.documentCount || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedUser(user)
                              setFormData({
                                username: user.username,
                                password: "",
                                fullName: user.fullName || "",
                                email: user.email || "",
                                role: user.role,
                                additionalRoles: user.additionalRoles ?? [],
                                institution: user.institution || "БГУИР",
                              })
                              setIsEditDialogOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(user.username)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Редактировать пользователя</DialogTitle>
              <DialogDescription>Измените данные пользователя</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditUser} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">Логин</Label>
                <Input id="edit-username" value={formData.username} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Новый пароль (оставьте пустым, чтобы не менять)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fullName">ФИО</Label>
                <Input
                  id="edit-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Тип пользователя (основная роль)</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Студент</SelectItem>
                    <SelectItem value="teacher">Преподаватель</SelectItem>
                    <SelectItem value="admin">Администратор</SelectItem>
                    <SelectItem value="superadmin">Главный администратор</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Дополнительные роли</Label>
                <p className="text-xs text-muted-foreground">Выдайте пользователю дополнительные роли (доступ к разделам)</p>
                <div className="flex flex-wrap gap-4 pt-2">
                  {(["student", "teacher", "admin"] as const).map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.additionalRoles.includes(r)}
                        onCheckedChange={(checked) => {
                          setFormData({
                            ...formData,
                            additionalRoles: checked
                              ? [...formData.additionalRoles, r]
                              : formData.additionalRoles.filter((x) => x !== r),
                          })
                        }}
                      />
                      <span className="text-sm">{roleLabels[r]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-institution">Учреждение образования</Label>
                <Input
                  id="edit-institution"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
