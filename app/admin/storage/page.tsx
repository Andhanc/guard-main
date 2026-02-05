"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Database,
  Search,
  Trash2,
  Upload,
  FileText,
  Calendar,
  User,
  Download,
  Archive,
  File,
  Loader2,
  FileSearch,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSession } from "@/lib/auth"
import { FileUpload } from "@/components/file-upload"
import type { ParsedFile } from "@/lib/file-parser"

interface DocumentData {
  id: number
  title: string
  author: string | null
  filename: string | null
  category: string
  uploadDate: string
  status: "draft" | "final"
  userId?: string
  institution?: string
  originalityPercent?: number
}

type SortKey = "id" | "title" | "author" | "userId" | "category" | "uploadDate" | "status" | "originalityPercent"
type SortOrder = "asc" | "desc"

export default function StorageManagementPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchAuthor, setSearchAuthor] = useState("")
  const [searchDate, setSearchDate] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [sortBy, setSortBy] = useState<SortKey>("uploadDate")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [metadata, setMetadata] = useState({
    title: "",
    author: "",
    category: "coursework",
  })
  const [documentTypes, setDocumentTypes] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    fetchDocuments()
  }, [])

  useEffect(() => {
    fetch("/api/document-types")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.types)) setDocumentTypes(data.types)
      })
      .catch(() => {})
  }, [])

  const fetchDocuments = async () => {
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
  }

  const handleDeleteDocument = async (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить этот документ из хранилища?")) return

    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        fetchDocuments()
      } else {
        alert(data.error || "Ошибка при удалении документа")
      }
    } catch (error) {
      alert("Ошибка соединения с сервером")
    }
  }

  const resetUploadState = () => {
    setParsedFile(null)
    setOriginalFile(null)
    setUploadError(null)
    setIsSaving(false)
    setMetadata({
      title: "",
      author: "",
      category: "coursework",
    })
  }

  const handleFileProcessed = (file: ParsedFile, original: File) => {
    setParsedFile(file)
    setOriginalFile(original)
    setUploadError(null)
    setMetadata({
      title: file.filename.replace(/\.(pdf|docx|doc)$/i, ""),
      author: "",
      category: "coursework",
    })
  }

  const handleSaveDocument = async () => {
    if (!parsedFile || !originalFile) return

    setIsSaving(true)
    try {
      const user = getSession()

      const formData = new FormData()
      formData.append("file", originalFile)
      formData.append("title", metadata.title || parsedFile.filename)
      formData.append("author", metadata.author || "Без автора")
      formData.append("category", metadata.category)
      formData.append("status", "final")
      formData.append("userId", user?.username || "")
      formData.append("institution", user?.institution || "БГУИР")
      formData.append("content", parsedFile.text)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Ошибка при сохранении документа")
      }

      setUploadDialogOpen(false)
      resetUploadState()
      fetchDocuments()
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Ошибка при сохранении документа")
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchiveUpload = async (file: File) => {
    // TODO: Реализовать распаковку архива и массовую загрузку документов
    alert("Функция загрузки архивов будет реализована в следующей версии")
  }

  const filteredDocuments = documents
    .filter((doc) => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesAuthor = !searchAuthor || (doc.author && doc.author.toLowerCase().includes(searchAuthor.toLowerCase()))
      const matchesDate = !searchDate || doc.uploadDate.startsWith(searchDate)
      const matchesStatus = statusFilter === "all" || doc.status === statusFilter
      return matchesSearch && matchesAuthor && matchesDate && matchesStatus
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case "id":
          cmp = a.id - b.id
          break
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "")
          break
        case "author":
          cmp = (a.author || "").localeCompare(b.author || "")
          break
        case "userId":
          cmp = (a.userId || "").localeCompare(b.userId || "")
          break
        case "category":
          cmp = (a.category || "").localeCompare(b.category || "")
          break
        case "uploadDate":
          cmp = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime()
          break
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "")
          break
        case "originalityPercent": {
          const va = a.originalityPercent ?? -1
          const vb = b.originalityPercent ?? -1
          cmp = va - vb
          break
        }
        default:
          cmp = 0
      }
      return sortOrder === "asc" ? cmp : -cmp
    })

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortOrder("desc")
    }
  }

  const SortHeader = ({ columnKey, children }: { columnKey: SortKey; children: React.ReactNode }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(columnKey)}
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      >
        {children}
        {sortBy === columnKey ? (
          sortOrder === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    </TableHead>
  )

  const categoryLabels: Record<string, string> = documentTypes.length
    ? Object.fromEntries(documentTypes.map((t) => [t.id, t.label]))
    : {
        diploma: "Дипломная работа",
        coursework: "Курсовая работа",
        lab: "Лабораторная работа",
        practice: "Практическое задание",
      }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Локальное хранилище оригиналов</h1>
          <p className="text-muted-foreground">Управление оригинальными документами в базе данных</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Документы в хранилище
                </CardTitle>
                <CardDescription>Всего документов: {documents.length} | Финальных: {documents.filter((d) => d.status === "final").length}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadDialogOpen(true)
                    resetUploadState()
                  }}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Загрузить документ
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по названию..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по ФИО автора..."
                    className="pl-10"
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    className="pl-10"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Label>Статус:</Label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1 border rounded-md"
                >
                  <option value="all">Все</option>
                  <option value="final">Только финальные</option>
                  <option value="draft">Только черновики</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Нет документов в хранилище. Используйте кнопку «Загрузить документ», чтобы добавить первый файл.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader columnKey="id">ID</SortHeader>
                    <SortHeader columnKey="title">Название</SortHeader>
                    <SortHeader columnKey="author">Автор</SortHeader>
                    <SortHeader columnKey="userId">Логин</SortHeader>
                    <SortHeader columnKey="category">Тип работы</SortHeader>
                    <SortHeader columnKey="uploadDate">Дата загрузки</SortHeader>
                    <SortHeader columnKey="originalityPercent">Оригинальность %</SortHeader>
                    <SortHeader columnKey="status">Статус</SortHeader>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-sm">#{doc.id}</TableCell>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell>{doc.author || "-"}</TableCell>
                      <TableCell>{doc.userId || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabels[doc.category] || doc.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {doc.uploadDate
                          ? new Date(doc.uploadDate).toLocaleString("ru-RU", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {doc.originalityPercent !== undefined && doc.originalityPercent !== null ? (
                          <span className="font-medium tabular-nums">
                            {doc.originalityPercent.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={doc.status === "final" ? "default" : "secondary"}>
                          {doc.status === "final" ? "Финальная" : "Черновик"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open)
          if (!open) {
            resetUploadState()
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Загрузка документа в локальное хранилище</DialogTitle>
            <DialogDescription>
              Выберите файл и укажите основную информацию о работе. Документ будет сохранён в локальном хранилище
              оригиналов.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FileUpload
              onFileProcessed={handleFileProcessed}
              onError={(err) => setUploadError(err)}
              disabled={isSaving}
            />

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            {parsedFile && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="title">Название работы *</Label>
                  <Input
                    id="title"
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    placeholder="Введите название работы"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="author">ФИО автора (обучающегося) *</Label>
                  <Input
                    id="author"
                    value={metadata.author}
                    onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                    placeholder="Иванов Иван Иванович"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="category">Тип работы *</Label>
                  <Select
                    value={metadata.category}
                    onValueChange={(value) =>
                      setMetadata({
                        ...metadata,
                        category: value,
                      })
                    }
                  >
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="Выберите тип работы" />
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
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false)
                resetUploadState()
              }}
              className="bg-transparent"
              disabled={isSaving}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSaveDocument}
              disabled={!parsedFile || !metadata.title || !metadata.author || isSaving}
            >
              {isSaving ? "Сохранение..." : "Сохранить в хранилище"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
