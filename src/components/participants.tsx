import { X } from "lucide-react"
import { CountPill } from "./atoms"

export type ParticipantTeamColor = "blue" | "red"

type TeamNameFieldProps = {
  color: ParticipantTeamColor
  value: string
  onChange: (value: string) => void
}

export function TeamNameField({ color, value, onChange }: TeamNameFieldProps) {
  const teamLabel = color === "blue" ? "Azul" : "Rojo"

  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className={`inline-block size-2.5 rounded-full ${color === "blue" ? "bg-blue-600" : "bg-red-600"}`}
        aria-hidden="true"
      />
      <input
        aria-label={`Nombre del equipo ${teamLabel}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Equipo ${teamLabel}`}
        className="w-full border-b border-stone-200 bg-transparent pb-2 text-lg font-semibold outline-none placeholder:text-stone-400"
      />
    </div>
  )
}

export function ParticipantsSubtitle({ count }: { count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-xs font-medium text-stone-500">Participantes</p>
      <CountPill count={count} label={count === 1 ? "participante" : "participantes"} />
    </div>
  )
}

type ParticipantRowProps = {
  color: ParticipantTeamColor
  index: number
  value: string
  onChange: (value: string) => void
  onRemove: () => void
  canRemove?: boolean
}

export function ParticipantRow({
  color,
  index,
  value,
  onChange,
  onRemove,
  canRemove = true,
}: ParticipantRowProps) {
  const teamLabel = color === "blue" ? "Azul" : "Rojo"
  const filled = value.trim().length > 0

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-stone-50 px-3 py-3 transition focus-within:border-emerald-600 focus-within:bg-white ${filled ? "border-stone-200 border-solid bg-white" : "border-dashed border-stone-200"}`}
      data-participant-row=""
    >
      <span className="w-5 text-xs text-stone-400" data-participant-index="">
        {index + 1}.
      </span>
      <input
        aria-label={`Participante ${index + 1} del equipo ${teamLabel}`}
        data-participant-input=""
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Nombre del participante ${index + 1}`}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
          event.preventDefault()
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement>("[data-participant-input]")
          )
          const currentIndex = inputs.indexOf(event.currentTarget)
          const nextIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1)
          inputs[nextIndex]?.focus()
        }}
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-stone-400 hover:text-red-600"
          aria-label="Eliminar participante"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
