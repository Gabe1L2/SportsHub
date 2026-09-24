import { type ReactNode } from 'react'

export const inputClass = 'mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButton = 'rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
export const primaryButton = 'rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50'

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-slate-200 ${className}`}>{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm md:p-8" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`my-auto w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} rounded-3xl border border-white/10 bg-[#0d1828] shadow-2xl shadow-black/50`}>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div><h2 className="text-xl font-black text-white">{title}</h2>{description && <p className="mt-1 text-sm text-slate-400">{description}</p>}</div>
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-xl text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
      </div>
      {children}
    </div>
  </div>
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-white/15 bg-white/[.025] px-6 py-14 text-center">
    <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-400/10 text-2xl text-emerald-300">◎</div>
    <h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{detail}</p>{action && <div className="mt-5">{action}</div>}
  </div>
}
