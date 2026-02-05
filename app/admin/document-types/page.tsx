"use client"

import { useState, useEffect } from "react"
import { Tags, Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DocumentTypeItem {
  id: string
  label: string
}

export default function DocumentTypesPage() {
  const [types, setTypes] = useState<DocumentTypeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createId, setCreateId] = useState("")
  const [createLabel, setCreateLabel] = useState("")
  const [editLabel, setEditLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchTypes = async () => {
    try {
      const res = await fetch("/api/admin/document-types")
      const data = await res.json()
      if (data.success) setTypes(data.types)
    } catch (e) {
      console.error(e)
      setError("Ошибка загрузки типов")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTypes()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch("/api/admin/document-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: createId.trim(), label: createLabel.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTypes(data.types)
        setIsCreateOpen(false)
        setCreateId("")
        setCreateLabel("")
      } else {
        setError(data.error || "Ошибка создания")
      }
    } catch (e) {
      setError("Ошибка соединения с сервером")
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/document-types/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTypes(data.types)
        setEditingId(null)
      } else {
        setError(data.error || "Ошибка обновления")
      }
    } catch (e) {
      setError("Ошибка соединения с сервером")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`Удалить тип «${types.find((t) => t.id === id)?.label}»? Документы с этим типом останутся, но отображаться будет идентификатор.`)) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/document-types/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (data.success) {
        setTypes(data.types)
      } else {
        setError(data.error || "Ошибка удаления")
      }
    } catch (e) {
      setError("Ошибка соединения с сервером")
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Типы заданий / документов</h1>
        <p className="text-muted-foreground">
          Создавайте и редактируйте типы работ. Они отображаются при проверке и в хранилище.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tags className="h-5 w-5" />
                Список типов
              </CardTitle>
              <CardDescription>Всего: {types.length}</CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Добавить тип
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый тип задания</DialogTitle>
                  <DialogDescription>Идентификатор (латиница, цифры, дефис) и название для отображения.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="new-id">Идентификатор (например: essay)</Label>
                    <Input
                      id="new-id"
                      value={createId}
                      onChange={(e) => setCreateId(e.target.value)}
                      placeholder="essay"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-label">Название</Label>
                    <Input
                      id="new-label"
                      value={createLabel}
                      onChange={(e) => setCreateLabel(e.target.value)}
                      placeholder="Эссе"
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Отмена
                    </Button>
                    <Button type="submit" disabled={saving || !createLabel.trim()}>
                      {saving ? "Сохранение…" : "Создать"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {error && !isCreateOpen && !editingId && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Идентификатор</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-[120px]">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.id}</TableCell>
                    <TableCell>{t.label}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(t.id)
                            setEditLabel(t.label)
                            setError(null)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(t.id)}
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

      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать тип</DialogTitle>
            <DialogDescription>Идентификатор: {editingId}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="edit-label">Название</Label>
              <Input
                id="edit-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving || !editLabel.trim()}>
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
