import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, Monitor, Trash2, X } from "lucide-react"
import { gameSocket } from "./socket"
import {
  Button,
  Heading,
  Score,
  Shell,
  Skeleton,
  Strikes,
  WizardProgress,
} from "./components/atoms"

type Screen =
  | "home"
  | "rules"
  | "create"
  | "teams"
  | "rounds"
  | "lobby"
  | "join"
  | "host"
  | "faceoff"
  | "decision"
  | "display"
  | "buzzer"
  | "steal"
  | "roundResult"
  | "final"
type Mode = "classic" | "stage" | "buttons" | "auto"
type Team = { name: string; color: "blue" | "red"; players: string[] }
type RoundDraft = { answerCount: string; multiplier: 1 | 2 | 3 }
type Answer = { text: string; points: number }
type State = {
  phase: string
  roundIndex: number
  roundConfigs: Array<{ answerCount: number; multiplier: number }>
  questionPrompt?: string
  answers?: Answer[]
  answerCount?: number
  revealed: number[]
  strikes: { blue: number; red: number }
  pot: number
  scores: { blue: number; red: number }
  control: "blue" | "red" | null
  teams: [{ name: string; players: string[] }, { name: string; players: string[] }]
}
const api = import.meta.env.VITE_API_URL ?? ""
const defaultState: State = {
  phase: "lobby",
  roundIndex: 0,
  roundConfigs: [{ answerCount: 10, multiplier: 1 }],
  revealed: [],
  strikes: { blue: 0, red: 0 },
  pot: 0,
  scores: { blue: 0, red: 0 },
  control: null,
  teams: [
    { name: "Azul", players: ["Ana"] },
    { name: "Rojo", players: ["Sofía"] },
  ],
}
const modes: { id: Mode; title: string; detail: string }[] = [
  { id: "classic", title: "Juego clásico", detail: "Un dispositivo para el presentador." },
  { id: "stage", title: "Modo escenario", detail: "Pantalla pública y presentador." },
  { id: "buttons", title: "Modo botones", detail: "Pulsadores digitales por equipo." },
  { id: "auto", title: "Modo automático", detail: "La máquina dirige la partida." },
]

