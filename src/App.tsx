import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, Monitor, X } from "lucide-react"
import { gameSocket } from "./socket"
import {
  Button,
  CountPill,
  DeviceIconAnimation,
  DeviceRoleIcon,
  Heading,
  Score,
  Shell,
  Skeleton,
  Strikes,
  WizardProgress,
  DeviceTypeIcon,
} from "./components/atoms"
import type { DeviceType } from "./components/atoms"
import { GameSetupStep, RoundsStep, TeamsStep } from "./components/setup-wizard"

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
type DeviceRole = "host" | "display" | "blue_button" | "red_button" | "pending"
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
const screens: Screen[] = [
  "home",
  "rules",
  "create",
  "teams",
  "rounds",
  "lobby",
  "join",
  "host",
  "faceoff",
  "decision",
  "display",
  "buzzer",
  "steal",
  "roundResult",
  "final",
]
const screenFromLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  if (segments.length === 2 && segments[1] === "lobby") return "lobby" as Screen
  if (segments[0] === "join" || segments[1] === "join") return "join" as Screen
  if (segments.length === 2 && segments[1] === "edit") return "create" as Screen
  if (segments.length === 3 && segments[1] === "edit" && screens.includes(segments[2] as Screen)) {
    return segments[2] as Screen
  }
  const candidate = segments[0] as Screen | undefined
  return candidate && screens.includes(candidate) ? candidate : "home"
}
const roomCodeFromLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments.length >= 2 && (segments[1] === "lobby" || segments[1] === "edit")
    ? segments[0]
    : ""
}
const joinCodeFromLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments.length >= 2 && segments[1] === "join" ? segments[0].toUpperCase() : ""
}
const joinStageFromLocation = (): "name" | "role" => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return (segments[0] === "join" && segments[1] === "role") ||
    (segments[1] === "join" && segments[2] === "role")
    ? "role"
    : "name"
}
const isEditLocation = () => window.location.pathname.split("/").filter(Boolean)[1] === "edit"
const deviceRoleLabels: Record<DeviceRole, string> = {
  host: "Presentador",
  display: "Pantalla pública",
  blue_button: "Pulsador azul",
  red_button: "Pulsador rojo",
  pending: "Seleccionando rol",
}
const deviceRoleDescriptions: Record<DeviceRole, string> = {
  host: "Controla la partida y administra las respuestas.",
  display: "Muestra el tablero público para todos.",
  blue_button: "Funciona como pulsador del equipo azul.",
  red_button: "Funciona como pulsador del equipo rojo.",
  pending: "Este dispositivo aún no tiene un rol asignado.",
}
const joinRoles: DeviceRole[] = ["host", "display", "blue_button", "red_button"]
const getDefaultDeviceName = () => {
  const userAgent = navigator.userAgent
  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? "iPhone/iPad"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac/.test(userAgent)
        ? "Mac"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Dispositivo"
  const browser = /Edg/.test(userAgent)
    ? "Edge"
    : /Chrome/.test(userAgent)
      ? "Chrome"
      : /Safari/.test(userAgent)
        ? "Safari"
        : /Firefox/.test(userAgent)
          ? "Firefox"
          : "Navegador"
  return `${browser} · ${platform}`
}
const getDeviceType = (): DeviceType => {
  const userAgent = navigator.userAgent
  if (/SmartTV|Web0S|Tizen|HbbTV|NetCast/i.test(userAgent)) return "tv"
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return "tablet"
  if (/iPhone|iPod|Android.*Mobile/i.test(userAgent)) return "mobile"
  return "desktop"
}
const deviceTypeLabels: Record<DeviceType, string> = {
  desktop: "Escritorio",
  tv: "TV",
  mobile: "Móvil",
  tablet: "Tablet",
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
  const [screen, setScreenState] = useState<Screen>(screenFromLocation)
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
    () => roomCodeFromLocation() || localStorage.getItem("people-says-room-code") || ""
  )
  const [roomLoading, setRoomLoading] = useState(() => isEditLocation())
  const [hostToken, setHostToken] = useState(
    () => localStorage.getItem("people-says-host-token") ?? ""
  )
  const [deviceToken] = useState(() => {
    const existing = sessionStorage.getItem("people-says-device-token")
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem("people-says-device-token", created)
    return created
  })
  const [joinCode, setJoinCode] = useState(joinCodeFromLocation)
  const [deviceName, setDeviceName] = useState(getDefaultDeviceName)
  const [deviceType] = useState<DeviceType>(getDeviceType)
  const [joinStage, setJoinStage] = useState<"name" | "role">(joinStageFromLocation)
  const [stealIndex, setStealIndex] = useState(0)
  const [stealText, setStealText] = useState("")
  const [buzzerWinner, setBuzzerWinner] = useState<"blue" | "red" | null>(null)
  const [buttonRole, setButtonRole] = useState<"blue_button" | "red_button">("blue_button")
  const [currentDeviceRole, setCurrentDeviceRole] = useState<DeviceRole>("host")
  const [devices, setDevices] = useState<
    Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
  >([])
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<"code" | "url" | null>(null)
  const [loadingAction, setLoadingAction] = useState<
    "create" | "teams" | "rounds" | "start" | null
  >(null)
  const answers =
    state.answers ?? Array.from({ length: state.answerCount ?? 0 }, () => ({ text: "", points: 0 }))
  const revealed = state.revealed ?? []
  const blue = state.scores?.blue ?? 0
  const red = state.scores?.red ?? 0
  const allowedAnswerCounts = [10, 8, 6, 5, 4]
  const validRoundCount = rounds.length >= 3 && rounds.length <= 7
  const validRounds =
    validRoundCount &&
    rounds.every(
      (round, i) =>
        Number.isInteger(Number(round.answerCount)) &&
        allowedAnswerCounts.includes(Number(round.answerCount)) &&
        (i === 0 || Number(round.answerCount) <= Number(rounds[i - 1].answerCount))
    )
  const canAddRound = rounds.length < 7
  const addRound = () => {
    if (!canAddRound) return
    setRounds((old) => [...old, { answerCount: "4", multiplier: 1 }])
  }
  const validGameSetup = gameName.trim().length > 0
  const validTeams = teams.every(
    (team) => team.name.trim().length > 0 && team.players.some((player) => player.trim().length > 0)
  )
  const validJoinCode = joinCode.trim().length >= 5
  const shareUrl = `${window.location.origin}/${roomCode}/join`
  const copyText = async (value: string, type: "code" | "url") => {
    await navigator.clipboard.writeText(value)
    setCopied(type)
    window.setTimeout(() => setCopied(null), 1800)
  }
  const setScreen = (next: Screen, path?: string) => {
    const nextPath =
      path ??
      (roomCode && ["create", "teams", "rounds"].includes(next)
        ? `/${roomCode}/edit${next === "create" ? "" : `/${next}`}`
        : next === "lobby" && roomCode
          ? `/${roomCode}/lobby`
          : `/${next}`)
    window.history.pushState({ screen: next }, "", nextPath)
    setRoomLoading(nextPath.includes("/edit"))
    setScreenState(next)
  }
  const setJoinRoute = (stage: "name" | "role") => {
    const code = roomCode || joinCode.trim().toUpperCase()
    const path = code
      ? `/${code}/join${stage === "role" ? "/role" : ""}`
      : `/join${stage === "role" ? "/role" : ""}`
    window.history.pushState({ screen: "join", joinStage: stage }, "", path)
    setJoinStage(stage)
  }
  useEffect(() => {
    const onPopState = () => {
      setScreenState(screenFromLocation())
      setJoinStage(joinStageFromLocation())
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
  const emitAction = (action: Record<string, unknown>) =>
    gameSocket.emit("game:action", { code: roomCode, hostToken, action })
  useEffect(() => {
    if (!roomCode || !["host", "display", "buzzer", "lobby"].includes(screen)) return
    gameSocket.connect()
    const role = screen === "lobby" ? currentDeviceRole : screen === "buzzer" ? buttonRole : screen
    gameSocket.emit("room:join", {
      code: roomCode,
      role,
      name: deviceName,
      deviceType,
      hostToken,
      deviceToken,
    })
    const receive = (payload: { state?: State }) => {
      if (payload.state) setState(payload.state)
    }
    const presence = (payload: {
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => setDevices((payload.devices ?? []).filter((device) => device.id !== deviceToken))
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
  }, [roomCode, screen, hostToken, deviceToken, buttonRole, currentDeviceRole, deviceName])
  useEffect(() => {
    if (screen !== "join" || joinCode.trim().length < 5) return
    fetch(`${api}/api/rooms/${joinCode.trim().toUpperCase()}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setDevices(data.devices ?? [])
      })
      .catch(() => setDevices([]))
  }, [screen, joinCode])
  useEffect(() => {
    if (screen !== "join" || joinStage !== "role" || joinCode.trim().length < 5) return
    const presence = (payload: {
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => setDevices((payload.devices ?? []).filter((device) => device.id !== deviceToken))
    gameSocket.connect()
    gameSocket.emit("room:join", {
      code: joinCode.trim().toUpperCase(),
      role: "pending",
      name: deviceName,
      deviceType,
      deviceToken,
    })
    gameSocket.on("room:presence", presence)
    return () => {
      gameSocket.off("room:presence", presence)
      gameSocket.disconnect()
    }
  }, [screen, joinStage, joinCode, deviceName, deviceType, deviceToken])
  useEffect(() => {
    if (!roomCode || !hostToken || !isEditLocation()) return
    setRoomLoading(true)
    fetch(`${api}/api/rooms/${roomCode}`, { headers: { "x-host-token": hostToken } })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setGameName(data.name ?? "")
        setMode(data.mode)
        setState((old) => ({ ...old, ...data.state }))
        if (data.state?.teams) {
          setTeams(
            data.state.teams.map((team: { name: string; players: string[] }, index: number) => ({
              name: team.name,
              color: index === 0 ? "blue" : "red",
              players: team.players,
            }))
          )
        }
        if (data.state?.roundConfigs) {
          setRounds(
            data.state.roundConfigs.map(
              (round: { answerCount: number; multiplier: 1 | 2 | 3 }) => ({
                answerCount: String(round.answerCount),
                multiplier: round.multiplier,
              })
            )
          )
        }
      })
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : "No se pudo cargar la partida")
      )
      .finally(() => setRoomLoading(false))
  }, [roomCode, hostToken, screen])
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
      sessionStorage.setItem("people-says-device-token", data.deviceToken)
      setState({
        ...data.state,
        questionPrompt: data.question.prompt,
        answers: data.question.answers,
      })
      localStorage.setItem("people-says-room-code", data.code)
      localStorage.setItem("people-says-host-token", data.hostToken)
      setScreen(finalize ? "lobby" : "teams", finalize ? `/${data.code}/lobby` : undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la sala")
    } finally {
      setLoadingAction(null)
    }
  }
  const saveGameConfig = async () => {
    if (!validGameSetup) return
    if (!roomCode) {
      setScreen("teams")
      return
    }
    setLoadingAction("create")
    try {
      const response = await fetch(`${api}/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-host-token": hostToken },
        body: JSON.stringify({ name: gameName.trim(), mode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setMode(data.mode)
      setScreen("teams")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la configuración")
    } finally {
      setLoadingAction(null)
    }
  }
  const saveTeams = async () => {
    if (!roomCode) {
      setScreen("rounds")
      return
    }
    setLoadingAction("teams")
    try {
      const response = await fetch(`${api}/api/rooms/${roomCode}/teams`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-host-token": hostToken },
        body: JSON.stringify({
          teams: teams.map((team) => ({
            name: team.name.trim(),
            players: team.players.map((player) => player.trim()).filter(Boolean),
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setState((old) => ({ ...old, ...data.state }))
      setScreen("rounds")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los equipos")
    } finally {
      setLoadingAction(null)
    }
  }
  const saveRounds = async () => {
    if (!validRounds) return
    setLoadingAction("rounds")
    if (!roomCode) {
      await createRoom(true)
      setLoadingAction(null)
      return
    }
    try {
      const response = await fetch(`${api}/api/rooms/${roomCode}/rounds`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-host-token": hostToken },
        body: JSON.stringify({
          rounds: rounds.map((round) => ({
            answerCount: Number(round.answerCount),
            multiplier: round.multiplier,
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setState((old) => ({ ...old, ...data.state }))
      setScreen("lobby")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las rondas")
    } finally {
      setLoadingAction(null)
    }
  }
  const selectJoinRole = (role: DeviceRole) => {
    setRoomCode(joinCode.trim().toUpperCase())
    setCurrentDeviceRole(role)
    if (role === "host") setScreen("host")
    if (role === "display") setScreen("display")
    if (role === "blue_button" || role === "red_button") {
      setButtonRole(role)
      setScreen("buzzer")
    }
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
  if (roomLoading && ["create", "teams", "rounds"].includes(screen))
    return (
      <Shell>
        <WizardProgress step={screen === "create" ? 1 : screen === "teams" ? 2 : 3} />
        <Skeleton className="mb-3 h-3 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-4 h-12 w-full" />
          <Skeleton className="mt-4 h-12 w-2/3" />
        </div>
      </Shell>
    )
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
            <Button secondary onClick={() => setJoinRoute("name")}>
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
      <GameSetupStep
        editing={isEditLocation()}
        gameName={gameName}
        mode={mode}
        modes={modes}
        valid={validGameSetup}
        loading={loadingAction === "create"}
        error={error}
        onGameNameChange={setGameName}
        onModeChange={setMode}
        onContinue={saveGameConfig}
      />
    )
  if (screen === "teams")
    return (
      <TeamsStep
        teams={teams}
        valid={validTeams}
        loading={loadingAction === "teams"}
        onTeamsChange={setTeams}
        onBack={() => setScreen("create")}
        onContinue={saveTeams}
      />
    )
  if (screen === "rounds")
    return (
      <RoundsStep
        rounds={rounds}
        allowedAnswerCounts={allowedAnswerCounts}
        valid={validRounds}
        canAdd={canAddRound}
        loading={loadingAction === "rounds"}
        onRoundsChange={setRounds}
        onAdd={addRound}
        onBack={() => setScreen("teams")}
        onSave={saveRounds}
      />
    )
  if (screen === "lobby")
    return (
      <Shell onBack={() => setScreen("create", `/${roomCode}/edit`)}>
        <WizardProgress step={4} />
        <Heading
          k="04 / Sala de espera"
          title="Todo listo para jugar"
          detail="Comparte el código con los demás dispositivos."
        />
        <section className="mb-5 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DeviceRoleIcon role={currentDeviceRole} />
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                  {deviceRoleLabels[currentDeviceRole]}
                </p>
                <p className="mt-1 text-xs text-stone-500">{deviceName}</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-stone-500">
              Rol del dispositivo
              <select
                aria-label="Rol del dispositivo"
                value={currentDeviceRole}
                onChange={(event) => setCurrentDeviceRole(event.target.value as DeviceRole)}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700"
              >
                {Object.entries(deviceRoleLabels).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
            <p className="mb-2 block text-left text-xs font-medium text-stone-500">
              Código de sala
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <p className="text-5xl font-black tracking-widest text-emerald-900">{roomCode}</p>
              <Button secondary onClick={() => copyText(roomCode, "code")}>
                {copied === "code" ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="mt-6 text-left">
              <p className="mb-2 block text-xs font-medium text-stone-500">Enlace para compartir</p>
              <div className="flex gap-2">
                <input
                  aria-label="Enlace de invitación"
                  readOnly
                  value={shareUrl}
                  className="min-w-0 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs outline-none focus:border-emerald-700"
                />
                <Button secondary onClick={() => copyText(shareUrl, "url")}>
                  {copied === "url" ? "Copiado" : "Copiar URL"}
                </Button>
              </div>
            </div>
            <div className="mt-6 flex flex-col items-center">
              <div className="rounded-xl border border-stone-200 bg-white p-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(shareUrl)}`}
                  alt="Código QR para unirse a la sala"
                  width="168"
                  height="168"
                />
              </div>
              <p className="mt-3 text-xs text-stone-500">
                Escanea el código QR para unirte a la sala
              </p>
            </div>
          </section>
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dispositivos vinculados</h2>
              <CountPill
                count={devices.length + 1}
                label={devices.length + 1 === 1 ? "dispositivo" : "dispositivos"}
              />
            </div>
            <div className="mt-5 rounded-xl border border-emerald-700 bg-emerald-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <DeviceRoleIcon role={currentDeviceRole} active />
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                      {deviceRoleLabels[currentDeviceRole]}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">{deviceName}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                  <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" /> Listo
                </span>
              </div>
            </div>
            {devices.length > 0 && (
              <div className="mt-2 space-y-2">
                {devices.map((device, index) => (
                  <div
                    key={`${device.role}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3"
                  >
                    <span className="grid aspect-square size-12 shrink-0 place-items-center rounded-lg bg-stone-100">
                      <DeviceTypeIcon type={device.deviceType ?? "desktop"} />
                    </span>
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-stone-700">
                        {deviceRoleLabels[device.role as DeviceRole] ?? device.role}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{device.name ?? "Dispositivo"}</p>
                    </div>
                    <span
                      className={`ml-auto inline-flex items-center gap-1 text-[11px] font-bold ${device.role === "pending" ? "text-stone-400" : "text-emerald-800"}`}
                    >
                      <span
                        className={`size-2 rounded-full ${device.role === "pending" ? "bg-stone-400" : "bg-emerald-600"}`}
                        aria-hidden="true"
                      />
                      {device.role === "pending" ? "Pendiente" : "Listo"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {devices.length + 1 < 4 && (
              <div className="mt-2 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 px-5 text-center">
                <DeviceIconAnimation />
                <h3 className="mt-4 text-sm font-semibold">Esperando nuevos dispositivos</h3>
                <p className="mt-2 max-w-xs text-xs leading-5 text-stone-500">
                  Comparte el enlace o QR para conectar una pantalla pública o los botones de cada
                  equipo.
                </p>
                <p className="mt-4 text-xs font-semibold text-stone-500">
                  {devices.length + 1}/4 dispositivos vinculados.
                </p>
              </div>
            )}
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
          aside={
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-right">
              <p className="text-xs font-medium text-stone-500">Código de sala</p>
              <p className="mt-1 text-2xl font-black tracking-widest text-emerald-900">
                {joinCode || "—"}
              </p>
              <Button
                ghost
                className="mt-2 text-xs text-red-600 hover:text-red-700"
                onClick={() => {
                  window.close()
                  window.setTimeout(() => setScreen("home"), 100)
                }}
              >
                <X size={14} aria-hidden="true" /> Salir de vinculación
              </Button>
            </div>
          }
        />
        <div className="mx-auto max-w-4xl space-y-4">
          {joinStage === "name" ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-lg font-semibold">Nombra este dispositivo</h2>
              <p className="mt-2 text-sm text-stone-500">
                Este nombre aparecerá en la lista de dispositivos vinculados.
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-stone-200 p-3">
                <span className="grid aspect-square size-12 shrink-0 place-items-center rounded-lg bg-emerald-50">
                  <DeviceTypeIcon type={deviceType} />
                </span>
                <input
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  placeholder="Nombre del dispositivo"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  autoComplete="off"
                />
                <span className="shrink-0 text-xs font-semibold text-stone-500">
                  {deviceTypeLabels[deviceType]}
                </span>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  disabled={!deviceName.trim() || !validJoinCode}
                  onClick={() => setJoinRoute("role")}
                >
                  Siguiente <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-lg font-semibold">Selecciona el rol</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {joinRoles.map((role) => {
                  const occupied = devices.some((device) => device.role === role)
                  return (
                    <Button
                      key={role}
                      secondary
                      disabled={!validJoinCode || occupied}
                      className="h-auto min-h-28 justify-start text-left"
                      onClick={() => selectJoinRole(role)}
                    >
                      <DeviceRoleIcon role={role} />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{deviceRoleLabels[role]}</span>
                        <span className="mt-1 block whitespace-normal text-xs font-normal leading-5 text-stone-500">
                          {deviceRoleDescriptions[role]}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
              <div className="mt-5">
                <Button ghost onClick={() => setJoinRoute("name")}>
                  <ArrowLeft size={16} aria-hidden="true" /> Atrás
                </Button>
              </div>
            </div>
          )}
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
