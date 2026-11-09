import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react"
import { Button, Heading, Shell, WizardProgress } from "./atoms"
import { ParticipantRow, ParticipantsSubtitle, TeamNameField } from "./participants"

export type SetupMode = "classic" | "stage" | "buttons" | "auto"
export type SetupTeam = { name: string; color: "blue" | "red"; players: string[] }
export type SetupRound = { answerCount: string; multiplier: 1 | 2 | 3 }
export type SetupModeOption = { id: SetupMode; title: string; detail: string }

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
              onClick={() => onModeChange(item.id)}
              className={`rounded-xl border p-4 text-left ${mode === item.id ? "border-emerald-700 bg-emerald-50" : "border-stone-200"}`}
            >
              <b className="block text-sm">{item.title}</b>
              <small className="text-stone-500">{item.detail}</small>
            </button>
          ))}
        </div>
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
