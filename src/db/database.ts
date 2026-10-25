import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CategoryId } from '../lib/categories'
import type { TaxBand } from '../lib/sipp'

export interface ReceiptRecord {
  id: string
  /** Blob of the original photo, kept for proof / re-OCR. */
  photo: Blob
  /** Data-URL thumbnail for fast list rendering. */
  thumbnail: string
  merchant: string
  amount: number
  date: string // ISO YYYY-MM-DD
  category: CategoryId
  note?: string
  /** "rental" entries feed the property summary, "sipp" is informational. */
  source: 'rental' | 'sipp' | 'other'
  createdAt: string
}

export interface RentalRecord {
  id: string
  category: CategoryId
  amount: number
  date: string
  note?: string
}

export interface SippRecord {
  id: string
  netAmount: number
  date: string
  provider?: string
  note?: string
}

export interface SettingsRecord {
  id: 'settings'
  taxBand: TaxBand
  defaultSource: 'rental' | 'sipp' | 'other'
}

interface TaxTrackDB extends DBSchema {
  receipts: {
    key: string
    value: ReceiptRecord
    indexes: { byDate: string; byCategory: CategoryId }
  }
  rental: {
    key: string
    value: RentalRecord
    indexes: { byDate: string }
  }
  sipp: {
    key: string
    value: SippRecord
    indexes: { byDate: string }
  }
  settings: {
    key: string
    value: SettingsRecord
  }
}

const DB_NAME = 'taxtrack-uk'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TaxTrackDB>> | null = null

export function getDB(): Promise<IDBPDatabase<TaxTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TaxTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('receipts', { keyPath: 'id' }).createIndex('byDate', 'date')
        db.createObjectStore('receipts').createIndex('byCategory', 'category')
        db.createObjectStore('rental', { keyPath: 'id' }).createIndex('byDate', 'date')
        db.createObjectStore('sipp', { keyPath: 'id' }).createIndex('byDate', 'date')
        db.createObjectStore('settings', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export function newId(): string {
  return crypto.randomUUID()
}

// ---------- Receipts ----------

export async function addReceipt(record: ReceiptRecord): Promise<void> {
  const db = await getDB()
  await db.put('receipts', record)
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('receipts', id)
}

export async function listReceipts(): Promise<ReceiptRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('receipts', 'byDate')
  return all.reverse()
}

// ---------- Rental entries ----------

export async function addRentalEntry(record: RentalRecord): Promise<void> {
  const db = await getDB()
  await db.put('rental', record)
}

export async function deleteRentalEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('rental', id)
}

export async function listRentalEntries(): Promise<RentalRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('rental', 'byDate')
  return all.reverse()
}

// ---------- SIPP contributions ----------

export async function addSippContribution(record: SippRecord): Promise<void> {
  const db = await getDB()
  await db.put('sipp', record)
}

export async function deleteSippContribution(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sipp', id)
}

export async function listSippContributions(): Promise<SippRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sipp', 'byDate')
  return all.reverse()
}

// ---------- Settings ----------

export async function getSettings(): Promise<SettingsRecord> {
  const db = await getDB()
  const existing = await db.get('settings', 'settings')
  if (existing) return existing
  const defaults: SettingsRecord = {
    id: 'settings',
    taxBand: 'basic',
    defaultSource: 'rental',
  }
  await db.put('settings', defaults)
  return defaults
}

export async function saveSettings(settings: SettingsRecord): Promise<void> {
  const db = await getDB()
  await db.put('settings', settings)
}