export default function App() {
  const [screen, setScreenState] = useState<Screen>(
    () => (window.location.hash.replace("#", "") as Screen) || "home"
  )
  const [mode, setMode] = useState<Mode>("classic")
  const [state, setState] = useState<State>(defaultState)
  const [gameName, setGameName] = useState("")
  const [teams, setTeams] = useState<Team[]>([
    { name: "Azul", color: "blue", players: [""] },
    { name: "Rojo", color: "red", players: [""] },
  ])
  const [rounds, setRounds] = useState<RoundDraft[]>([
    { answerCount: "10", multiplier: 1 },
    { answerCount: "8", multiplier: 1 },
    { answerCount: "6", multiplier: 1 },
    { answerCount: "5", multiplier: 2 },
    { answerCount: "4", multiplier: 3 },
  ])
  const [roomCode, setRoomCode] = useState(
    () => localStorage.getItem("people-says-room-code") ?? ""
  )
  const [hostToken, setHostToken] = useState(
    () => localStorage.getItem("people-says-host-token") ?? ""
  )
  const [deviceToken] = useState(() => {
    const existing = localStorage.getItem("people-says-device-token")
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem("people-says-device-token", created)
    return created
  })
  const [joinCode, setJoinCode] = useState("")
  const [stealIndex, setStealIndex] = useState(0)
  const [stealText, setStealText] = useState("")
  const [buzzerWinner, setBuzzerWinner] = useState<"blue" | "red" | null>(null)
  const [buttonRole, setButtonRole] = useState<"blue_button" | "red_button">("blue_button")
  const [devices, setDevices] = useState<Array<{ role: string }>>([])
  const [error, setError] = useState("")
  const [loadingAction, setLoadingAction] = useState<
    "create" | "teams" | "rounds" | "start" | null
  >(null)
  const answers =
    state.answers ?? Array.from({ length: state.answerCount ?? 0 }, () => ({ text: "", points: 0 }))
  const revealed = state.revealed ?? []
  const blue = state.scores?.blue ?? 0
  const red = state.scores?.red ?? 0
  const validRounds = rounds.every(
    (round, i) =>
      Number.isInteger(Number(round.answerCount)) &&
      Number(round.answerCount) >= 4 &&
      Number(round.answerCount) <= 10 &&
      (i === 0 || Number(round.answerCount) < Number(rounds[i - 1].answerCount))
  )
  const validGameSetup = gameName.trim().length > 0
  const validTeams = teams.every(
    (team) => team.name.trim().length > 0 && team.players.some((player) => player.trim().length > 0)
  )
  const validJoinCode = joinCode.trim().length >= 5
  const setScreen = (next: Screen) => {
    window.history.pushState({ screen: next }, "", `#${next}`)
    setScreenState(next)
  }
  useEffect(() => {
    const onPopState = () =>
      setScreenState((window.location.hash.replace("#", "") as Screen) || "home")
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
  const emitAction = (action: Record<string, unknown>) =>
    gameSocket.emit("game:action", { code: roomCode, hostToken, action })
  useEffect(() => {
    if (!roomCode || !["host", "display", "buzzer"].includes(screen)) return
    gameSocket.connect()
    const role = screen === "buzzer" ? buttonRole : screen
    gameSocket.emit("room:join", { code: roomCode, role, hostToken, deviceToken })
    const receive = (payload: { state?: State }) => {
      if (payload.state) setState(payload.state)
    }
    const presence = (payload: { devices?: Array<{ role: string }> }) =>
      setDevices(payload.devices ?? [])
    const failure = (payload: { error?: string }) => setError(payload.error ?? "Error de conexión")
    const buzzer = (payload: { winner?: "blue" | "red" }) => setBuzzerWinner(payload.winner ?? null)
    gameSocket.on("room:snapshot", receive)
    gameSocket.on("game:state", receive)
    gameSocket.on("room:presence", presence)
    gameSocket.on("game:error", failure)
    gameSocket.on("buzzer:winner", buzzer)
    gameSocket.on("buzzer:reset", () => setBuzzerWinner(null))
    return () => {
      gameSocket.off("room:snapshot", receive)
      gameSocket.off("game:state", receive)
      gameSocket.off("room:presence", presence)
      gameSocket.off("game:error", failure)
      gameSocket.off("buzzer:winner", buzzer)
      gameSocket.off("buzzer:reset")
      gameSocket.disconnect()
    }
  }, [roomCode, screen, hostToken, deviceToken, buttonRole])
  const createRoom = async (finalize = false) => {
    setError("")
    const normalizedTeams = teams.map((team) => ({
      ...team,
      name: team.name.trim(),
      players: team.players.map((player) => player.trim()).filter(Boolean),
    }))
    if (finalize && normalizedTeams.some((team) => !team.name || team.players.length === 0)) {
      setError("Completa el nombre y al menos un jugador en cada equipo")
      return
    }
    setLoadingAction(finalize ? "rounds" : "create")
    try {
      const response = await fetch(`${api}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          name: gameName.trim() || undefined,
          rounds: rounds.map((round) => ({
            answerCount: Number(round.answerCount),
            multiplier: round.multiplier,
          })),
          teams: normalizedTeams,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setRoomCode(data.code)
      setHostToken(data.hostToken)
      localStorage.setItem("people-says-device-token", data.deviceToken)
      setState({
        ...data.state,
        questionPrompt: data.question.prompt,
        answers: data.question.answers,
      })
      localStorage.setItem("people-says-room-code", data.code)
      localStorage.setItem("people-says-host-token", data.hostToken)
      setScreen(finalize ? "lobby" : "teams")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la sala")
    } finally {
      setLoadingAction(null)
    }
  }
  const saveTeams = () => setScreen("rounds")
  const saveRounds = async () => {
    if (!validRounds) return
    setLoadingAction("rounds")
    await createRoom(true)
    setLoadingAction(null)
  }
  const start = () => {
    setLoadingAction("start")
    emitAction({ type: "start" })
    window.setTimeout(() => {
      setLoadingAction(null)
      setScreen("faceoff")
    }, 350)
  }
  const reveal = (index: number) => {
    if (!revealed.includes(index)) emitAction({ type: "reveal_answer", index })
  }
  const teamId = state.control ?? "blue"
  const teamName = teamId === "blue" ? teams[0].name : teams[1].name
  useEffect(() => {
    if (state.phase === "final") setScreen("final")
    if (state.phase === "steal" && screen === "host") setScreen("steal")
    if (state.phase === "decision" && screen === "faceoff") setScreen("decision")
    if (state.phase === "turn" && (screen === "faceoff" || screen === "decision")) setScreen("host")
  }, [state.phase, screen])
  if (screen === "home")
    return (
      <Shell showBack={false}>
        <div className="mx-auto max-w-2xl py-12 text-center">
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-emerald-800">
            Para jugar juntos
          </p>
          <h1 className="text-6xl font-semibold leading-[1.05] tracking-tight sm:text-8xl">
            La gente
            <br />
            <span className="text-emerald-800">dice.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-md text-base leading-7 text-stone-500">
            ¿Qué respondería la mayoría? Forma tus equipos y descubre las respuestas.
          </p>
          <div className="mx-auto mt-10 flex max-w-xs flex-col gap-3">
            <Button onClick={() => setScreen("create")}>
              Crear una partida <ExternalLink size={16} aria-hidden="true" />
            </Button>
            <Button secondary onClick={() => setScreen("join")}>
              Unirme con código
            </Button>
          </div>
          <button
            onClick={() => setScreen("rules")}
            className="mt-9 text-xs font-semibold text-emerald-800 underline"
          >
            Instrucciones y reglas
          </button>
        </div>
      </Shell>
    )
  if (screen === "rules")
    return (
      <Shell>
        <Heading
          k="Cómo se juega"
          title="Las respuestas más populares"
          detail="Descubre lo que respondió la mayoría."
        />
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 text-sm leading-6 text-stone-600">
          <p>
            Dos representantes se enfrentan, el ganador decide si juega o pasa y tres errores
            habilitan el robo.
          </p>
          <p>El equipo con más puntos al final gana. En empate se juega una ronda adicional.</p>
          <Button ghost onClick={() => setScreen("home")}>
            Volver
          </Button>
        </div>
      </Shell>
    )
  if (screen === "create")
    return (
      <Shell showBack={false}>
        <WizardProgress step={1} />
        <Heading
          k="01 / Preparación"
          title="Crear una partida"
          detail="Selecciona el modo de juego."
        />
        <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-stone-500">
              Nombre de la partida <span className="text-red-600">*</span>
            </span>
            <input
              required
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Nombre de la partida"
              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((item) => (
              <button
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`rounded-xl border p-4 text-left ${mode === item.id ? "border-emerald-700 bg-emerald-50" : "border-stone-200"}`}
              >
                <b className="block text-sm">{item.title}</b>
                <small className="text-stone-500">{item.detail}</small>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <span aria-hidden="true" />
            <Button disabled={!validGameSetup} onClick={() => setScreen("teams")}>
              Continuar <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </Shell>
    )
  if (screen === "teams")
    return (
      <Shell>
        <WizardProgress step={2} />
        <Heading
          k="02 / Participantes"
          title="Arma tus equipos"
          detail="Los cambios se guardan en la partida."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team, index) => (
            <section key={team.color} className="rounded-2xl border border-stone-200 bg-white p-5">
              <label className="mb-2 block text-xs font-medium text-stone-500">
                Nombre del equipo <span className="text-red-600">*</span>
              </label>
              <div className="mb-4 flex items-center gap-2">
                <span
                  className={`size-3 shrink-0 rounded-full ${team.color === "blue" ? "bg-blue-600" : "bg-red-600"}`}
                  aria-hidden="true"
                />
                <input
                  required
                  value={team.name}
                  placeholder="Nombre del equipo *"
                  onChange={(e) =>
                    setTeams((old) =>
                      old.map((item, i) => (i === index ? { ...item, name: e.target.value } : item))
                    )
                  }
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-lg font-semibold outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="space-y-2">
                {team.players.map((player, playerIndex) => (
                  <div
                    key={`${team.color}-player-${playerIndex}`}
                    className="flex items-center gap-2"
                  >
                    <span className="w-5 text-center text-sm font-semibold text-stone-400">
                      {playerIndex + 1}
                    </span>
                    <label className="flex-1">
                      <span className="sr-only">
                        Integrante {playerIndex + 1} <span className="text-red-600">*</span>
                      </span>
                      <input
                        required
                        value={player}
                        placeholder={`Integrante ${playerIndex + 1} *`}
                        onChange={(e) =>
                          setTeams((old) =>
                            old.map((item, i) => {
                              if (i !== index) return item
                              const players = item.players.map((name, j) =>
                                j === playerIndex ? e.target.value : name
                              )
                              if (
                                playerIndex === 0 &&
                                e.target.value.trim() &&
                                players.length === 1
                              ) {
                                players.push("")
                              }
                              return { ...item, players }
                            })
                          )
                        }
                        className="w-full rounded-lg bg-stone-50 px-3 py-2 text-sm"
                      />
                    </label>
                    {team.players.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Eliminar integrante ${playerIndex + 1}`}
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                        onClick={() =>
                          setTeams((old) =>
                            old.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    players: item.players.filter((_, j) => j !== playerIndex),
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="mt-4 text-xs font-semibold text-emerald-800"
                onClick={() =>
                  setTeams((old) =>
                    old.map((item, i) =>
                      i === index ? { ...item, players: [...item.players, ""] } : item
                    )
                  )
                }
              >
                + Agregar integrante
              </button>
            </section>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button ghost onClick={() => setScreen("create")}>
            <ArrowLeft size={16} aria-hidden="true" /> Atrás
          </Button>
          <Button disabled={!validTeams} loading={loadingAction === "teams"} onClick={saveTeams}>
            Continuar <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </Shell>
    )
  if (screen === "rounds")
    return (
      <Shell>
        <WizardProgress step={3} />
        <Heading
          k="03 / Configuración"
          title="Diseña las rondas"
          detail="Cada ronda usa una pregunta con 4 a 10 respuestas."
        />
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-x-3 gap-y-2 text-sm">
            <p className="font-semibold text-stone-500">Número de ronda</p>
            <p className="font-semibold text-stone-500">Cantidad de preguntas</p>
            <p className="font-semibold text-stone-500">Multiplicador</p>
            {rounds.map((value, index) => (
              <div className="contents" key={index}>
                <span className="flex items-center">{index + 1}</span>
                <input
                  type="number"
                  min="4"
                  max="10"
                  value={value.answerCount}
                  onChange={(e) =>
                    setRounds((old) =>
                      old.map((item, i) =>
                        i === index ? { ...item, answerCount: e.target.value } : item
                      )
                    )
                  }
                  className="w-full rounded-xl border border-stone-200 px-3 py-2"
                />
                <select
                  value={value.multiplier}
                  onChange={(e) =>
                    setRounds((old) =>
                      old.map((item, i) =>
                        i === index
                          ? { ...item, multiplier: Number(e.target.value) as 1 | 2 | 3 }
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
              </div>
            ))}
          </div>
          {!validRounds && (
            <p className="mt-4 text-sm text-red-700">
              Las rondas deben estar entre 4 y 10 y ser descendentes.
            </p>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button ghost onClick={() => setScreen("teams")}>
              <ArrowLeft size={16} aria-hidden="true" /> Atrás
            </Button>
            <Button loading={loadingAction === "rounds"} onClick={saveRounds}>
              Guardar configuración <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Shell>
    )
  if (screen === "lobby")
    return (
      <Shell>
        <WizardProgress step={4} />
        <Heading
          k="04 / Sala de espera"
          title="Todo listo para jugar"
          detail="Comparte el código con los demás dispositivos."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
            <p className="text-xs text-stone-500">Código de sala</p>
            <p className="mt-2 text-5xl font-black tracking-widest text-emerald-900">{roomCode}</p>
            <p className="mt-5 text-xs text-stone-500">
              {devices.length}/4 dispositivos conectados
            </p>
          </section>
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="space-y-2">
              {devices.length === 0 &&
                [0, 1].map((index) => (
                  <div key={`device-skeleton-${index}`} className="rounded-xl bg-stone-50 p-3">
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              {devices.map((device, index) => (
                <div key={`${device.role}-${index}`} className="rounded-xl bg-stone-50 p-3 text-sm">
                  {device.role}
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button ghost onClick={() => setScreen("rounds")}>
            <ArrowLeft size={16} aria-hidden="true" /> Atrás
          </Button>
          <Button loading={loadingAction === "start"} onClick={start}>
            Iniciar partida <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </Shell>
    )
  if (screen === "join")
    return (
      <Shell>
        <Heading
          k="Acceso"
          title="Unirse a una sala"
          detail="Introduce el código del presentador."
        />
        <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-6">
          <label className="mb-2 block text-xs font-medium text-stone-500">
            Código de sala <span className="text-red-600">*</span>
          </label>
          <input
            required
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCD1234"
            className="w-full rounded-xl border border-stone-200 px-4 py-4 text-center text-2xl tracking-widest"
          />
          <div className="mt-5 space-y-2">
            <Button
              disabled={!validJoinCode}
              className="w-full"
              onClick={() => {
                setRoomCode(joinCode)
                setScreen("display")
              }}
            >
              Pantalla pública
            </Button>
            <Button
              disabled={!validJoinCode}
              secondary
              className="w-full"
              onClick={() => {
                setButtonRole("blue_button")
                setRoomCode(joinCode)
                setScreen("buzzer")
              }}
            >
              Pulsador azul
            </Button>
            <Button
              disabled={!validJoinCode}
              secondary
              className="w-full"
              onClick={() => {
                setButtonRole("red_button")
                setRoomCode(joinCode)
                setScreen("buzzer")
              }}
            >
              Pulsador rojo
            </Button>
          </div>
        </div>
      </Shell>
    )
  if (screen === "faceoff")
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
            Cara a cara
          </p>
          <h1 className="mt-4 text-3xl font-semibold">¿Quién respondió primero?</h1>
          <p className="mt-3 text-sm text-stone-500">
            Selecciona la respuesta dada por cada equipo.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <Button
              className={buzzerWinner === "red" ? "opacity-50" : ""}
              onClick={() => emitAction({ type: "faceoff_answer", team: "blue", index: 0 })}
            >
              {teams[0].name}
            </Button>
            <Button
              secondary
              className={buzzerWinner === "blue" ? "opacity-50" : ""}
              onClick={() => emitAction({ type: "faceoff_answer", team: "red", index: 1 })}
            >
              {teams[1].name}
            </Button>
          </div>
        </div>
      </Shell>
    )
  if (screen === "decision")
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Decisión</p>
          <h1 className="mt-4 text-3xl font-semibold">{teamName}</h1>
          <p className="mt-3 text-sm text-stone-500">¿Quieren jugar o pasar?</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                emitAction({ type: "decision", team: teamId, winner: "play" })
                setScreen("host")
              }}
            >
              Jugar
            </Button>
            <Button
              secondary
              onClick={() => {
                emitAction({ type: "decision", team: teamId, winner: "pass" })
                setScreen("host")
              }}
            >
              Pasar
            </Button>
          </div>
        </div>
      </Shell>
    )
  if (screen === "host")
    return (
      <Shell wide>
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4">
          <div>
            <p className="text-xs text-stone-500">Ronda {state.roundIndex + 1}</p>
            <p className="font-bold">{state.questionPrompt}</p>
          </div>
          <Button secondary onClick={() => setScreen("display")}>
            Ver tablero <Monitor size={16} aria-hidden="true" />
          </Button>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            {answers.map((answer, index) => (
              <button
                key={`${answer.text}-${index}`}
                onClick={() => reveal(index)}
                className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${revealed.includes(index) ? "border-emerald-300 bg-emerald-50" : "border-stone-200"}`}
              >
                <span className="w-8 text-sm">{index + 1}</span>
                <span className="flex-1 font-semibold">{answer.text}</span>
                <span className="font-bold">{answer.points}</span>
              </button>
            ))}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
              <Strikes count={Math.max(state.strikes.blue, state.strikes.red)} />
              <Button onClick={() => emitAction({ type: "strike", team: teamId })}>
                <X size={16} aria-hidden="true" /> Strike
              </Button>
            </div>
          </section>
          <aside className="space-y-4">
            <Score blue={blue} red={red} />
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs text-stone-500">Pozo</p>
              <p className="mt-2 text-4xl font-black">{state.pot}</p>
            </div>
            {state.phase === "steal" && (
              <Button className="w-full" onClick={() => setScreen("steal")}>
                Resolver robo <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
            {state.phase === "round_result" && (
              <Button
                className="w-full"
                onClick={() => {
                  emitAction({ type: "finish_round", winner: teamId })
                  setScreen("roundResult")
                }}
              >
                Cerrar ronda <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
          </aside>
        </div>
      </Shell>
    )
  if (screen === "steal")
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-red-700">Robo</p>
          <p className="my-6 text-6xl font-black">{state.pot}</p>
          <select
            value={stealIndex}
            onChange={(e) => setStealIndex(Number(e.target.value))}
            className="mb-5 w-full rounded-xl border border-stone-200 px-3 py-3 text-left"
          >
            {answers.map(
              (answer, index) =>
                !revealed.includes(index) && (
                  <option key={index} value={index}>
                    Respuesta {index + 1}: {answer.text || "oculta"}
                  </option>
                )
            )}
          </select>
          <input
            value={stealText}
            onChange={(e) => setStealText(e.target.value)}
            placeholder="Escribe la respuesta del equipo"
            className="mb-5 w-full rounded-xl border border-stone-200 px-3 py-3 text-left"
          />
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                emitAction({ type: "steal_answer", answerIndex: stealIndex, answerText: stealText })
                setScreen("roundResult")
              }}
            >
              Correcta
            </Button>
            <Button
              secondary
              onClick={() => {
                emitAction({ type: "finish_round", winner: teamId })
                setScreen("roundResult")
              }}
            >
              Incorrecta
            </Button>
          </div>
        </div>
      </Shell>
    )
  if (screen === "roundResult")
    return (
      <Shell>
        <div className="mx-auto max-w-lg pt-10 text-center">
          <p className="text-xs uppercase tracking-widest text-emerald-800">Ronda terminada</p>
          <h1 className="mt-5 text-4xl font-semibold">Marcador actualizado</h1>
          <div className="my-8">
            <Score blue={blue} red={red} />
          </div>
          <Button
            onClick={() => {
              emitAction({ type: "next_round" })
              setScreen("host")
            }}
          >
            Siguiente ronda <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </Shell>
    )
  if (screen === "final")
    return (
      <Shell>
        <div className="mx-auto max-w-lg pt-10 text-center">
          <p className="text-xs uppercase tracking-widest text-emerald-800">Partida finalizada</p>
          <h1 className="mt-5 text-4xl font-semibold">Tenemos ganador</h1>
          <p className="my-8 text-3xl font-black">
            {blue > red ? teams[0].name : red > blue ? teams[1].name : "Empate"}
          </p>
          <Score blue={blue} red={red} />
          <Button className="mt-8" onClick={() => setScreen("home")}>
            Nueva partida
          </Button>
        </div>
      </Shell>
    )
  if (screen === "display")
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-2xl font-bold">La gente dice.</p>
          <p className="mx-auto mt-8 max-w-3xl text-center text-3xl font-bold">
            {state.questionPrompt}
          </p>
          <div className="mx-auto mt-8 max-w-2xl space-y-2">
            {answers.length === 0 &&
              [0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={`answer-skeleton-${index}`} className="h-16 bg-white/10" />
              ))}
            {answers.map((answer, index) => (
              <div key={`${answer.text}-${index}`} className="flex rounded-xl bg-white/10 p-4">
                <span className="w-10">{index + 1}</span>
                <span className="flex-1 font-bold">
                  {revealed.includes(index) ? answer.text : "••••••••"}
                </span>
                <span>{revealed.includes(index) ? answer.points : "••"}</span>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Score blue={blue} red={red} />
          </div>
        </div>
      </div>
    )
  if (screen === "buzzer")
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-6 text-center">
          <h1 className="text-3xl font-black">Pulsador</h1>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              disabled={Boolean(buzzerWinner) || buttonRole !== "blue_button"}
              className="min-h-40 rounded-2xl bg-blue-600 text-xl font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "blue" })}
            >
              AZUL
            </button>
            <button
              disabled={Boolean(buzzerWinner) || buttonRole !== "red_button"}
              className="min-h-40 rounded-2xl bg-red-600 text-xl font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "red" })}
            >
              ROJO
            </button>
          </div>
          <p className="mt-6 text-sm font-semibold text-emerald-800">
            {buzzerWinner
              ? `Ganó el Equipo ${buzzerWinner === "blue" ? "Azul" : "Rojo"}`
              : "Esperando el primer pulsador…"}
          </p>
        </div>
      </Shell>
    )
  return (
    <Shell>
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        {error || "Conectando con la partida…"}
      </div>
    </Shell>
  )
}
