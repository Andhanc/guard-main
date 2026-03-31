import crypto from "crypto"
import { getSqlite } from "./sqlite"
import { ensureSqliteSeededFromLocalJson } from "./sqlite-seed"

export type JobStatus = "queued" | "running" | "succeeded" | "failed"

export interface JobRow<TPayload = any, TResult = any> {
  id: number
  type: string
  payload: TPayload
  status: JobStatus
  result?: TResult
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  attempts: number
  maxAttempts: number
  runAfterMs?: number | null
}

function initDb() {
  const db = getSqlite()
  ensureSqliteSeededFromLocalJson()
  return db
}

function nowIso() {
  return new Date().toISOString()
}

function mapJobRow(row: any): JobRow {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload_json),
    status: row.status,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    attempts: row.attempts ?? 0,
    maxAttempts: row.max_attempts ?? 3,
    runAfterMs: row.run_after_ms ?? null,
  }
}

export function enqueueJob<TPayload extends object>(
  type: string,
  payload: TPayload,
  opts?: { runAfterMs?: number; maxAttempts?: number },
): { id: number } {
  const db = initDb()
  const runAfterMs = typeof opts?.runAfterMs === "number" ? opts.runAfterMs : null
  const maxAttempts = typeof opts?.maxAttempts === "number" ? opts.maxAttempts : 3
  const info = db
    .prepare(
      `
      INSERT INTO jobs
        (type, payload_json, status, created_at, attempts, max_attempts, run_after_ms)
      VALUES
        (?, ?, 'queued', ?, 0, ?, ?)
    `,
    )
    .run(type, JSON.stringify(payload ?? {}), nowIso(), maxAttempts, runAfterMs)
  return { id: Number(info.lastInsertRowid) }
}

export function getJobById(id: number): JobRow | null {
  const db = initDb()
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id)
  return row ? mapJobRow(row) : null
}

export function listJobs(opts?: { status?: JobStatus; limit?: number }): JobRow[] {
  const db = initDb()
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500)
  if (opts?.status) {
    const rows = db
      .prepare(`SELECT * FROM jobs WHERE status = ? ORDER BY id DESC LIMIT ?`)
      .all(opts.status, limit)
    return (rows as any[]).map(mapJobRow)
  }
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY id DESC LIMIT ?`).all(limit)
  return (rows as any[]).map(mapJobRow)
}

type Handler = (payload: any) => Promise<any> | any

const handlers: Record<string, Handler> = {
  noop: async (payload: any) => ({ ok: true, payload }),
}

export function registerJobHandler(type: string, handler: Handler) {
  handlers[type] = handler
}

function randomWorkerId(): string {
  return crypto.randomBytes(8).toString("hex")
}

function claimNextJob(workerId: string, lockTtlMs: number): any | null {
  const db = initDb()
  const now = Date.now()
  const expiredBefore = now - lockTtlMs

  return db.transaction(() => {
    const row = db
      .prepare(
        `
        SELECT *
        FROM jobs
        WHERE status = 'queued'
          AND (run_after_ms IS NULL OR run_after_ms <= ?)
          AND (locked_at_ms IS NULL OR locked_at_ms < ?)
        ORDER BY id ASC
        LIMIT 1
      `,
      )
      .get(now, expiredBefore)

    if (!row) return null

    const updated = db
      .prepare(
        `
        UPDATE jobs
        SET status = 'running',
            started_at = COALESCE(started_at, ?),
            locked_by = ?,
            locked_at_ms = ?,
            attempts = attempts + 1
        WHERE id = ?
          AND status = 'queued'
      `,
      )
      .run(nowIso(), workerId, now, row.id)

    if (updated.changes !== 1) return null
    return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(row.id)
  })()
}

function completeJob(id: number, result: any) {
  const db = initDb()
  db.prepare(
    `
    UPDATE jobs
    SET status = 'succeeded',
        result_json = ?,
        finished_at = ?,
        locked_by = NULL,
        locked_at_ms = NULL
    WHERE id = ?
  `,
  ).run(JSON.stringify(result ?? null), nowIso(), id)
}

function failJob(id: number, error: string, retryDelayMs: number | null) {
  const db = initDb()
  const job = db.prepare(`SELECT id, attempts, max_attempts FROM jobs WHERE id = ?`).get(id) as any
  const attempts = job?.attempts ?? 1
  const maxAttempts = job?.max_attempts ?? 3
  const shouldRetry = attempts < maxAttempts && retryDelayMs != null
  if (shouldRetry) {
    db.prepare(
      `
      UPDATE jobs
      SET status = 'queued',
          error = ?,
          locked_by = NULL,
          locked_at_ms = NULL,
          run_after_ms = ?
      WHERE id = ?
    `,
    ).run(error, Date.now() + retryDelayMs, id)
    return
  }

  db.prepare(
    `
    UPDATE jobs
    SET status = 'failed',
        error = ?,
        finished_at = ?,
        locked_by = NULL,
        locked_at_ms = NULL
    WHERE id = ?
  `,
  ).run(error, nowIso(), id)
}

let _workerStarted = false
let _workerId: string | null = null

export function startQueueWorker(opts?: { pollIntervalMs?: number; lockTtlMs?: number }) {
  if (_workerStarted) return
  _workerStarted = true
  _workerId = randomWorkerId()

  const pollIntervalMs = Math.min(Math.max(opts?.pollIntervalMs ?? 500, 100), 5000)
  const lockTtlMs = Math.min(Math.max(opts?.lockTtlMs ?? 60_000, 5_000), 10 * 60_000)

  const tick = async () => {
    try {
      const row = claimNextJob(_workerId!, lockTtlMs)
      if (!row) return

      const job = mapJobRow(row)
      const handler = handlers[job.type]
      if (!handler) {
        failJob(job.id, `No handler registered for type: ${job.type}`, null)
        return
      }

      const result = await handler(job.payload)
      completeJob(job.id, result)
    } catch (err) {
      // swallow; next tick will retry
    }
  }

  // eslint-disable-next-line no-undef
  setInterval(() => void tick(), pollIntervalMs)
}

