"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  FileSearch,
  LogOut,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  File,
  History,
  Trash2,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileUpload } from "@/components/file-upload"
import { getSession, clearSession, hasRole } from "@/lib/auth"
import { saveCheckResult, getCheckHistory, deleteCheckHistoryItem, type CheckHistoryItem } from "@/lib/student-storage"
import type { ParsedFile } from "@/lib/file-parser"
import { BsuirLogo } from "@/components/bsuir-logo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

interface SimilarDocument {
  id: number
  title: string
  author: string | null
  filename: string | null
  filePath: string | null
  similarity: number
  category: string
}

interface CheckResult {
  uniquenessPercent: number
  totalDocumentsChecked: number
  similarDocuments: SimilarDocument[]
  processingTimeMs: number
  message?: string
}

export default function CheckPage() {
  const router = useRouter()
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<CheckHistoryItem[]>([])

  const [showMetadataDialog, setShowMetadataDialog] = useState(false)
  const [metadata, setMetadata] = useState({
    title: "",
    author: "",
    checker: "",
    category: "coursework",
    status: "final" as "draft" | "final",
  })

  const [userRole, setUserRole] = useState<string | null>(null)
  const [documentTypes, setDocumentTypes] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    const user = getSession()
    if (!user || (!hasRole(user, "student") && !hasRole(user, "teacher"))) {
      router.push("/login")
      return
    }
    setUserRole(user.role)
    setHistory(getCheckHistory())
  }, [router])

  useEffect(() => {
    fetch("/api/document-types")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.types)) setDocumentTypes(data.types)
      })
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    clearSession()
    router.push("/login")
  }

  const handleFileProcessed = (file: ParsedFile, originalFile: File) => {
    setParsedFile(file)
    setOriginalFile(originalFile)
    setUploadError(null)
    setResult(null)
    setError(null)
    setMetadata({
      title: file.filename.replace(/\.(pdf|docx|doc)$/i, ""),
      author: "",
      checker: "",
      category: "coursework",
      // Для студента каждая проверка после заполнения формы считается финальной.
      status: "final",
    })
    setShowMetadataDialog(true)
  }

  const handleCheck = async () => {
    if (!parsedFile || !originalFile) return

    setIsChecking(true)
    setError(null)
    setResult(null)

    const user = getSession()

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: parsedFile.text,
          filename: parsedFile.filename,
          topK: 5,
          institution: user?.institution || "БГУИР",
          category: metadata.category,
            userId: user?.username,
            userRole: user?.role,
        }),
      })

      const data = await res.json()
      if (data.success) {
        // Сохраняем документ в БД
        let documentId: number | undefined
        try {
          const uploadFormData = new FormData()
          uploadFormData.append("file", originalFile)
          uploadFormData.append("title", metadata.title || parsedFile.filename)
          uploadFormData.append("author", metadata.author || "Студент")
          uploadFormData.append("category", metadata.category)
          uploadFormData.append("status", metadata.status)
          uploadFormData.append("userId", user?.username || "")
          uploadFormData.append("institution", user?.institution || "БГУИР")
          uploadFormData.append("content", parsedFile.text)

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: uploadFormData,
          })

          const uploadData = await uploadRes.json()
          if (uploadData.success && uploadData.document && uploadData.document.id) {
            documentId = uploadData.document.id
            console.log("Документ сохранен с ID:", documentId)
          } else {
            console.warn("Документ не был сохранен в БД:", uploadData)
          }
        } catch (err) {
          console.error("Ошибка при сохранении документа в БД:", err)
          /* файл не сохранён в БД */
        }

        // Сохраняем результат с documentId, статусом и введёнными метаданными,
        // чтобы при повторном открытии из истории не терялись ФИО/название/тип.
        const resultWithId = {
          ...data,
          documentId,
          status: metadata.status,
          title: metadata.title,
          author: metadata.author,
          checker: metadata.checker,
          category: metadata.category,
        }
        console.log("Установка результата с documentId:", resultWithId)
        setResult(resultWithId)
        saveCheckResult(parsedFile, resultWithId)
        setHistory(getCheckHistory())

        // Автоматически генерируем и сохраняем итоговый PDF‑отчёт только для финальной версии.
        if (metadata.status === "final") {
          try {
            const currentUser = getSession()
            const autoReportData = {
              filename: parsedFile.filename,
              title: metadata.title,
              author: metadata.author,
              checker: metadata.checker || undefined,
              category: metadata.category,
              uniquenessPercent: resultWithId.uniquenessPercent,
              totalDocumentsChecked: resultWithId.totalDocumentsChecked,
              similarDocuments: resultWithId.similarDocuments,
              processingTimeMs: resultWithId.processingTimeMs,
              uploadDate: new Date().toISOString(),
              status: "final" as const,
              documentId,
              baseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
              userId: currentUser?.username,
              userRole: currentUser?.role,
            }

            await fetch("/api/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(autoReportData),
            })
          } catch (e) {
            console.error("Автогенерация итогового отчёта не удалась:", e)
          }
        }
      } else {
        setError(data.error || "Ошибка при проверке")
      }
    } catch (err) {
      setError("Ошибка соединения с сервером")
    } finally {
      setIsChecking(false)
    }
  }

  const handleDeleteHistory = (id: string) => {
    deleteCheckHistoryItem(id)
    setHistory(getCheckHistory())
  }

  const resetCheck = () => {
    setParsedFile(null)
    setOriginalFile(null)
    setResult(null)
    setError(null)
    setUploadError(null)
    setShowMetadataDialog(false)
    setMetadata({
      title: "",
      author: "",
      checker: "",
      category: "coursework",
      status: "final",
    })
  }

  const goToCheck = () => {}

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-gradient-to-r from-blue-50 to-white dark:from-gray-900 dark:to-gray-900">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={goToCheck} className="focus:outline-none">
              <BsuirLogo />
            </button>
            {userRole &&
              (() => {
                const label = userRole === "teacher" ? "Преподаватель" : "Студент"
                const colorClasses =
                  userRole === "teacher"
                    ? "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-100 dark:border-indigo-500/40"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-500/40"
                return (
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${colorClasses}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {label}
                  </Badge>
                )
              })()}
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" className="gap-2" onClick={() => router.push("/profile")}>
              <User className="h-4 w-4" />
              Профиль
            </Button>
            <Button variant="outline" className="gap-2 bg-transparent" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </nav>
        </div>
      </header>

          <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
              {/* Заголовок и карточка загрузки - скрываем когда есть результат */}
              {!result && (
                <>
                  <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold">Проверка на плагиат</h1>
                  </div>

                  <div className="grid gap-6">
                    {/* Upload Card */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Загрузка документа
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {!parsedFile ? (
                          <FileUpload
                            onFileProcessed={handleFileProcessed}
                            onError={setUploadError}
                            disabled={isChecking}
                          />
                        ) : (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-primary/10 rounded-lg flex-shrink-0">
                                <File className="h-8 w-8 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate" title={parsedFile.filename}>
                                  {parsedFile.filename}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {parsedFile.wordCount.toLocaleString()} слов | {parsedFile.fileType.toUpperCase()}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {uploadError && (
                          <p className="text-sm text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {uploadError}
                          </p>
                        )}

                        {parsedFile && !result && (
                          <div className="flex justify-end">
                            <Button onClick={handleCheck} disabled={isChecking} className="gap-2" size="lg">
                              {isChecking ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Анализ документа...
                                </>
                              ) : (
                                <>
                                  <FileSearch className="h-4 w-4" />
                                  Проверить на плагиат
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {error && (
                          <p className="text-sm text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              <div className="grid gap-6">

                {/* Results */}
                {result && (
                  <>
                    {/* Uniqueness Score Card */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5" />
                            Результат проверки
                          </span>
                          <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {result.processingTimeMs} мс
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-8">
                          <div className="text-center min-w-[120px]">
                            <div
                              className={`text-5xl font-bold ${result.uniquenessPercent >= 80 ? "text-green-600" : result.uniquenessPercent >= 50 ? "text-yellow-600" : "text-red-600"}`}
                            >
                              {result.uniquenessPercent}%
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {result.uniquenessPercent >= 80
                                ? "Высокая уникальность"
                                : result.uniquenessPercent >= 50
                                  ? "Пока ваша уникальность"
                                  : "Низкая уникальность"}
                            </p>
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Уникальность</span>
                                <span>{result.uniquenessPercent}%</span>
                              </div>
                              <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${result.uniquenessPercent >= 80 ? "bg-green-600" : result.uniquenessPercent >= 50 ? "bg-yellow-500" : "bg-red-600"}`}
                                  style={{ width: `${result.uniquenessPercent}%` }}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Найдено совпадений:</span>{" "}
                                <span className="font-medium">
                                  {result.similarDocuments.filter((d: any) => d.similarity > 10).length}
                                </span>
                              </div>
                            </div>
                            {result.message && <p className="text-sm text-muted-foreground">{result.message}</p>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Action buttons */}
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex justify-center gap-4">
                        {result.documentId && result.status === "final" ? (
                          <Button
                            variant="default"
                            onClick={async (e) => {
                              e.preventDefault()
                              e.stopPropagation()

                              try {
                                console.log("Кнопка нажата, documentId:", result.documentId)

                                const currentUser = getSession()

                                const reportData = {
                                  filename: parsedFile?.filename || "document",
                                  title: metadata.title,
                                  author: metadata.author,
                                  checker: metadata.checker || undefined,
                                  category: metadata.category,
                                  uniquenessPercent: result.uniquenessPercent,
                                  totalDocumentsChecked: result.totalDocumentsChecked,
                                  similarDocuments: result.similarDocuments,
                                  processingTimeMs: result.processingTimeMs,
                                  uploadDate: new Date().toISOString(),
                                  status: result.status === "final" ? "final" : "draft",
                                  documentId: result.documentId,
                                  baseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
                                  userId: currentUser?.username,
                                  userRole: currentUser?.role,
                                }

                                console.log("Отправка запроса на генерацию отчета:", reportData)

                                const res = await fetch("/api/report", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(reportData),
                                })

                                console.log("Ответ сервера:", res.status, res.statusText)

                                if (res.ok) {
                                  const blob = await res.blob()
                                  const url = window.URL.createObjectURL(blob)
                                  const a = document.createElement("a")
                                  a.href = url
                                  a.download = `spravka-${reportData.filename.replace(/\.[^/.]+$/, "")}.pdf`
                                  document.body.appendChild(a)
                                  a.click()
                                  window.URL.revokeObjectURL(url)
                                  document.body.removeChild(a)
                                  console.log("PDF успешно скачан")
                                } else {
                                  const errorData = await res.json().catch(() => ({ error: "Неизвестная ошибка" }))
                                  console.error("Ошибка при генерации отчета:", errorData)
                                  alert(`Ошибка при генерации отчета: ${errorData.error || "Неизвестная ошибка"}`)
                                }
                              } catch (err) {
                                console.error("Error generating report:", err)
                                alert(`Ошибка при генерации отчета: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`)
                              }
                            }}
                            className="gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            Скачать итоговый отчёт с QR-кодами
                          </Button>
                        ) : !result.documentId ? (
                          <div className="flex flex-col items-center gap-2">
                            <Button
                              variant="default"
                              disabled
                              className="gap-2 opacity-50"
                            >
                              <FileText className="h-4 w-4" />
                              Скачать итоговый отчёт с QR-кодами
                            </Button>
                            <p className="text-sm text-muted-foreground text-center">
                              Документ еще не сохранен. Пожалуйста, подождите...
                            </p>
                          </div>
                        ) : result.status === "draft" ? (
                          <p className="text-sm text-muted-foreground">
                            Итоговый отчёт с QR-кодами доступен только для финальной версии.
                          </p>
                        ) : null}

                        <Button variant="outline" onClick={resetCheck} className="gap-2 bg-transparent">
                          <FileText className="h-4 w-4" />
                          Проверить другой документ
                        </Button>
                      </div>
                    </div>

                    {/* Similar Documents */}
                    {result.similarDocuments.filter((d: any) => d.similarity > 5).length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            Похожие документы (Топ-{result.similarDocuments.filter((d: any) => d.similarity > 5).length}
                            )
                          </CardTitle>
                          <CardDescription>Работы с наибольшим сходством</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {result.similarDocuments
                            .filter((d: any) => d.similarity > 5)
                            .map((doc: any, idx: number) => (
                              <div key={doc.id} className="p-4 rounded-lg border border-border bg-muted/30">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline">#{idx + 1}</Badge>
                                      <h4 className="font-medium">{doc.title}</h4>
                                    </div>
                                    {(doc.userId || doc.author) && (
                                      <p className="text-sm text-muted-foreground mt-1">
                                        ID автора: {doc.userId || doc.author}
                                      </p>
                                    )}
                                  </div>
                                  <Badge
                                    variant={doc.similarity > 50 ? "destructive" : "secondary"}
                                    className="text-sm"
                                  >
                                    {doc.similarity}% сходство
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </CardContent>
                      </Card>
                    )}

                    {result.similarDocuments.filter((d: any) => d.similarity > 5).length === 0 && (
                      <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
                        <CardContent className="py-8 text-center">
                          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                          <h3 className="text-lg font-medium text-green-800 dark:text-green-400">
                            Совпадений не найдено
                          </h3>
                          <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                            Документ уникален относительно базы работ
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
        </div>
      </main>

      <Dialog
        open={showMetadataDialog}
        onOpenChange={(open) => {
          if (open) {
            setShowMetadataDialog(true)
          } else {
            // Любое "закрытие" диалога пользователем (крестик, фон, Esc)
            // должно работать как кнопка "Отмена" — сбрасываем состояние.
            resetCheck()
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Информация о документе</DialogTitle>
            <DialogDescription>Заполните данные о вашей работе перед проверкой</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Название работы *
              </label>
              <Input
                id="title"
                value={metadata.title}
                onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                placeholder="Введите название работы"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="author" className="text-sm font-medium">
                ФИО автора (обучающегося) *
              </label>
              <Input
                id="author"
                value={metadata.author}
                onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                placeholder="Иванов Иван Иванович"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="checker" className="text-sm font-medium">
                ФИО проверяющего (преподавателя)
              </label>
              <Input
                id="checker"
                value={metadata.checker}
                onChange={(e) => setMetadata({ ...metadata, checker: e.target.value })}
                placeholder="Петрова Мария Сергеевна"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium">
                Тип работы *
              </label>
              <Select
                value={metadata.category}
                onValueChange={(value) => setMetadata({ ...metadata, category: value })}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.length > 0
                    ? documentTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))
                    : [
                        { id: "diploma", label: "Дипломная работа" },
                        { id: "coursework", label: "Курсовая работа / Проект" },
                        { id: "lab", label: "Лабораторная работа" },
                        { id: "practice", label: "Практическое задание" },
                      ].map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium">
                Версия документа *
              </label>
              <Select
                value={metadata.status}
                onValueChange={(value: "draft" | "final") => setMetadata({ ...metadata, status: value })}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="final">Финальная (хранится всегда)</SelectItem>
                  <SelectItem value="draft">Черновая (удаляется через 24 ч)</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetCheck} className="bg-transparent">
              Отмена
            </Button>
            <Button
              onClick={() => {
                setShowMetadataDialog(false)
                // Автоматически запускаем проверку после закрытия диалога
                setTimeout(() => handleCheck(), 100)
              }}
              disabled={!metadata.title || !metadata.author}
            >
              Продолжить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
