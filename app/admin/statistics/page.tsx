"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts"
import { Download, FileSpreadsheet, Calendar, Filter, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getSession } from "@/lib/auth"
import { categoryLabel as staticCategoryLabel } from "@/lib/category-labels"
import * as XLSX from "xlsx"

function categoryLabel(cat: string, documentTypes: Array<{ id: string; label: string }>): string {
  if (!cat) return "Не указано"
  const fromTypes = documentTypes.find((t) => t.id === cat)
  if (fromTypes) return fromTypes.label
  return staticCategoryLabel(cat)
}

interface DocumentRow {
  id: number
  userId: string | null
  category: string
  status: "draft" | "final"
  originalityPercent: number | null
  plagiarismPercent: number | null
  uploadDate: string
}

interface OriginalityByDateRow {
  date: string
  formattedDate: string
  diploma: number | null
  coursework: number | null
  lab: number | null
  practice: number | null
  uncategorized: number | null
}

interface StatisticsData {
  totalChecks: number
  totalDocuments: number
  averageUniqueness: number
  checksByCategory: Array<{ category: string; count: number }>
  checksByDate: Array<{ date: string; count: number }>
  uniquenessDistribution: Array<{ range: string; count: number }>
  userActivity: Array<{ username: string; checks: number }>
  documents: DocumentRow[]
  originalityByDateByCategory: OriginalityByDateRow[]
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"]
const LINE_CHART_CATEGORIES = ["diploma", "coursework", "lab", "practice"] as const
const BAR_CHART_CATEGORIES = ["diploma", "coursework", "lab", "practice", "uncategorized"] as const
const STATUS_OPTIONS = [
  { value: "final", label: "Финальная" },
  { value: "draft", label: "Черновая" },
] as const

const HEATMAP_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"]
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

function getHeatmapCellColor(count: number, maxCount: number): string {
  if (count <= 0) return HEATMAP_COLORS[0]
  if (maxCount <= 0) return HEATMAP_COLORS[0]
  const level = Math.min(4, Math.ceil((count / maxCount) * 4))
  return HEATMAP_COLORS[level]
}

export default function StatisticsPage() {
  const router = useRouter()
  const [documentTypes, setDocumentTypes] = useState<Array<{ id: string; label: string }>>([])
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear())
  const [heatmapStatuses, setHeatmapStatuses] = useState<string[]>([])
  const [heatmapCategories, setHeatmapCategories] = useState<string[]>([])
  const [heatmapData, setHeatmapData] = useState<Record<string, number> | null>(null)
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [lineChartStartDate, setLineChartStartDate] = useState("")
  const [lineChartEndDate, setLineChartEndDate] = useState("")
  const [lineChartStatuses, setLineChartStatuses] = useState<string[]>([])
  const [lineChartCategories, setLineChartCategories] = useState<string[]>([])
  const [lineChartData, setLineChartData] = useState<OriginalityByDateRow[]>([])
  const [lineChartLoading, setLineChartLoading] = useState(false)
  const [barChartYear, setBarChartYear] = useState(new Date().getFullYear())
  const [barChartStatuses, setBarChartStatuses] = useState<string[]>([])
  const [barChartCategories, setBarChartCategories] = useState<string[]>([])
  const [monthlyUploads, setMonthlyUploads] = useState<Array<Record<string, string | number>> | null>(null)
  const [monthlyUploadsLoading, setMonthlyUploadsLoading] = useState(false)
  const [chart5Year, setChart5Year] = useState(new Date().getFullYear())
  const [chart5Statuses, setChart5Statuses] = useState<string[]>([])
  const [chart5Categories, setChart5Categories] = useState<string[]>([])
  const [chart5Data, setChart5Data] = useState<Array<Record<string, string | number>> | null>(null)
  const [chart5Loading, setChart5Loading] = useState(false)
  // Фильтры на таблицу (можно выбрать несколько типов работ и статусов)
  const [tableFilters, setTableFilters] = useState({
    startDate: "",
    endDate: "",
    categories: [] as string[],
    statuses: [] as string[],
    minUniqueness: 0,
    maxUniqueness: 100,
    minPlagiarism: 0,
    maxPlagiarism: 100,
  })
  // График 2 (круговой): своя фильтрация по дате
  const [pieChartStartDate, setPieChartStartDate] = useState("")
  const [pieChartEndDate, setPieChartEndDate] = useState("")
  const [pieChartData, setPieChartData] = useState<Array<{ category: string; count: number }>>([])
  const [pieChartLoading, setPieChartLoading] = useState(false)

