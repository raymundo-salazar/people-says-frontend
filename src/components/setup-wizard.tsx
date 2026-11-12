import { ArrowLeft, ArrowRight, Bot, Check, MicVocal, MonitorSmartphone, Plus, Trash2 } from "lucide-react"
import { Button, Heading, Shell, WizardProgress } from "./atoms"
import { ParticipantRow, ParticipantsSubtitle, TeamNameField } from "./participants"

export type SetupMode = "classic" | "auto"
export type SetupTeam = { name: string; color: "blue" | "red"; players: string[] }
export type SetupRound = { answerCount: string; multiplier: 1 | 2 | 3 }
export type SetupModeOption = { id: SetupMode; title: string; detail: string; devices: string }
export type SetupCategory = { id: number; name: string; description: string; questionCount: number }
const modeIcons = { classic: MicVocal, auto: Bot }

type GameSetupProps = {
  editing: boolean
  gameName: string
  mode: SetupMode
  modes: SetupModeOption[]
  valid: boolean
  loading: boolean
  error: string
  onGameNameChange: (value: string) => void
  onModeChange: (mode: SetupMode) => void
  onContinue: () => void
  categories: SetupCategory[]
  selectedCategoryIds: number[]
  onCategoryToggle: (id: number) => void
}

export function GameSetupStep({
  editing,
  gameName,
  mode,
  modes,
  valid,
  loading,
  error,
  onGameNameChange,
  onModeChange,
  onContinue,
  categories,
  selectedCategoryIds,
  onCategoryToggle,
}: GameSetupProps) {
  return (
    <Shell showBack={false}>
      <WizardProgress step={1} />
      <Heading
        k={editing ? "01 / Edición" : "01 / Preparación"}
        title={editing ? "Editar partida" : "Crear una partida"}
        detail={
          editing ? "Actualiza la configuración de tu partida." : "Selecciona el modo de juego."
        }
      />
      <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-stone-500">
            Nombre de la partida <span className="text-red-600">*</span>
          </span>
          <input
            required
            value={gameName}
            onChange={(event) => onGameNameChange(event.target.value)}
            placeholder="Nombre de la partida"
            className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.id === "auto"}
              onClick={() => item.id !== "auto" && onModeChange(item.id)}
              aria-pressed={mode === item.id}
              className={`relative min-h-32 overflow-hidden rounded-xl border p-4 text-left transition ${item.id === "auto" ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400" : mode === item.id ? "cursor-pointer border-emerald-700 bg-emerald-50" : "cursor-pointer border-stone-200 hover:border-emerald-500"}`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-4 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full border ${mode === item.id ? "border-emerald-700" : "border-stone-300"}`}
              >
                {mode === item.id && <span className="size-2.5 rounded-full bg-emerald-700" />}
              </span>
              {item.id === "auto" && (
                <span className="pointer-events-none absolute right-[-2.3rem] top-7 w-36 rotate-45 bg-amber-300 py-1 text-center text-[9px] font-black uppercase tracking-wider text-amber-950 shadow-sm">
                  Próximamente
                </span>
              )}
              <div className="flex items-center gap-3 pl-8">
                <span className={`grid size-12 shrink-0 place-items-center rounded-lg ${item.id === "auto" ? "bg-stone-100 text-stone-400" : mode === item.id ? "bg-emerald-900 text-white" : "bg-emerald-50 text-emerald-900"}`}>
                  {(() => { const Icon = modeIcons[item.id]; return <Icon size={20} strokeWidth={1.8} aria-hidden="true" /> })()}
                </span>
                <span>
                  <b className={`block text-sm font-bold uppercase tracking-wider ${item.id === "auto" ? "text-stone-400" : "text-emerald-800"}`}>{item.title}</b>
                  <small className="mt-1 block text-xs text-stone-500">{item.detail}</small>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
                    <MonitorSmartphone size={14} strokeWidth={1.8} aria-hidden="true" />
                    {item.devices}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-medium text-stone-500">
              Categorías de preguntas <span className="text-red-600">*</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => {
                const selected = selectedCategoryIds.includes(category.id)
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={category.questionCount === 0}
                    onClick={() => onCategoryToggle(category.id)}
                    className={`relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-xl border p-3 text-left transition ${category.questionCount === 0 ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400" : selected ? "border-emerald-700 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-500"}`}
                  >
                    {category.questionCount === 0 && <span className="pointer-events-none absolute right-[-2.3rem] top-5 w-36 rotate-45 bg-amber-300 py-1 text-center text-[9px] font-black uppercase tracking-wider text-amber-950 shadow-sm">Próximamente</span>}
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${selected ? "border-emerald-700 bg-emerald-900 text-white" : "border-stone-300 text-transparent"}`}>
                      <Check size={13} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span>
                      <b className="block text-sm">{category.name}</b>
                      <small className="mt-1 block text-xs leading-5 text-stone-500">{category.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span aria-hidden="true" />
          <Button disabled={!valid} loading={loading} onClick={onContinue}>
            Continuar <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </Shell>
  )
}

type TeamsStepProps = {
  teams: SetupTeam[]
  valid: boolean
  loading: boolean
  onTeamsChange: (teams: SetupTeam[]) => void
  onBack: () => void
  onContinue: () => void
}

export function TeamsStep({
  teams,
  valid,
  loading,
  onTeamsChange,
  onBack,
  onContinue,
}: TeamsStepProps) {
  const updateTeam = (index: number, update: Partial<SetupTeam>) =>
    onTeamsChange(
      teams.map((team, teamIndex) => (teamIndex === index ? { ...team, ...update } : team))
    )

  return (
    <Shell>
      <WizardProgress step={2} />
      <Heading
        k="02 / Participantes"
        title="Arma tus equipos"
        detail="Los cambios se guardan en la partida."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team, index) => {
          const participantCount = team.players.filter((player) => player.trim()).length
          return (
            <section key={team.color} className="rounded-2xl border border-stone-200 bg-white p-5">
              <TeamNameField
                color={team.color}
                value={team.name}
                onChange={(name) => updateTeam(index, { name })}
              />
              <ParticipantsSubtitle count={participantCount} />
              <div className="space-y-2">
                {team.players.map((player, playerIndex) => (
                  <ParticipantRow
                    key={`${team.color}-player-${playerIndex}`}
                    color={team.color}
                    index={playerIndex}
                    value={player}
                    canRemove={team.players.length > 1}
                    onChange={(value) => {
                      const players = team.players.map((name, currentIndex) =>
                        currentIndex === playerIndex ? value : name
                      )
                      if (value.trim() && playerIndex === team.players.length - 1) {
                        players.push("")
                      }
                      updateTeam(index, { players })
                    }}
                    onRemove={() =>
                      updateTeam(index, {
                        players: team.players.filter(
                          (_, currentIndex) => currentIndex !== playerIndex
                        ),
                      })
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                className="mt-4 text-xs font-semibold text-emerald-800"
                onClick={() => updateTeam(index, { players: [...team.players, ""] })}
              >
                + Agregar integrante
              </button>
            </section>
          )
        })}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button ghost onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Atrás
        </Button>
        <Button disabled={!valid} loading={loading} onClick={onContinue}>
          Continuar <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </Shell>
  )
}

type RoundsStepProps = {
  rounds: SetupRound[]
  allowedAnswerCounts: number[]
  valid: boolean
  canAdd: boolean
  loading: boolean
  onRoundsChange: (rounds: SetupRound[]) => void
  onAdd: () => void
  onBack: () => void
  onSave: () => void
}

export function RoundsStep({
  rounds,
  allowedAnswerCounts,
  valid,
  canAdd,
  loading,
  onRoundsChange,
  onAdd,
  onBack,
  onSave,
}: RoundsStepProps) {
  return (
    <Shell>
      <WizardProgress step={3} />
      <Heading
        k="03 / Configuración"
        title="Diseña las rondas"
        detail="Cada ronda usa una pregunta con 4 a 10 respuestas."
      />
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-x-3 gap-y-2 text-sm">
          <p className="font-semibold text-stone-500">Número de ronda</p>
          <p className="font-semibold text-stone-500">Cantidad de preguntas</p>
          <p className="font-semibold text-stone-500">Multiplicador</p>
          <span aria-hidden="true" />
          {rounds.map((round, index) => (
            <div className="contents" key={index}>
              <span className="flex items-center">{index + 1}</span>
              <select
                value={round.answerCount}
                onChange={(event) =>
                  onRoundsChange(
                    rounds.map((item, roundIndex) =>
                      roundIndex === index ? { ...item, answerCount: event.target.value } : item
                    )
                  )
                }
                className="w-full rounded-xl border border-stone-200 px-3 py-2"
              >
                {allowedAnswerCounts.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
              <select
                value={round.multiplier}
                onChange={(event) =>
                  onRoundsChange(
                    rounds.map((item, roundIndex) =>
                      roundIndex === index
                        ? { ...item, multiplier: Number(event.target.value) as 1 | 2 | 3 }
                        : item
                    )
                  )
                }
                className="rounded-xl border border-stone-200 px-2 py-2 text-sm"
              >
                <option value="1">x1</option>
                <option value="2">x2</option>
                <option value="3">x3</option>
              </select>
              {rounds.length > 3 ? (
                <button
                  type="button"
                  aria-label={`Eliminar ronda ${index + 1}`}
                  className="grid size-9 place-items-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() =>
                    onRoundsChange(rounds.filter((_, roundIndex) => roundIndex !== index))
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          <Plus size={16} aria-hidden="true" /> Agregar ronda
        </button>
        {!valid && (
          <p className="mt-4 text-sm text-red-700">
            Configura entre 3 y 7 rondas usando 10, 8, 6, 5 o 4 preguntas en orden descendente.
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button ghost onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Atrás
          </Button>
          <Button loading={loading} onClick={onSave}>
            Guardar configuración <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Shell>
  )
}
