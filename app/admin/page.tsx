"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Upload,
  Trash2,
  FileText,
  Users,
  Database,
  Search,
  Plus,
  File,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Eye,
  Calendar,
  User,
  X,
  GraduationCap,
  BookOpen,
  FileEdit,
  Newspaper,
  FolderDot,
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
import { FileUpload } from "@/components/file-upload"
import { getSession, hasRole } from "@/lib/auth"
import type { ParsedFile } from "@/lib/file-parser"
import { BsuirLogo } from "@/components/bsuir-logo"

interface DocumentSummary {
  id: number
  title: string
  author: string | null
  filename: string | null
  filePath: string | null
  wordCount: number
  uploadDate: string
  category: string
  status?: "draft" | "final"
}

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  diploma: "Дипломные работы",
  "Дипломная работа": "Дипломные работы",
  coursework: "Курсовые работы / Проекты",
  "Курсовая работа": "Курсовые работы / Проекты",
  "Курсовая работа / Проект": "Курсовые работы / Проекты",
  lab: "Лабораторные работы",
  "Лабораторная работа": "Лабораторные работы",
  practice: "Практические задания",
  "Практическое задание": "Практические задания",
  uncategorized: "Без категории",
}

const categoryIcons: Record<string, typeof GraduationCap> = {
  diploma: GraduationCap,
  "Дипломная работа": GraduationCap,
  coursework: BookOpen,
  "Курсовая работа": BookOpen,
  "Курсовая работа / Проект": BookOpen,
  lab: FileEdit,
  "Лабораторная работа": FileEdit,
  practice: Newspaper,
  "Практическое задание": Newspaper,
  uncategorized: Folder,
  "Студенческие работы": FileText,
}