  useEffect(() => {
    fetch("/api/document-types")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.types)) setDocumentTypes(data.types)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchStatistics()
  }, [tableFilters])

  useEffect(() => {
    setPieChartLoading(true)
    const params = new URLSearchParams()
    if (pieChartStartDate) params.append("startDate", pieChartStartDate)
    if (pieChartEndDate) params.append("endDate", pieChartEndDate)
    fetch(`/api/admin/statistics/checks-by-category?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPieChartData(data.checksByCategory ?? [])
        else setPieChartData([])
      })
      .catch(() => setPieChartData([]))
      .finally(() => setPieChartLoading(false))
  }, [pieChartStartDate, pieChartEndDate])

  useEffect(() => {
    setHeatmapLoading(true)
    const params = new URLSearchParams()
    params.append("year", heatmapYear.toString())
    if (heatmapStatuses.length > 0) params.append("status", heatmapStatuses.join(","))
    if (heatmapCategories.length > 0) params.append("category", heatmapCategories.join(","))
    fetch(`/api/admin/statistics/heatmap?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setHeatmapData(data.dailyCounts ?? {})
        else setHeatmapData({})
      })
      .catch(() => setHeatmapData({}))
      .finally(() => setHeatmapLoading(false))
  }, [heatmapYear, heatmapStatuses, heatmapCategories])

  useEffect(() => {
    setLineChartLoading(true)
    const params = new URLSearchParams()
    if (lineChartStartDate) params.append("startDate", lineChartStartDate)
    if (lineChartEndDate) params.append("endDate", lineChartEndDate)
    if (lineChartStatuses.length > 0) params.append("status", lineChartStatuses.join(","))
    if (lineChartCategories.length > 0) params.append("category", lineChartCategories.join(","))
    fetch(`/api/admin/statistics/originality-by-date?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLineChartData(data.ranges ?? [])
        else setLineChartData([])
      })
      .catch(() => setLineChartData([]))
      .finally(() => setLineChartLoading(false))
  }, [lineChartStartDate, lineChartEndDate, lineChartStatuses, lineChartCategories])

  useEffect(() => {
    setMonthlyUploadsLoading(true)
    const params = new URLSearchParams()
    params.append("year", barChartYear.toString())
    if (barChartStatuses.length > 0) params.append("status", barChartStatuses.join(","))
    if (barChartCategories.length > 0) params.append("category", barChartCategories.join(","))
    fetch(`/api/admin/statistics/monthly-uploads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMonthlyUploads(data.monthly ?? [])
        else setMonthlyUploads([])
      })
      .catch(() => setMonthlyUploads([]))
      .finally(() => setMonthlyUploadsLoading(false))
  }, [barChartYear, barChartStatuses, barChartCategories])

  useEffect(() => {
    setChart5Loading(true)
    const params = new URLSearchParams()
    params.append("year", chart5Year.toString())
    if (chart5Statuses.length > 0) params.append("status", chart5Statuses.join(","))
    if (chart5Categories.length > 0) params.append("category", chart5Categories.join(","))
    fetch(`/api/admin/statistics/originality-ranges?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setChart5Data(data.ranges ?? [])
        else setChart5Data([])
      })
      .catch(() => setChart5Data([]))
      .finally(() => setChart5Loading(false))
  }, [chart5Year, chart5Statuses, chart5Categories])

  const fetchStatistics = async () => {
    try {
      const params = new URLSearchParams()
      if (tableFilters.startDate) params.append("startDate", tableFilters.startDate)
      if (tableFilters.endDate) params.append("endDate", tableFilters.endDate)
      if (tableFilters.categories.length > 0) params.append("category", tableFilters.categories.join(","))
      if (tableFilters.statuses.length > 0) params.append("status", tableFilters.statuses.join(","))
      params.append("minUniqueness", tableFilters.minUniqueness.toString())
      params.append("maxUniqueness", tableFilters.maxUniqueness.toString())
      params.append("minPlagiarism", tableFilters.minPlagiarism.toString())
      params.append("maxPlagiarism", tableFilters.maxPlagiarism.toString())

      const res = await fetch(`/api/admin/statistics?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setStats(data.statistics)
      }
    } catch (error) {
      console.error("Error fetching statistics:", error)
    } finally {
      setLoading(false)
    }
  }

  const getExportData = () => {
    if (!stats) return []
    return [
      ["Период", tableFilters.startDate || "Начало", tableFilters.endDate || "Конец"],
      ["ID документа", "ID пользователя", "Тип работы", "Статус документа", "Процент оригинальности", "Процент заимствования", "Дата загрузки"],
      ...(stats.documents ?? []).map((doc) => [
        doc.id.toString(),
        doc.userId ?? "—",
        doc.category,
        doc.status === "final" ? "Финальная" : "Черновая",
        doc.originalityPercent != null ? doc.originalityPercent.toFixed(1) + "%" : "—",
        doc.plagiarismPercent != null ? doc.plagiarismPercent.toFixed(1) + "%" : "—",
        doc.uploadDate,
      ]),
    ]
  }

  const handleExportCSV = () => {
    const rows = getExportData()
    if (rows.length === 0) return

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `statistics-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleExportXLSX = () => {
    const rows = getExportData()
    if (rows.length === 0) return

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Статистика")
    XLSX.writeFile(wb, `statistics-${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">Загрузка статистики...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">Ошибка загрузки статистики</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Дашборд</h1>
          <p className="text-muted-foreground">
            Таблица с фильтрами и графики 1–5 в одной панели по ТЗ
          </p>
        </div>

        {/* Фильтры на таблицу */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Фильтры на таблицу
            </CardTitle>
            <CardDescription>
              Тип работы и статус документа можно выбрать несколько (или не выбирать — тогда все).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Дата (от)</Label>
                <Input
                  type="date"
                  value={tableFilters.startDate}
                  onChange={(e) => setTableFilters({ ...tableFilters, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Дата (до)</Label>
                <Input
                  type="date"
                  value={tableFilters.endDate}
                  onChange={(e) => setTableFilters({ ...tableFilters, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Тип работы</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {tableFilters.categories.length === 0
                        ? "Все типы"
                        : tableFilters.categories.length + " выб."}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Тип работы</p>
                      {BAR_CHART_CATEGORIES.map((cat) => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={tableFilters.categories.includes(cat)}
                            onCheckedChange={(checked) => {
                              setTableFilters((prev) => ({
                                ...prev,
                                categories: checked
                                  ? [...prev.categories, cat]
                                  : prev.categories.filter((c) => c !== cat),
                              }))
                            }}
                          />
                          <span className="text-sm">{categoryLabel(cat, documentTypes)}</span>
                        </label>
                      ))}
                      <p className="text-xs text-muted-foreground">Пусто = все типы</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Статус документа</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {tableFilters.statuses.length === 0
                        ? "Все"
                        : tableFilters.statuses.map((s) => (s === "final" ? "Финальная" : "Черновая")).join(", ")}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Статус документа</p>
                      {STATUS_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={tableFilters.statuses.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setTableFilters((prev) => ({
                                ...prev,
                                statuses: checked
                                  ? [...prev.statuses, opt.value]
                                  : prev.statuses.filter((s) => s !== opt.value),
                              }))
                            }}
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                      <p className="text-xs text-muted-foreground">Пусто = все статусы</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Процент оригинальности (%)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="От"
                    min={0}
                    max={100}
                    value={tableFilters.minUniqueness}
                    onChange={(e) =>
                      setTableFilters({ ...tableFilters, minUniqueness: Number.parseInt(e.target.value) || 0 })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="До"
                    min={0}
                    max={100}
                    value={tableFilters.maxUniqueness}
                    onChange={(e) =>
                      setTableFilters({ ...tableFilters, maxUniqueness: Number.parseInt(e.target.value) || 100 })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Процент заимствования (%)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="От"
                    min={0}
                    max={100}
                    value={tableFilters.minPlagiarism}
                    onChange={(e) =>
                      setTableFilters({ ...tableFilters, minPlagiarism: Number.parseInt(e.target.value) || 0 })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="До"
                    min={0}
                    max={100}
                    value={tableFilters.maxPlagiarism}
                    onChange={(e) =>
                      setTableFilters({ ...tableFilters, maxPlagiarism: Number.parseInt(e.target.value) || 100 })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-2">
                    <Download className="h-4 w-4" />
                    Экспорт таблицы
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
            </div>
          </CardContent>
        </Card>

        {/* Таблица с колонками по ТЗ */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Таблица</CardTitle>
            <CardDescription>
              ID документа, ID пользователя, тип работы, статус документа (Финальная/черновая), процент оригинальности, процент заимствования, дата загрузки. Всего: {(stats.documents ?? []).length}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID документа</TableHead>
                    <TableHead>ID пользователя</TableHead>
                    <TableHead>Тип работы</TableHead>
                    <TableHead>Статус документа</TableHead>
                    <TableHead>Процент оригинальности</TableHead>
                    <TableHead>Процент заимствования</TableHead>
                    <TableHead>Дата загрузки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.documents ?? []).length > 0 ? (
                    (stats.documents ?? []).map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-sm">#{doc.id}</TableCell>
                        <TableCell className="font-mono text-sm">{doc.userId ?? "—"}</TableCell>
                        <TableCell>{categoryLabel(doc.category, documentTypes)}</TableCell>
                        <TableCell>
                          <Badge variant={doc.status === "final" ? "default" : "secondary"}>
                            {doc.status === "final" ? "Финальная" : "Черновая"}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {doc.originalityPercent !== null && doc.originalityPercent !== undefined
                            ? `${doc.originalityPercent.toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {doc.plagiarismPercent !== null && doc.plagiarismPercent !== undefined
                            ? `${doc.plagiarismPercent.toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {doc.uploadDate
                            ? new Date(doc.uploadDate).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Нет документов по выбранным фильтрам
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* График 1 (тепловая карта) */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>График 1. Загрузки по дням (тепловая карта)</CardTitle>
                <CardDescription>
                  По горизонтали — месяцы, по вертикали — дни недели (Пн–Вс). При наведении: дата и кол-во загрузок.
                  Фильтрация: год, статус документа, тип работы (можно выбрать несколько).
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground whitespace-nowrap">Год</Label>
                  <Select
                    value={heatmapYear.toString()}
                    onValueChange={(v) => setHeatmapYear(Number.parseInt(v, 10))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3].map(
                        (y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-between">
                      Статус: {heatmapStatuses.length === 0 ? "Все" : heatmapStatuses.map((s) => (s === "final" ? "Финальная" : "Черновая")).join(", ")}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="end">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Статус документа</p>
                      {STATUS_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={heatmapStatuses.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setHeatmapStatuses((prev) =>
                                checked ? [...prev, opt.value] : prev.filter((s) => s !== opt.value),
                              )
                            }}
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                      <p className="text-xs text-muted-foreground">Пусто = все статусы</p>
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[220px] justify-between">
                      Тип работы: {heatmapCategories.length === 0 ? "Все" : heatmapCategories.length + " выб."}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Тип работы</p>
                      {BAR_CHART_CATEGORIES.map((cat) => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={heatmapCategories.includes(cat)}
                            onCheckedChange={(checked) => {
                              setHeatmapCategories((prev) =>
                                checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                              )
                            }}
                          />
                          <span className="text-sm">{categoryLabel(cat, documentTypes)}</span>
                        </label>
                      ))}
                      <p className="text-xs text-muted-foreground">Пусто = все типы</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TooltipProvider delayDuration={0}>
              <div className="overflow-x-auto">
                {heatmapLoading && (
                  <div className="py-12 text-center text-muted-foreground text-sm">Загрузка тепловой карты...</div>
                )}
                {!heatmapLoading && heatmapData && (() => {
                  const jan1 = new Date(heatmapYear, 0, 1)
                  const dayOfJan1 = jan1.getDay()
                  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1
                  const startDate = new Date(heatmapYear, 0, 1 - mondayOffset)
                  const cellSize = 12
                  const gap = 2
                  const colWidth = cellSize + gap
                  return (
                <div className="inline-flex flex-col gap-0.5 min-w-0">
                  {/* Ось месяцев по горизонтали */}
                  <div
                    className="flex pl-6 mb-1 text-[10px] text-muted-foreground"
                    style={{ width: 53 * colWidth - gap }}
                  >
                    {MONTHS.map((m) => (
                      <span key={m} className="flex-1 min-w-0 truncate" style={{ width: (53 * colWidth) / 12 }}>
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-[2px]">
                    {/* Ось дней недели по вертикали */}
                    <div className="flex flex-col gap-[2px] justify-around w-6 flex-shrink-0 text-[10px] text-muted-foreground">
                      {WEEKDAYS.map((d) => (
                        <span key={d} className="h-3 flex items-center">
                          {d}
                        </span>
                      ))}
                    </div>
                    {/* Сетка квадратиков */}
                    {(() => {
                      const jan1 = new Date(heatmapYear, 0, 1)
                      const dayOfJan1 = jan1.getDay() // 0 Sun, 1 Mon, ...
                      const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1
                      const startDate = new Date(heatmapYear, 0, 1 - mondayOffset)
                      const maxCount = Math.max(1, ...Object.values(heatmapData))
                      const cols = 53
                      const rows = 7
                      const cellSize = 12
                      const gap = 2
                      const cells: { dateStr: string; count: number; inYear: boolean }[][] = []
                      for (let col = 0; col < cols; col++) {
                        const week: { dateStr: string; count: number; inYear: boolean }[] = []
                        for (let row = 0; row < rows; row++) {
                          const d = new Date(startDate)
                          d.setDate(d.getDate() + col * 7 + row)
                          const dateStr = d.toISOString().split("T")[0]
                          const inYear = d.getFullYear() === heatmapYear
                          const count = inYear ? heatmapData[dateStr] ?? 0 : 0
                          week.push({ dateStr, count, inYear })
                        }
                        cells.push(week)
                      }
                      return (
                        <div
                          className="flex gap-[2px] flex-shrink-0"
                          style={{ width: cols * (cellSize + gap) - gap }}
                        >
                          {cells.map((week, col) => (
                            <div key={col} className="flex flex-col gap-[2px]">
                              {week.map((cell, row) => (
                                <UiTooltip key={`${col}-${row}`}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="rounded-[2px] cursor-default flex-shrink-0 transition-opacity hover:opacity-80"
                                      style={{
                                        width: cellSize,
                                        height: cellSize,
                                        backgroundColor: cell.inYear
                                          ? getHeatmapCellColor(cell.count, maxCount)
                                          : "var(--muted)",
                                        opacity: cell.inYear ? 1 : 0.4,
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-sm">
                                    {cell.inYear ? (
                                      <span className="font-medium">{cell.dateStr}: {cell.count}</span>
                                    ) : (
                                      <span className="text-muted-foreground">Вне выбранного года</span>
                                    )}
                                  </TooltipContent>
                                </UiTooltip>
                              ))}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
                );
                })()}
              </div>
              {!heatmapLoading && heatmapData && (
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <span>Меньше</span>
                  {HEATMAP_COLORS.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-[2px] flex-shrink-0"
                      style={{ width: 12, height: 12, backgroundColor: c }}
                    />
                  ))}
                  <span>Больше</span>
                </div>
              )}
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* График 2 (круговой): Категория, кол-во загрузок. Фильтрация по дате */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>График 2. Проверки по категориям (круговой)</CardTitle>
                <CardDescription>
                  Категория и кол-во загрузок. Фильтрация по дате.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground text-sm whitespace-nowrap">Дата от</Label>
                  <Input
                    type="date"
                    value={pieChartStartDate}
                    onChange={(e) => setPieChartStartDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground text-sm whitespace-nowrap">Дата до</Label>
                  <Input
                    type="date"
                    value={pieChartEndDate}
                    onChange={(e) => setPieChartEndDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {pieChartLoading && (
              <div className="py-12 text-center text-muted-foreground text-sm">Загрузка...</div>
            )}
            {!pieChartLoading && pieChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
                  <Pie
                    data={pieChartData.map((item) => ({
                      ...item,
                      categoryName: categoryLabel(item.category, documentTypes),
                    }))}
                    dataKey="count"
                    nameKey="categoryName"
                    cx="50%"
                    cy="45%"
                    outerRadius={100}
                    label={({ categoryName, count }) => `${categoryName}: ${count}`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, "Кол-во загрузок"]}
                    labelFormatter={(label) => `Категория: ${label}`}
                    contentStyle={{ fontSize: "12px" }}
                  />
                  <Legend verticalAlign="bottom" align="center" />
                </PieChart>
              </ResponsiveContainer>
            )}
            {!pieChartLoading && pieChartData.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Нет данных. Задайте период или оставьте пусто для всех дат.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6">
          {/* График 3 (линейный): дата по горизонтали, % оригинальности по вертикали, линии — тип работы */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>График 3. Процент оригинальности по датам (линейный)</CardTitle>
                  <CardDescription>
                    По горизонтали — дата (17.08, 18.08 и т.д.). По вертикали — процент оригинальности: 0, 10, 20, …, 100. Линии — тип работы.
                    Фильтрация: по дате, тип работы, статус (можно выбрать несколько).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground text-sm whitespace-nowrap">Дата от</Label>
                    <Input
                      type="date"
                      value={lineChartStartDate}
                      onChange={(e) => setLineChartStartDate(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground text-sm whitespace-nowrap">Дата до</Label>
                    <Input
                      type="date"
                      value={lineChartEndDate}
                      onChange={(e) => setLineChartEndDate(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[200px] justify-between">
                        Статус: {lineChartStatuses.length === 0 ? "Все" : lineChartStatuses.map((s) => (s === "final" ? "Финальная" : "Черновая")).join(", ")}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Статус документа</p>
                        {STATUS_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={lineChartStatuses.includes(opt.value)}
                              onCheckedChange={(checked) => {
                                setLineChartStatuses((prev) =>
                                  checked ? [...prev, opt.value] : prev.filter((s) => s !== opt.value),
                                )
                              }}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все статусы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[220px] justify-between">
                        Тип работы: {lineChartCategories.length === 0 ? "Все" : lineChartCategories.length + " выб."}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Тип работы (какие линии показывать)</p>
                        {BAR_CHART_CATEGORIES.map((cat) => (
                          <label key={cat} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={lineChartCategories.includes(cat)}
                              onCheckedChange={(checked) => {
                                setLineChartCategories((prev) =>
                                  checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                                )
                              }}
                            />
                            <span className="text-sm">{categoryLabel(cat, documentTypes)}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все типы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {lineChartLoading && (
                <div className="py-12 text-center text-muted-foreground text-sm">Загрузка графика...</div>
              )}
              {!lineChartLoading && lineChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={lineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="formattedDate" />
                    <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} />
                    <Tooltip
                      formatter={(value: number) => [value != null ? `${value}%` : "—", ""]}
                      labelFormatter={(label) => `Дата: ${label}`}
                    />
                    <Legend formatter={(value) => categoryLabel(value, documentTypes)} verticalAlign="top" align="right" />
                    {BAR_CHART_CATEGORIES.map((cat, i) =>
                      (lineChartCategories.length === 0 || lineChartCategories.includes(cat)) ? (
                        <Line
                          key={cat}
                          type="monotone"
                          dataKey={cat}
                          name={categoryLabel(cat, documentTypes)}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 1 }}
                          connectNulls
                        />
                      ) : null,
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {!lineChartLoading && lineChartData.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">Нет данных. Задайте период и/или фильтры.</div>
              )}
            </CardContent>
          </Card>

          {/* График 4 (столбчатый): по месяцам за год, кол-во загрузок, столбцы — тип работы */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>График 4. Загрузки по месяцам за год (столбчатый)</CardTitle>
                  <CardDescription>
                    По горизонтали — месяцы за год. По вертикали — кол-во загрузок. Столбцы — тип работы (стек).
                    Фильтрация: год, тип работы, статус (можно выбрать несколько).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground text-sm whitespace-nowrap">Год</Label>
                    <Select value={barChartYear.toString()} onValueChange={(v) => setBarChartYear(Number.parseInt(v, 10))}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(
                          (y) => (
                            <SelectItem key={y} value={y.toString()}>
                              {y}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[200px] justify-between">
                        Статус: {barChartStatuses.length === 0 ? "Все" : barChartStatuses.map((s) => (s === "final" ? "Финальная" : "Черновая")).join(", ")}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Статус документа</p>
                        {STATUS_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={barChartStatuses.includes(opt.value)}
                              onCheckedChange={(checked) => {
                                setBarChartStatuses((prev) =>
                                  checked ? [...prev, opt.value] : prev.filter((s) => s !== opt.value),
                                )
                              }}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все статусы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[220px] justify-between">
                        Тип работы: {barChartCategories.length === 0 ? "Все" : barChartCategories.length + " выб."}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Тип работы</p>
                        {BAR_CHART_CATEGORIES.map((cat) => (
                          <label key={cat} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={barChartCategories.includes(cat)}
                              onCheckedChange={(checked) => {
                                setBarChartCategories((prev) =>
                                  checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                                )
                              }}
                            />
                            <span className="text-sm">{categoryLabel(cat, documentTypes)}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все типы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyUploadsLoading && (
                <div className="py-12 text-center text-muted-foreground text-sm">Загрузка графика...</div>
              )}
              {!monthlyUploadsLoading && monthlyUploads && monthlyUploads.length > 0 && (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={monthlyUploads} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthLabel" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number, name: string) => [value, categoryLabel(name, documentTypes)]}
                      labelFormatter={(label) => `Месяц: ${label}`}
                    />
                    <Legend formatter={(value) => categoryLabel(value, documentTypes)} />
                    {BAR_CHART_CATEGORIES.map((cat, i) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        name={categoryLabel(cat, documentTypes)}
                        stackId="a"
                        fill={COLORS[i % COLORS.length]}
                      >
                        <LabelList
                          dataKey={cat}
                          position="center"
                          fill="#fff"
                          fontSize={11}
                          formatter={(v: number) => (v > 0 ? v : "")}
                        />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
              {!monthlyUploadsLoading && (!monthlyUploads || monthlyUploads.length === 0) && (
                <div className="py-12 text-center text-muted-foreground text-sm">Нет данных за выбранный период</div>
              )}
            </CardContent>
          </Card>

          {/* График 5 (столбчатый): по диапазонам % оригинальности, кол-во загрузок, столбцы — тип работы */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>График 5. Загрузки по проценту оригинальности (столбчатый)</CardTitle>
                  <CardDescription>
                    По горизонтали — процент оригинальности: 0-10, 11-20, …, 91-100. По вертикали — кол-во загрузок. Столбцы — тип работы (стек).
                    Фильтрация: год, тип работы, статус (можно выбрать несколько).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground text-sm whitespace-nowrap">Год</Label>
                    <Select value={chart5Year.toString()} onValueChange={(v) => setChart5Year(Number.parseInt(v, 10))}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(
                          (y) => (
                            <SelectItem key={y} value={y.toString()}>
                              {y}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[200px] justify-between">
                        Статус: {chart5Statuses.length === 0 ? "Все" : chart5Statuses.map((s) => (s === "final" ? "Финальная" : "Черновая")).join(", ")}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Статус документа</p>
                        {STATUS_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={chart5Statuses.includes(opt.value)}
                              onCheckedChange={(checked) => {
                                setChart5Statuses((prev) =>
                                  checked ? [...prev, opt.value] : prev.filter((s) => s !== opt.value),
                                )
                              }}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все статусы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[220px] justify-between">
                        Тип работы: {chart5Categories.length === 0 ? "Все" : chart5Categories.length + " выб."}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Тип работы</p>
                        {BAR_CHART_CATEGORIES.map((cat) => (
                          <label key={cat} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={chart5Categories.includes(cat)}
                              onCheckedChange={(checked) => {
                                setChart5Categories((prev) =>
                                  checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                                )
                              }}
                            />
                            <span className="text-sm">{categoryLabel(cat, documentTypes)}</span>
                          </label>
                        ))}
                        <p className="text-xs text-muted-foreground">Пусто = все типы</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chart5Loading && (
                <div className="py-12 text-center text-muted-foreground text-sm">Загрузка графика...</div>
              )}
              {!chart5Loading && chart5Data && chart5Data.length > 0 && (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chart5Data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rangeLabel" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number, name: string) => [value, categoryLabel(name, documentTypes)]}
                      labelFormatter={(label) => `Оригинальность: ${label}%`}
                    />
                    <Legend formatter={(value) => categoryLabel(value, documentTypes)} />
                    {BAR_CHART_CATEGORIES.map((cat, i) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        name={categoryLabel(cat, documentTypes)}
                        stackId="a"
                        fill={COLORS[i % COLORS.length]}
                      >
                        <LabelList
                          dataKey={cat}
                          position="center"
                          fill="#fff"
                          fontSize={11}
                          formatter={(v: number) => (v > 0 ? v : "")}
                        />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
              {!chart5Loading && (!chart5Data || chart5Data.length === 0) && (
                <div className="py-12 text-center text-muted-foreground text-sm">Нет данных за выбранный период</div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
