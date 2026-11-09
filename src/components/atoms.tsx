import type { ReactNode } from "react"

export function Brand() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-emerald-900 text-white">
        lg.
      </span>{" "}
      la gente dice
    </div>
  )
}
export function Button({
  children,
  secondary = false,
  onClick,
  className = "",
  loading = false,
}: {
  children: ReactNode
  secondary?: boolean
  onClick?: () => void
  className?: string
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className={`${secondary ? "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100" : "bg-emerald-900 text-white hover:bg-emerald-800"} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {loading && (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      <span>{loading ? "Cargando…" : children}</span>
    </button>
  )
}
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-lg bg-stone-200 ${className}`}
      aria-hidden="true"
    />
  )
}
export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen px-5 py-7 sm:px-8 sm:py-10">
      <div className={`mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
        <header className="mb-12 flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="text-xs font-semibold text-stone-500 hover:text-emerald-800"
          >
            ← Regresar
          </button>
          <Brand />
          <span className="text-xs text-stone-400">Juego de respuestas populares</span>
        </header>
        {children}
      </div>
    </main>
  )
}
export function Heading({ k, title, detail }: { k: string; title: string; detail?: string }) {
  return (
    <div className="mb-8">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.17em] text-emerald-800">
        {k}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {detail && <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{detail}</p>}
    </div>
  )
}
export function Score({ blue = 180, red = 125 }: { blue?: number; red?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-medium text-blue-800">Equipo Azul</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-blue-950">
          {blue} <span className="text-xs font-normal">pts</span>
        </p>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-medium text-red-800">Equipo Rojo</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-red-950">
          {red} <span className="text-xs font-normal">pts</span>
        </p>
      </div>
    </div>
  )
}
export function Strikes({ count = 0, light = false }: { count?: number; light?: boolean }) {
  return (
    <div className="flex gap-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`grid size-11 place-items-center rounded-xl border-2 text-2xl font-black ${i < count ? "border-red-600 bg-red-600 text-white" : light ? "border-white/20 bg-white/10 text-white/30" : "border-stone-200 bg-stone-50 text-stone-300"}`}
        >
          ×
        </span>
      ))}
    </div>
  )
}