export default function AdminPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"folders" | "list">("folders")
  const [previewDoc, setPreviewDoc] = useState<DocumentSummary | null>(null)

  const [newDoc, setNewDoc] = useState({
    title: "",
    author: "",
    category: "coursework",
    status: "final" as "draft" | "final",
  })
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [documentTypes, setDocumentTypes] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    fetch("/api/document-types")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.types)) setDocumentTypes(data.types)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const user = getSession()
    if (!user || (!hasRole(user, "teacher") && !hasRole(user, "admin") && !hasRole(user, "superadmin"))) {
      router.push("/login")
      return
    }
  }, [router])

  const categoryLabels: Record<string, string> =
    documentTypes.length > 0
      ? { ...DEFAULT_CATEGORY_LABELS, ...Object.fromEntries(documentTypes.map((t) => [t.id, t.label])) }
      : DEFAULT_CATEGORY_LABELS

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents")
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error("Error fetching documents:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleFileProcessed = (result: ParsedFile, file: File) => {
    setParsedFile(result)
    setOriginalFile(file)
    setUploadError(null)
    setUploadSuccess(null)
    if (!newDoc.title) {
      const nameWithoutExt = result.filename.replace(/\.[^/.]+$/, "")
      setNewDoc((prev) => ({ ...prev, title: nameWithoutExt }))
    }
  }

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDoc.title.trim() || !parsedFile || !originalFile) return

    setIsSubmitting(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", originalFile)
      formData.append("title", newDoc.title)
      formData.append("author", newDoc.author || "")
      formData.append("category", newDoc.category)
      formData.append("status", newDoc.status)
      formData.append("content", parsedFile.text)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        setUploadSuccess(`Файл сохранен: ${data.document.filePath}`)
        setNewDoc({ title: "", author: "", category: "coursework", status: "final" })
        setParsedFile(null)
        setOriginalFile(null)
        setIsAddDialogOpen(false)
        fetchDocuments()
      } else {
        setUploadError(data.error || "Ошибка при загрузке")
      }
    } catch (error) {
      console.error("Error adding document:", error)
      setUploadError("Ошибка соединения с сервером")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDocument = async (id: number) => {
    if (!confirm("Вы уверены? Файл будет удален с диска.")) return

    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        fetchDocuments()
      }
    } catch (error) {
      console.error("Error deleting document:", error)
    }
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const filteredDocuments = documents.filter(
    (doc) =>
      (doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.author && doc.author.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.filename && doc.filename.toLowerCase().includes(searchQuery.toLowerCase()))) &&
      (selectedCategory === null || doc.category === selectedCategory),
  )

  const documentsByCategory = filteredDocuments.reduce(
    (acc, doc) => {
      const cat = doc.category || "uncategorized"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(doc)
      return acc
    },
    {} as Record<string, DocumentSummary[]>,
  )

  const resetDialog = () => {
    setNewDoc({ title: "", author: "", category: "coursework", status: "final" })
    setParsedFile(null)
    setOriginalFile(null)
    setUploadError(null)
    setUploadSuccess(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Title */}
      <div className="container mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Административная панель</h1>
          <p className="text-muted-foreground">Управление базой документов для проверки на плагиат</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push("/admin/users")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Пользователи
              </CardTitle>
              <CardDescription>Управление учетными записями</CardDescription>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push("/admin/storage")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Локальное хранилище
              </CardTitle>
              <CardDescription>Управление оригинальными документами</CardDescription>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push("/admin/statistics")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Статистика и отчеты
              </CardTitle>
              <CardDescription>Анализ данных и визуализация</CardDescription>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push("/admin/logs")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Журналы ошибок
              </CardTitle>
              <CardDescription>Мониторинг системы</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      <main className="container mx-auto px-4 pb-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Всего документов</CardTitle>
              <Database className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{documents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">в базе данных</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Авторов</CardTitle>
              <Users className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-500">
                {new Set(documents.map((d) => d.author).filter(Boolean)).size}
              </div>
              <p className="text-xs text-muted-foreground mt-1">уникальных</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Общий объем</CardTitle>
              <FileText className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">
                {documents
                  .reduce((sum, d) => sum + (typeof d.wordCount === "number" ? d.wordCount : 0), 0)
                  .toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">слов</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  Поиск работ
                </CardTitle>
                <CardDescription>Управление базой документов для проверки на плагиат</CardDescription>
              </div>
              <Dialog
                open={isAddDialogOpen}
                onOpenChange={(open) => {
                  setIsAddDialogOpen(open)
                  if (!open) resetDialog()
                }}
              >
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Загрузить файл
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Загрузить документ в базу</DialogTitle>
                    <DialogDescription>PDF/DOCX файл будет сохранен локально в проекте</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddDocument} className="space-y-4 mt-4 overflow-hidden">
                    <FileUpload
                      onFileProcessed={handleFileProcessed}
                      onError={setUploadError}
                      disabled={isSubmitting}
                    />

                    {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
                    {uploadSuccess && <p className="text-sm text-green-600">{uploadSuccess}</p>}

                    {parsedFile && (
                      <div className="p-3 bg-muted rounded-lg flex items-center gap-3 overflow-hidden">
                        <File className="h-5 w-5 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="font-medium text-sm truncate" title={parsedFile.filename}>
                            {parsedFile.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {parsedFile.wordCount.toLocaleString()} слов | {parsedFile.fileType.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">Название работы *</Label>
                        <Input
                          id="title"
                          placeholder="Введите название"
                          value={newDoc.title}
                          onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="author">Автор</Label>
                        <Input
                          id="author"
                          placeholder="ФИО автора"
                          value={newDoc.author}
                          onChange={(e) => setNewDoc({ ...newDoc, author: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Категория</Label>
                      <Select
                        value={newDoc.category}
                        onValueChange={(value) => setNewDoc({ ...newDoc, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(documentTypes.length ? documentTypes : [
                            { id: "diploma", label: "Дипломная работа" },
                            { id: "coursework", label: "Курсовая работа / Проект" },
                            { id: "lab", label: "Лабораторная работа" },
                            { id: "practice", label: "Практическое задание" },
                          ]).map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Версия документа</Label>
                      <Select
                        value={newDoc.status}
                        onValueChange={(value: "draft" | "final") => setNewDoc({ ...newDoc, status: value })}
                      >
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="final">Финальная (хранится всегда)</SelectItem>
                          <SelectItem value="draft">Черновая (удаляется через 24 ч)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                        className="bg-transparent"
                      >
                        Отмена
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting || !parsedFile || !newDoc.title.trim()}
                        className="gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {isSubmitting ? "Сохранение..." : "Сохранить в базу"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search Bar */}
            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по названию, автору или файлу..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-background">
                    <Folder className="h-4 w-4" />
                    <span className="text-sm font-medium">Папки</span>
                  </div>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Фильтр:</span>
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                >
                  Все ({documents.length})
                </Button>
                {Object.entries(categoryLabels).map(([key, label]) => {
                  const count = documents.filter((d) => d.category === key).length
                  if (count === 0) return null
                  const IconComponent = categoryIcons[key]
                  return (
                    <Button
                      key={key}
                      variant={selectedCategory === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(key)}
                      className="gap-2"
                    >
                      <IconComponent className="h-4 w-4" /> {label} ({count})
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || selectedCategory ? "Документы не найдены" : "База пуста. Загрузите первый документ."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(documentsByCategory).map(([category, docs]) => {
                  const IconComponent = categoryIcons[category] || Folder
                  return (
                    <div key={category} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                      >
                        {expandedCategories.has(category) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="flex items-center gap-3 flex-1">
                          <IconComponent className="h-6 w-6 text-foreground" />
                          <div className="text-left">
                            <p className="font-semibold">{categoryLabels[category] || category}</p>
                            <p className="text-sm text-muted-foreground">{docs.length} документов</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{docs.length}</Badge>
                      </button>

                      {expandedCategories.has(category) && (
                        <div className="border-t bg-muted/20">
                          <div className="divide-y">
                            {docs.map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                              >
                                <File className="h-8 w-8 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{doc.title}</p>
                                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                    {doc.author && (
                                      <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {doc.author}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <FileText className="h-3 w-3" />
                                      {(doc.wordCount ?? 0).toLocaleString()} слов
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(doc.uploadDate).toLocaleDateString("ru-RU")}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPreviewDoc(doc)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteDocument(doc.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{previewDoc?.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-4 mt-2">
                {previewDoc?.author && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {previewDoc.author}
                  </span>
                )}
                <Badge variant="secondary">{categoryLabels[previewDoc?.category || ""] || previewDoc?.category}</Badge>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {(previewDoc?.wordCount ?? 0).toLocaleString()} слов
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Имя файла:</span>
                    <p className="font-mono text-xs mt-1">{previewDoc?.filename}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Путь:</span>
                    <p className="font-mono text-xs mt-1">{previewDoc?.filePath}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Дата загрузки:</span>
                    <p className="mt-1">{previewDoc && new Date(previewDoc.uploadDate).toLocaleString("ru-RU")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ID документа:</span>
                    <p className="mt-1">#{previewDoc?.id}</p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
