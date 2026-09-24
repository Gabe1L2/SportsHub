import { useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { displayEnum, money, type BetStatus } from './types'
import { Modal, primaryButton, secondaryButton } from './ui'

type ImportIssue = { rowNumber: number; severity: 'Error' | 'Warning'; message: string }
type ImportSample = { rowNumber: number; placedAtUtc: string; platform: string; legCount: number; entryCost: number; expectedPayout: number; status: BetStatus; source: string | null; isDuplicate: boolean; isBonusCredit: boolean }
type ImportPreview = {
  totalRows: number; readyRows: number; duplicateRows: number; rejectedRows: number; warningCount: number; bonusCreditRows: number
  platformsToCreate: string[]; sourcesToCreate: string[]; issues: ImportIssue[]; samples: ImportSample[]
}
type ImportResult = { importedRows: number; duplicateRows: number; rejectedRows: number; platformsCreated: number; sourcesCreated: number }

function upload<T>(path: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return api<T>(path, { method: 'POST', body: form })
}

export function BetCsvImporter({ onClose }: { onClose: () => void }) {
  const client = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const previewImport = useMutation({ mutationFn: (selected: File) => upload<ImportPreview>('/api/betting/imports/csv/preview', selected), onSuccess: setPreview })
  const commitImport = useMutation({
    mutationFn: (selected: File) => upload<ImportResult>('/api/betting/imports/csv', selected),
    onSuccess: imported => { setResult(imported); void client.invalidateQueries({ queryKey: ['betting'] }) },
  })

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setPreview(null); setResult(null); setError('')
  }
  async function previewFile() {
    if (!file) return
    setError('')
    try { await previewImport.mutateAsync(file) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to preview the CSV.') }
  }
  async function importFile() {
    if (!file || !preview) return
    setError('')
    if (!window.confirm(`Import ${preview.readyRows.toLocaleString()} rows? Duplicate and rejected rows will be skipped.`)) return
    try { await commitImport.mutateAsync(file) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to import the CSV.') }
  }

  return <Modal title="Import bet history" description="Preview a Google Sheets CSV before anything is saved." onClose={onClose} wide>
    <div className="space-y-5 p-6">
      {!result && <div className="rounded-2xl border border-dashed border-white/15 bg-white/[.025] p-5">
        <label className="block text-sm font-semibold text-slate-200">Google Sheets CSV</label>
        <input className="mt-3 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:font-bold file:text-emerald-950 hover:file:bg-emerald-300" type="file" accept=".csv,text/csv" onChange={chooseFile} />
        <p className="mt-3 text-xs text-slate-500">Times are read as America/Chicago. Payout is treated as the total amount returned. “Me” is imported as Myself / no saved source.</p>
        <button type="button" className={`${secondaryButton} mt-4`} disabled={!file || previewImport.isPending} onClick={() => void previewFile()}>{previewImport.isPending ? 'Checking…' : 'Preview import'}</button>
      </div>}

      {preview && !result && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Ready" value={preview.readyRows} tone="good" />
          <Stat label="Duplicates" value={preview.duplicateRows} />
          <Stat label="Rejected" value={preview.rejectedRows} tone={preview.rejectedRows ? 'bad' : undefined} />
          <Stat label="Warnings" value={preview.warningCount} />
        </div>
        <p className="text-sm text-slate-400">Found {preview.totalRows.toLocaleString()} sheet rows, including {preview.bonusCreditRows.toLocaleString()} bonus/free-credit rows. The first manually entered bet should appear under Duplicates.</p>
        {(preview.platformsToCreate.length > 0 || preview.sourcesToCreate.length > 0) && <div className="grid gap-3 sm:grid-cols-2">
          <LookupList title="New platforms" values={preview.platformsToCreate} empty="All platforms already exist." />
          <LookupList title="New sources" values={preview.sourcesToCreate} empty="All sources already exist." />
        </div>}
        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-[55px_1.4fr_.7fr_.7fr_80px] gap-2 border-b border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>Row</span><span>Platform / date</span><span>Entry</span><span>Payout</span><span>Result</span></div>
          <div className="divide-y divide-white/[.06]">{preview.samples.map(sample => <div key={sample.rowNumber} className="grid grid-cols-[55px_1.4fr_.7fr_.7fr_80px] gap-2 px-3 py-2 text-xs">
            <span className="text-slate-500">{sample.rowNumber}</span><span className="min-w-0"><strong className="block truncate">{sample.platform}{sample.isBonusCredit ? ' · credit' : ''}</strong><span className="text-slate-500">{new Date(sample.placedAtUtc).toLocaleString()}</span></span><span>{money(sample.entryCost)}</span><span>{money(sample.expectedPayout)}</span><span className={sample.isDuplicate ? 'text-amber-300' : 'text-slate-300'}>{sample.isDuplicate ? 'Duplicate' : displayEnum(sample.status)}</span>
          </div>)}</div>
        </div>
        {preview.issues.length > 0 && <details className="rounded-xl border border-white/10 bg-white/[.02] p-4"><summary className="cursor-pointer text-sm font-semibold">Review warnings and rejected rows ({preview.issues.length}{preview.warningCount + preview.rejectedRows > preview.issues.length ? '+' : ''})</summary><div className="mt-3 max-h-48 space-y-2 overflow-y-auto">{preview.issues.map((issue, index) => <p key={`${issue.rowNumber}-${index}`} className={`text-xs ${issue.severity === 'Error' ? 'text-rose-300' : 'text-amber-200'}`}><strong>Row {issue.rowNumber}:</strong> {issue.message}</p>)}</div></details>}
      </>}

      {result && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-6"><h3 className="text-xl font-black text-emerald-200">Import complete</h3><p className="mt-2 text-sm text-emerald-100/80">Imported {result.importedRows.toLocaleString()} bets and skipped {result.duplicateRows.toLocaleString()} duplicates{result.rejectedRows ? ` and ${result.rejectedRows.toLocaleString()} rejected rows` : ''}. Created {result.platformsCreated} platforms and {result.sourcesCreated} sources.</p></div>}
      {error && <p className="rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
    </div>
    <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-5"><button type="button" className={secondaryButton} onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>{preview && !result && <button type="button" className={primaryButton} disabled={preview.readyRows === 0 || commitImport.isPending} onClick={() => void importFile()}>{commitImport.isPending ? 'Importing…' : `Import ${preview.readyRows.toLocaleString()} rows`}</button>}</div>
  </Modal>
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) { return <div className="rounded-xl border border-white/10 bg-white/[.035] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-xl font-black ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white'}`}>{value.toLocaleString()}</p></div> }
function LookupList({ title, values, empty }: { title: string; values: string[]; empty: string }) { return <div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><h3 className="text-sm font-bold">{title}</h3><p className="mt-2 text-xs text-slate-400">{values.length ? values.join(', ') : empty}</p></div> }
