import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ClipboardPaste,
  ChevronDown,
  ExternalLink,
  Hand,
  Info,
  LoaderCircle,
  LogIn,
  LogOut,
  Pause,
  SquareDashed,
  SquareX,
  Settings2,
  Timer,
  X,
} from "lucide-react"
import { gameSocket } from "./socket"
import {
  Button,
  Brand,
  CountPill,
  DeviceIconAnimation,
  DeviceRoleIcon,
  Heading,
  Score,
  Shell,
  Skeleton,
  WizardProgress,
  DeviceTypeIcon,
} from "./components/atoms"
import type { DeviceType } from "./components/atoms"
import { GameSetupStep, RoundsStep, TeamsStep } from "./components/setup-wizard"
import { cx } from "./lib/cx"

type Screen =
  | "home"
  | "rules"
  | "create"
  | "teams"
  | "rounds"
  | "lobby"
  | "join"
  | "joinInvite"
  | "joinLobby"
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
  faceoff?: { bluePlayer?: string; redPlayer?: string }
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
  "joinInvite",
  "joinLobby",
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
  if (segments.length === 2 && segments[1] === "join") return "joinInvite" as Screen
  if (segments.length === 2 && segments[0] === "join" && segments[1] === "lobby") {
    return "joinLobby" as Screen
  }
  if (segments[0] === "join" && ["device", "role"].includes(segments[1])) return "join" as Screen
  if (segments[0] === "join") return "join" as Screen
  if (segments[0] === "edit" && screens.includes(segments[1] as Screen)) {
    return segments[1] as Screen
  }
  if (segments[0] === "edit") return "create" as Screen
  const candidate = segments[0] as Screen | undefined
  return candidate && screens.includes(candidate) ? candidate : "home"
}
const roomCodeFromLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments.length === 2 && segments[1] === "join" ? segments[0].toUpperCase() : ""
}
const joinCodeFromLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments.length >= 2 && segments[1] === "join" ? segments[0].toUpperCase() : ""
}
const joinStageFromLocation = (): "name" | "role" => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments[0] === "join" && segments[1] === "role" ? "role" : "name"
}
const isJoinEntryLocation = () => {
  const segments = window.location.pathname.split("/").filter(Boolean)
  return segments.length === 1 && segments[0] === "join"
}
const isEditLocation = () => window.location.pathname.split("/").filter(Boolean)[0] === "edit"
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
type SavedDeviceConfig = {
  token: string
  role: DeviceRole
  name: string
  deviceType: DeviceType
}
const deviceConfigKey = (code: string) => `people-says-device-config:${code.toUpperCase()}`
const getSavedDeviceConfigForCode = (code: string): SavedDeviceConfig | null => {
  if (!code) return null
  const raw = localStorage.getItem(deviceConfigKey(code))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SavedDeviceConfig
  } catch {
    return null
  }
}
const getSavedDeviceConfig = (): SavedDeviceConfig | null =>
  getSavedDeviceConfigForCode(
    roomCodeFromLocation() || localStorage.getItem("people-says-room-code") || ""
  )
const saveDeviceConfig = (code: string, config: SavedDeviceConfig) => {
  localStorage.setItem(deviceConfigKey(code), JSON.stringify(config))
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
  const location = useLocation()
  const navigate = useNavigate()
  const savedDeviceConfig = getSavedDeviceConfig()
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
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [deviceToken, setDeviceToken] = useState(() => {
    const existing = sessionStorage.getItem("people-says-device-token")
    if (existing) return existing
    const shared = localStorage.getItem("people-says-device-token")
    if (shared) {
      sessionStorage.setItem("people-says-device-token", shared)
      return shared
    }
    if (savedDeviceConfig?.token) {
      localStorage.setItem("people-says-device-token", savedDeviceConfig.token)
      sessionStorage.setItem("people-says-device-token", savedDeviceConfig.token)
      return savedDeviceConfig.token
    }
    const created = crypto.randomUUID()
    localStorage.setItem("people-says-device-token", created)
    sessionStorage.setItem("people-says-device-token", created)
    return created
  })
  const [joinCode, setJoinCode] = useState(
    () => joinCodeFromLocation() || localStorage.getItem("people-says-room-code") || ""
  )
  const [deviceName, setDeviceName] = useState(
    () => savedDeviceConfig?.name || getDefaultDeviceName()
  )
  const [deviceType] = useState<DeviceType>(() => savedDeviceConfig?.deviceType ?? getDeviceType())
  const [joinStage, setJoinStage] = useState<"name" | "role">(joinStageFromLocation)
  const [pendingRegistered, setPendingRegistered] = useState(false)
  const [roleWarning, setRoleWarning] = useState("")
  const otpRefs = useRef<Array<HTMLInputElement | null>>([])
  const [stealIndex, setStealIndex] = useState(0)
  const [stealText, setStealText] = useState("")
  const [buzzerWinner, setBuzzerWinner] = useState<"blue" | "red" | null>(null)
  const [buttonRole, setButtonRole] = useState<"blue_button" | "red_button">("blue_button")
  const [currentDeviceRole, setCurrentDeviceRole] = useState<DeviceRole>(
    () => savedDeviceConfig?.role ?? "host"
  )
  const [devices, setDevices] = useState<
    Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
  >([])
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<"code" | "url" | null>(null)
  const [loadingAction, setLoadingAction] = useState<
    "create" | "teams" | "rounds" | "start" | "join" | null
  >(null)
  const [showConnectedDevices, setShowConnectedDevices] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(30)
  const [timerRunning, setTimerRunning] = useState(false)
  const [strikeVisible, setStrikeVisible] = useState(false)
  useEffect(() => {
    if (!timerRunning) return
    const timer = window.setInterval(() => {
      setTimerSeconds((seconds) => {
        if (seconds <= 1) {
          setTimerRunning(false)
          gameSocket.emit("game:action", {
            code: roomCode,
            hostToken,
            action: { type: "strike", team: state.control ?? "blue", source: "timer" },
          })
          setStrikeVisible(true)
          return 0
        }
        return seconds - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hostToken, roomCode, state.control, timerRunning])
  useEffect(() => {
    if (!strikeVisible) return
    const timeout = window.setTimeout(() => setStrikeVisible(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [strikeVisible])
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
  const savedRoomCode = localStorage.getItem("people-says-room-code") ?? ""
  const savedHostToken = localStorage.getItem("people-says-host-token") ?? ""
  const isPrincipalDevice =
    Boolean(joinCode) &&
    joinCode.toUpperCase() === savedRoomCode.toUpperCase() &&
    Boolean(savedHostToken)
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
      (next === "create" || next === "teams" || next === "rounds"
        ? hostToken
          ? `/edit${next === "create" ? "" : `/${next}`}`
          : `/${next}`
        : `/${next}`)
    navigate(nextPath)
    setRoomLoading(nextPath.includes("/edit"))
    setScreenState(next)
  }
  const setJoinRoute = (stage: "name" | "role") => {
    if (stage === "name") setPendingRegistered(false)
    const path = `/join/${stage === "role" ? "role" : "device"}`
    navigate(path)
    setJoinStage(stage)
  }
  useEffect(() => {
    setScreenState(screenFromLocation())
    setJoinStage(joinStageFromLocation())
  }, [location.pathname])
  const emitAction = (action: Record<string, unknown>) =>
    gameSocket.emit("game:action", { code: roomCode, hostToken, action })
  const pauseGame = () => emitAction({ type: "pause" })
  const canPauseGame = Boolean(hostToken) || currentDeviceRole === "host"
  const pauseControl = canPauseGame ? (
    <Button secondary onClick={pauseGame}>
      Pausar partida
    </Button>
  ) : null
  const moveToRoleSelection = (message: string) => {
    setCurrentDeviceRole("pending")
    saveDeviceConfig(roomCode, {
      token: deviceToken,
      role: "pending",
      name: deviceName,
      deviceType,
    })
    setPendingRegistered(true)
    setRoleWarning(message)
    setError("")
    setJoinStage("role")
    navigate("/join/role")
    setScreenState("join")
  }
  useEffect(() => {
    if (!roomCode || !["host", "display", "buzzer", "lobby", "joinLobby"].includes(screen)) return
    gameSocket.connect()
    const role = ["lobby", "joinLobby"].includes(screen)
      ? currentDeviceRole
      : screen === "buzzer"
        ? buttonRole
        : screen
    gameSocket.emit("room:join", {
      code: roomCode,
      role,
      name: deviceName,
      deviceType,
      hostToken,
      deviceToken,
    })
    const receive = (payload: {
      state?: State
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => {
      if (payload.state) setState(payload.state)
      if (payload.devices) {
        setDevices(payload.devices.filter((device) => device.id !== deviceToken))
      }
    }
    const presence = (payload: {
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => setDevices((payload.devices ?? []).filter((device) => device.id !== deviceToken))
    const failure = (payload: { error?: string }) => {
      const errorCode = payload.error ?? "connection_error"
      if (errorCode === "role_taken") {
        moveToRoleSelection("Este rol ya está ocupado. Selecciona otro para continuar.")
        return
      }
      if (errorCode === "controller_not_connected") {
        setError("El presentador aún no está conectado a la sala. Intenta de nuevo en un momento.")
        return
      }
      if (errorCode === "room_full") {
        setError("La sala ya tiene el máximo de 4 dispositivos vinculados.")
        return
      }
      if (errorCode === "room_not_found") {
        setError("La sala ya no existe o no está disponible.")
        return
      }
      if (errorCode === "turn_not_active") {
        setError("La respuesta solo puede revelarse cuando hay un turno activo.")
        return
      }
      if (errorCode === "host_required") {
        setError("Este dispositivo no tiene permisos para controlar la partida.")
        return
      }
      setError(errorCode)
    }
    const buzzer = (payload: { winner?: "blue" | "red" }) => setBuzzerWinner(payload.winner ?? null)
    const roleReplaced = (payload: { message?: string }) => {
      moveToRoleSelection(
        payload.message ??
          "El dispositivo principal reasignó tu rol. Selecciona otro para continuar."
      )
    }
    gameSocket.on("room:snapshot", receive)
    gameSocket.on("game:state", receive)
    gameSocket.on("room:presence", presence)
    gameSocket.on("game:error", failure)
    gameSocket.on("buzzer:winner", buzzer)
    gameSocket.on("device:role-replaced", roleReplaced)
    gameSocket.on("buzzer:reset", () => setBuzzerWinner(null))
    return () => {
      gameSocket.off("room:snapshot", receive)
      gameSocket.off("game:state", receive)
      gameSocket.off("room:presence", presence)
      gameSocket.off("game:error", failure)
      gameSocket.off("buzzer:winner", buzzer)
      gameSocket.off("device:role-replaced", roleReplaced)
      gameSocket.off("buzzer:reset")
    }
  }, [roomCode, screen, hostToken, deviceToken, buttonRole, currentDeviceRole, deviceName])
  useEffect(() => {
    if (["host", "display", "buzzer", "lobby", "joinLobby"].includes(screen)) return
    gameSocket.disconnect()
  }, [screen])
  useEffect(() => {
    if (screen !== "lobby" && !["joinInvite", "join", "joinLobby"].includes(screen)) return
    const code = roomCode || joinCode.trim().toUpperCase()
    if (code.length < 5) return
    fetch(`${api}/api/rooms/${code}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setGameName(data.name ?? "La gente dice")
        setState((old) => ({ ...old, ...data.state }))
        setDevices(
          (data.devices ?? []).filter((device: { id?: string }) => device.id !== deviceToken)
        )
      })
      .catch(() => setDevices([]))
  }, [screen, joinStage, joinCode, roomCode])
  useEffect(() => {
    if (
      screen !== "join" ||
      (joinStage !== "role" && !pendingRegistered) ||
      joinCode.trim().length < 5
    )
      return
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
  }, [screen, joinStage, pendingRegistered, joinCode, deviceName, deviceType, deviceToken])
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
      setDeviceToken(data.deviceToken)
      localStorage.setItem("people-says-device-token", data.deviceToken)
      sessionStorage.setItem("people-says-device-token", data.deviceToken)
      saveDeviceConfig(data.code, {
        token: data.deviceToken,
        role: "host",
        name: deviceName,
        deviceType,
      })
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
    const code = joinCode.trim().toUpperCase()
    setRoomCode(code)
    setCurrentDeviceRole(role)
    saveDeviceConfig(code, { token: deviceToken, role, name: deviceName, deviceType })
    setRoleWarning("")
    setError("")
    if (role === "blue_button" || role === "red_button") setButtonRole(role)
    localStorage.setItem("people-says-room-code", code)
    navigate("/join/lobby")
    setScreenState("joinLobby")
  }
  const changeLobbyRole = (role: DeviceRole) => {
    setCurrentDeviceRole(role)
    if (role === "blue_button" || role === "red_button") setButtonRole(role)
    saveDeviceConfig(roomCode, { token: deviceToken, role, name: deviceName, deviceType })
    gameSocket.emit("room:join", {
      code: roomCode,
      role,
      name: deviceName,
      deviceType,
      hostToken,
      deviceToken,
    })
    if (state.phase !== "lobby") {
      if (role === "host") setScreen("host")
      if (role === "display") setScreen("display")
      if (role === "blue_button" || role === "red_button") setScreen("buzzer")
    }
  }
  const startNewGame = () => {
    if (savedRoomCode && savedHostToken) {
      setShowResumeDialog(true)
      return
    }
    setScreen("create")
  }
  const resumeSavedGame = () => {
    setShowResumeDialog(false)
    setRoomCode(savedRoomCode)
    setHostToken(savedHostToken)
    setScreen("lobby", `/${savedRoomCode}/lobby`)
  }
  const discardSavedGame = () => {
    localStorage.clear()
    const newDeviceToken = crypto.randomUUID()
    setDeviceToken(newDeviceToken)
    localStorage.setItem("people-says-device-token", newDeviceToken)
    sessionStorage.setItem("people-says-device-token", newDeviceToken)
    setShowResumeDialog(false)
    setRoomCode("")
    setHostToken("")
    setScreen("create", "/create")
  }
  const changeDeviceConfiguration = () => {
    const code = roomCode || joinCode.trim().toUpperCase()
    saveDeviceConfig(code, {
      token: deviceToken,
      role: "pending",
      name: deviceName,
      deviceType,
    })
    gameSocket.emit("room:join", {
      code,
      role: "pending",
      name: deviceName,
      deviceType,
      deviceToken,
    })
    setCurrentDeviceRole("pending")
    setPendingRegistered(true)
    setJoinStage("name")
    navigate("/join/device")
    setScreenState("join")
  }
  const pasteJoinCode = async () => {
    const pasted = await navigator.clipboard.readText()
    setJoinCode(
      pasted
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8)
        .toUpperCase()
    )
    window.setTimeout(() => otpRefs.current[Math.min(pasted.length, 8) - 1]?.focus(), 0)
  }
  const validateAndJoin = async () => {
    if (joinCode.length !== 8) return
    setError("")
    setLoadingAction("join")
    try {
      const code = joinCode.toUpperCase()
      const response = await fetch(`${api}/api/rooms/${code}`)
      const data = await response.json()
      if (!response.ok) throw new Error("La sala no existe o ya no está disponible.")
      setRoomCode(code)
      setState((old) => ({ ...old, ...data.state }))
      setJoinRoute("name")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo validar la sala")
    } finally {
      setLoadingAction(null)
    }
  }
  const acceptJoinInvitation = () => {
    const code = joinCode.trim().toUpperCase()
    localStorage.setItem("people-says-room-code", code)
    localStorage.removeItem("people-says-host-token")
    saveDeviceConfig(code, {
      token: deviceToken,
      role: "pending",
      name: deviceName,
      deviceType,
    })
    setRoomCode(code)
    setHostToken("")
    setJoinCode(code)
    setCurrentDeviceRole("pending")
    setJoinRoute("name")
    setPendingRegistered(true)
    setScreenState("join")
  }
  const keepPreviousSession = () => {
    if (!savedRoomCode) return
    const savedConfig = getSavedDeviceConfigForCode(savedRoomCode)
    setRoomCode(savedRoomCode)
    setJoinCode(savedRoomCode)
    setHostToken(savedHostToken)
    setCurrentDeviceRole(savedConfig?.role ?? (savedHostToken ? "host" : "pending"))
    if (savedHostToken) {
      setScreen("lobby")
    } else {
      navigate("/join/lobby")
      setScreenState("joinLobby")
    }
  }
  const leaveInvitation = () => {
    window.close()
    window.setTimeout(() => setScreen("home"), 100)
  }
  const start = () => {
    const roles = [currentDeviceRole, ...devices.map((device) => device.role)]
    const roleSet = new Set(roles)
    const validCombination =
      (roles.length === 1 && roleSet.has("host")) ||
      (roles.length === 2 && roleSet.size === 2 && roleSet.has("host") && roleSet.has("display")) ||
      (roles.length === 4 &&
        roleSet.size === 4 &&
        ["host", "display", "blue_button", "red_button"].every((role) => roleSet.has(role)))
    if (!validCombination) {
      setError(
        roles.length === 3
          ? "Para iniciar necesitas 1, 2 o 4 dispositivos. Con 3 dispositivos no se puede comenzar."
          : "La sala debe tener Presentador; con 2 dispositivos agrega Pantalla pública, o completa los 4 roles."
      )
      return
    }
    setError("")
    setLoadingAction("start")
    emitAction({ type: "start" })
    window.setTimeout(() => {
      setLoadingAction(null)
      if (currentDeviceRole === "host") setScreen("host")
      if (currentDeviceRole === "display") setScreen("display")
      if (currentDeviceRole === "blue_button" || currentDeviceRole === "red_button") {
        setButtonRole(currentDeviceRole)
        setScreen("buzzer")
      }
    }, 350)
  }
  const reveal = (index: number) => {
    if (!revealed.includes(index)) emitAction({ type: "reveal_answer", index })
  }
  const teamId = state.control ?? "blue"
  const teamName = teamId === "blue" ? teams[0].name : teams[1].name
  const connectedDeviceCount = devices.length + 1
  const roundMultiplier = state.roundConfigs[state.roundIndex]?.multiplier ?? 1
  const baseRoundPoints = revealed.reduce(
    (total, index) => total + (answers[index]?.points ?? 0),
    0
  )
  const multipliedRoundPoints = baseRoundPoints * roundMultiplier
  useEffect(() => {
    if (screen === "joinLobby" && state.phase !== "lobby") {
      if (currentDeviceRole === "host") setScreen("host")
      if (currentDeviceRole === "display") setScreen("display")
      if (currentDeviceRole === "blue_button" || currentDeviceRole === "red_button") {
        setButtonRole(currentDeviceRole)
        setScreen("buzzer")
      }
      return
    }
    if (
      state.phase === "lobby" &&
      ["host", "faceoff", "decision", "steal", "roundResult", "display", "buzzer"].includes(screen)
    ) {
      if (hostToken) {
        setScreen("lobby")
      } else {
        navigate("/join/lobby")
        setScreenState("joinLobby")
      }
      return
    }
    if (state.phase === "lobby" && screen === "join" && currentDeviceRole !== "pending") {
      navigate("/join/lobby")
      setScreenState("joinLobby")
      return
    }
    if (state.phase === "final") setScreen("final")
    if (
      ["faceoff", "decision", "turn", "steal", "round_result", "tiebreaker"].includes(
        state.phase
      ) &&
      ["lobby", "joinLobby"].includes(screen)
    ) {
      if (currentDeviceRole === "host") setScreen("host")
      if (currentDeviceRole === "display") setScreen("display")
      if (currentDeviceRole === "blue_button" || currentDeviceRole === "red_button") {
        setButtonRole(currentDeviceRole)
        setScreen("buzzer")
      }
      return
    }
    if (state.phase === "steal" && screen === "host") setScreen("steal")
    if (state.phase === "decision" && screen === "faceoff") setScreen("decision")
    if (state.phase === "turn" && (screen === "faceoff" || screen === "decision")) setScreen("host")
  }, [state.phase, screen, currentDeviceRole, hostToken, roomCode])
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
            <Button onClick={startNewGame}>
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
        {showResumeDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-5">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="resume-game-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-xl"
            >
              <h2 id="resume-game-title" className="text-xl font-semibold text-stone-900">
                Tienes una partida guardada
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Encontramos una partida anterior. ¿Quieres retomarla o prefieres comenzar una nueva?
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button ghost onClick={discardSavedGame}>
                  Comenzar una nueva
                </Button>
                <Button onClick={resumeSavedGame}>Retomar partida</Button>
              </div>
            </div>
          </div>
        )}
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
                onChange={(event) => changeLobbyRole(event.target.value as DeviceRole)}
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
                    {device.role === "pending" ? (
                      <span className="grid aspect-square size-12 shrink-0 place-items-center rounded-lg bg-stone-100">
                        <DeviceTypeIcon type={device.deviceType ?? "desktop"} />
                      </span>
                    ) : (
                      <DeviceRoleIcon role={device.role as DeviceRole} muted />
                    )}
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
                        className={`size-2 rounded-full ${device.role === "pending" ? "animate-pulse bg-stone-400" : "bg-emerald-600"}`}
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
        {error && <p className="mt-4 text-right text-sm text-red-700">{error}</p>}
      </Shell>
    )
  if (screen === "joinInvite")
    return (
      <main className="min-h-screen px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col items-center justify-center">
          <Brand />
          <div className="mt-10 w-full rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
              Invitación a partida
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              ¿Quieres unirte a esta partida?
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
              Confirma que deseas conectarte a esta sesión.
            </p>
            <div className="mt-7 rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
              <p className="text-xs font-medium text-stone-500">Código de partida</p>
              <p className="mt-2 text-4xl font-black tracking-widest text-emerald-900">
                {joinCode || "—"}
              </p>
            </div>
            {savedRoomCode && savedRoomCode !== joinCode && (
              <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-yellow-800">
                      Partida actual
                    </p>
                    <p className="mt-1 text-2xl font-black tracking-widest text-yellow-950">
                      {savedRoomCode}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-yellow-800">
                    {savedHostToken ? "Conectado" : "Desconectado"}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={acceptJoinInvitation}>
                Sí, unirme a la partida <ArrowRight size={16} aria-hidden="true" />
              </Button>
              {savedRoomCode && savedRoomCode !== joinCode && (
                <Button secondary className="w-full" onClick={keepPreviousSession}>
                  No, quedarme en la anterior
                </Button>
              )}
              <Button
                ghost
                className="w-full text-red-600 hover:text-red-700"
                onClick={leaveInvitation}
              >
                <LogOut size={14} aria-hidden="true" /> Salir de la partida
              </Button>
            </div>
          </div>
        </div>
      </main>
    )
  if (screen === "join" && isJoinEntryLocation())
    return (
      <main className="min-h-screen px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center">
          <Brand />
          <div className="mt-12 w-full text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Unirse a una sala</h1>
            <p className="mt-3 text-sm text-stone-500">Escribe el código de 8 caracteres.</p>
            <div
              className="mx-auto mt-8 flex justify-center gap-1 sm:gap-2"
              onPaste={(event) => {
                event.preventDefault()
                const pasted = event.clipboardData
                  .getData("text")
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .slice(0, 8)
                  .toUpperCase()
                setJoinCode(pasted)
                otpRefs.current[Math.min(pasted.length, 8) - 1]?.focus()
              }}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    otpRefs.current[index] = element
                  }}
                  value={joinCode[index] ?? ""}
                  maxLength={1}
                  disabled={loadingAction === "join"}
                  inputMode="text"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  placeholder="-"
                  aria-label={`Carácter ${index + 1} del código`}
                  onChange={(event) => {
                    const value = event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
                    const characters = joinCode.padEnd(8, " ").split("")
                    characters[index] = value
                    setJoinCode(characters.join("").replace(/\s+$/g, ""))
                    if (value && index < 7) otpRefs.current[index + 1]?.focus()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace") {
                      event.preventDefault()
                      const characters = joinCode.padEnd(8, " ").split("")
                      characters[index] = " "
                      setJoinCode(characters.join("").replace(/\s+$/g, ""))
                      if (index > 0) otpRefs.current[index - 1]?.focus()
                    }
                  }}
                  className={cx(
                    "h-[clamp(3rem,14vw,3.5rem)] w-[clamp(2rem,10vw,3.5rem)] rounded-xl border border-stone-200 bg-white text-center text-xl !font-black uppercase text-emerald-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-stone-100",
                    "sm:size-14 sm:text-3xl sm:tracking-widest md:h-24 md:w-14 md:!text-3xl"
                  )}
                />
              ))}
            </div>
            <Button
              ghost
              className="mt-4 w-full text-emerald-800"
              disabled={loadingAction === "join"}
              onClick={pasteJoinCode}
            >
              <ClipboardPaste size={16} aria-hidden="true" /> Pegar
            </Button>
            <Button
              className="mt-3 w-full"
              disabled={joinCode.length !== 8}
              loading={loadingAction === "join"}
              onClick={validateAndJoin}
            >
              <LogIn size={16} aria-hidden="true" /> Unirme a la sala
            </Button>
            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
          </div>
        </div>
      </main>
    )
  if (screen === "joinLobby")
    return (
      <main className="min-h-screen px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col items-center justify-center">
          <div className="scale-125">
            <Brand />
          </div>
          <div className="mt-10 w-full rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto grid size-16 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
              <LoaderCircle
                size={32}
                strokeWidth={1.8}
                className="animate-spin"
                aria-hidden="true"
              />
            </div>
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
              <span
                className="size-2 animate-pulse rounded-full bg-yellow-500"
                aria-hidden="true"
              />
              En sala de espera
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">Esperando inicio...</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
              Tu dispositivo ya está vinculado. La partida comenzará en breve.
            </p>
            <div className="mt-7 rounded-xl border border-stone-200 bg-stone-50 p-4 text-left">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <span className="text-stone-500">Partida</span>
                <span className="text-right font-semibold text-stone-900">{gameName}</span>
                <span className="text-stone-500">Nombre del dispositivo</span>
                <span className="text-right font-semibold text-stone-900">{deviceName}</span>
                <span className="text-stone-500">Tipo de dispositivo</span>
                <span className="flex items-center justify-end gap-2 font-semibold text-stone-900">
                  <DeviceTypeIcon type={deviceType} /> {deviceTypeLabels[deviceType]}
                </span>
                <span className="text-stone-500">Rol</span>
                <span className="text-right font-semibold text-stone-900">
                  {deviceRoleLabels[currentDeviceRole]}
                </span>
                <span className="text-stone-500">Conexión</span>
                <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-emerald-700">
                  <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
                  Vinculado
                </span>
              </div>
            </div>
            <Button secondary className="mt-5 w-full" onClick={changeDeviceConfiguration}>
              <Settings2 size={16} aria-hidden="true" /> Cambiar configuración del dispositivo
            </Button>
            <Button
              ghost
              className="mt-4 w-full text-xs text-red-600 hover:text-red-700"
              onClick={() => {
                window.close()
                window.setTimeout(() => setScreen("home"), 100)
              }}
            >
              <LogOut size={14} aria-hidden="true" /> Salir de la vinculación
            </Button>
          </div>
        </div>
      </main>
    )
  if (screen === "join" && isPrincipalDevice)
    return (
      <main className="min-h-screen px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col items-center justify-center">
          <div className="scale-125">
            <Brand />
          </div>
          <div className="mt-10 w-full rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto grid size-16 place-items-center rounded-xl bg-emerald-900 text-white">
              <DeviceRoleIcon role="host" active />
            </div>
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
              Dispositivo principal
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">Sala configurada</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
              Este dispositivo administra la partida. Regresa al lobby para continuar.
            </p>
            <div className="mt-7 rounded-xl border border-stone-200 bg-stone-50 p-4 text-left">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <span className="text-stone-500">Partida</span>
                <span className="text-right font-semibold text-stone-900">{gameName}</span>
                <span className="text-stone-500">Nombre del dispositivo</span>
                <span className="text-right font-semibold text-stone-900">{deviceName}</span>
                <span className="text-stone-500">Rol</span>
                <span className="text-right font-semibold text-stone-900">Presentador</span>
                <span className="text-stone-500">Conexión</span>
                <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-emerald-700">
                  <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
                  Vinculado
                </span>
              </div>
            </div>
            <Button
              className="mt-5 w-full"
              onClick={() => setScreen("lobby", `/${roomCode}/lobby`)}
            >
              Ir al lobby <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button
              ghost
              className="mt-4 w-full text-xs text-red-600 hover:text-red-700"
              onClick={() => {
                window.close()
                window.setTimeout(() => setScreen("home"), 100)
              }}
            >
              <LogOut size={14} aria-hidden="true" /> Salir de la vinculación
            </Button>
          </div>
        </div>
      </main>
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
          {roleWarning && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
              <AlertTriangle size={22} className="shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Tu rol ya no está disponible</p>
                <p className="mt-1">{roleWarning}</p>
              </div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
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
                      className={cx(
                        "h-auto min-h-28 justify-start text-left",
                        occupied && "bg-stone-100 text-stone-400 hover:bg-stone-100"
                      )}
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
        <div className="mb-4 flex justify-end">{pauseControl}</div>
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
        <div className="mb-4 flex justify-end">{pauseControl}</div>
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
        {strikeVisible && (
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-red-950/10">
            <SquareX
              size={132}
              strokeWidth={1.5}
              className="animate-bounce text-red-600 drop-shadow-2xl"
              aria-label="Strike registrado"
            />
          </div>
        )}
        <Heading
          k="Juego en curso"
          title="Panel de presentador"
          detail="Controla la ronda, revela respuestas y administra el marcador."
          aside={
            <div className="flex min-w-56 items-stretch text-left">
              <div className="rounded-l-2xl rounded-r-none border border-r-0 border-stone-200 bg-white p-4">
                <div className="grid grid-cols-[auto_auto_auto] items-stretch justify-center gap-4 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-xs font-black uppercase text-emerald-900">
                        RONDA {String(state.roundIndex + 1).padStart(2, "0")}
                      </p>
                      <span className="text-sm font-bold text-stone-300" aria-hidden="true">
                        ·
                      </span>
                      <p className="text-xs font-semibold text-stone-400">x{roundMultiplier}</p>
                    </div>
                    <span className="mt-1 inline-flex rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                      {["faceoff", "tiebreaker"].includes(state.phase)
                        ? "Enfrentamiento"
                        : "Normal"}
                    </span>
                  </div>
                  <div className="w-px bg-stone-200" aria-hidden="true" />
                  <div className="flex flex-col items-center justify-center text-center">
                    <p className="text-5xl font-black tabular-nums text-emerald-900">
                      {roundMultiplier > 1 && (
                        <span className="mr-2 text-lg text-stone-400 line-through">
                          {baseRoundPoints}
                        </span>
                      )}
                      {multipliedRoundPoints}
                    </p>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                      puntos
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex min-w-28 flex-col overflow-hidden rounded-r-2xl border border-l-0 border-stone-200 p-0">
                <div className="flex flex-1 items-stretch bg-gradient-to-r from-blue-100 to-white text-left text-blue-950 first:rounded-tr-2xl">
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate pl-3 text-xs font-bold">
                      {teams[0].name}
                    </p>
                    <strong className="flex self-stretch items-center bg-blue-600 px-3 py-0 text-lg font-black tabular-nums text-white">
                      {blue}
                    </strong>
                  </div>
                </div>
                <div className="flex flex-1 items-stretch bg-gradient-to-r from-red-100 to-white text-left text-red-950 last:rounded-br-2xl">
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate pl-3 text-xs font-bold">
                      {teams[1].name}
                    </p>
                    <strong className="flex self-stretch items-center bg-red-600 px-3 py-0 text-lg font-black tabular-nums text-white">
                      {red}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          }
        />
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="grid items-start gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            <section className="rounded-2xl bg-gradient-to-r from-blue-100/80 via-slate-50 to-red-100/80 p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Enfrentamiento
              </h2>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                <div className="min-w-0 rounded-lg bg-white/85 px-2 py-2 text-center shadow-sm">
                  <p className="truncate text-[10px] font-bold text-blue-700">Azul</p>
                  <p className="truncate text-sm font-black text-blue-950">
                    {state.faceoff?.bluePlayer ?? "—"}
                  </p>
                </div>
                <span className="text-xs font-black text-stone-400">VS</span>
                <div className="min-w-0 rounded-lg bg-white/85 px-2 py-2 text-center shadow-sm">
                  <p className="truncate text-[10px] font-bold text-red-700">Rojo</p>
                  <p className="truncate text-sm font-black text-red-950">
                    {state.faceoff?.redPlayer ?? "—"}
                  </p>
                </div>
              </div>
            </section>
            <div className="rounded-xl bg-emerald-950 px-4 py-4 text-white">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                Pregunta
              </p>
              <h2 className="text-lg font-bold leading-snug sm:text-xl">{state.questionPrompt}</h2>
            </div>
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Respuestas
              </h2>
              <div className="grid gap-1 md:grid-cols-2">
                {answers.map((answer, index) => {
                  const visible = revealed.includes(index)
                  return (
                    <button
                      key={`${answer.text}-${index}`}
                      disabled={state.phase !== "turn"}
                      onClick={() => reveal(index)}
                      className={cx(
                        "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                        visible
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-stone-200 bg-white hover:border-emerald-500"
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-stone-100 text-sm text-stone-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-sm font-semibold">{answer.text}</span>
                      <span className="font-bold tabular-nums">
                        {visible ? answer.points : "-"}
                      </span>
                      <span
                        className={cx(
                          "w-16 text-right text-[10px] font-semibold",
                          visible ? "text-emerald-800" : "text-stone-400"
                        )}
                      >
                        {visible ? "VISIBLE" : "OCULTA"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
          <aside className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button secondary onClick={pauseGame}>
                <Pause size={16} aria-hidden="true" /> Pausar partida
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={() => emitAction({ type: "end" })}
              >
                <SquareX size={16} aria-hidden="true" /> Terminar partida
              </Button>
            </div>
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <button
                type="button"
                className={cx(
                  "flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-stone-50",
                  showConnectedDevices ? "rounded-t-2xl bg-stone-50" : "rounded-2xl"
                )}
                aria-expanded={showConnectedDevices}
                onClick={() => setShowConnectedDevices((visible) => !visible)}
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <DeviceIconAnimation
                    className="size-6"
                    iconClassName="text-emerald-700"
                    size={24}
                  />
                  <span
                    className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-white bg-emerald-500"
                    aria-label="Conectado"
                    title="Conectado"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-900">
                    Dispositivos conectados
                  </h2>
                  <p className="text-xs text-stone-500">Partida actual</p>
                </div>
                <span className="text-2xl font-black tabular-nums text-stone-900">
                  {connectedDeviceCount}
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={cx(
                    "shrink-0 text-stone-500 transition-transform",
                    showConnectedDevices && "rotate-180"
                  )}
                />
              </button>
              <div
                className={cx(
                  "connected-devices-list px-4",
                  showConnectedDevices
                    ? "connected-devices-list-open border-t border-stone-100 pb-4 pt-2"
                    : "connected-devices-list-closed py-0"
                )}
              >
                <div>
                  <div className="flex items-center gap-3 border-b border-stone-100 py-3">
                    <DeviceRoleIcon role={currentDeviceRole} muted compact />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold uppercase tracking-wider text-stone-700">
                        {deviceRoleLabels[currentDeviceRole]}
                      </p>
                      <p className="truncate text-[11px] text-stone-500">{deviceName}</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800">
                      <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
                      Conectado
                    </span>
                  </div>
                  {devices.map((device, index) => (
                    <div
                      key={`${device.role}-${device.id ?? index}`}
                      className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-b-0"
                    >
                      {device.role === "pending" ? (
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-stone-100">
                          <DeviceTypeIcon type={device.deviceType ?? "desktop"} size={18} />
                        </span>
                      ) : (
                        <DeviceRoleIcon role={device.role as DeviceRole} muted compact />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold uppercase tracking-wider text-stone-700">
                          {deviceRoleLabels[device.role as DeviceRole] ?? device.role}
                        </p>
                        <p className="truncate text-[11px] text-stone-500">
                          {device.name ?? "Dispositivo"}
                        </p>
                      </div>
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${device.role === "pending" ? "text-stone-400" : "text-emerald-800"}`}
                      >
                        <span
                          className={`size-2 rounded-full ${device.role === "pending" ? "animate-pulse bg-stone-400" : "bg-emerald-600"}`}
                          aria-hidden="true"
                        />
                        {device.role === "pending" ? "Pendiente" : "Conectado"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-900">
                    Temporizador
                  </h2>
                  <span className="group relative inline-flex">
                    <Info
                      size={15}
                      strokeWidth={2}
                      className="cursor-help text-stone-400 transition-colors group-hover:text-stone-700"
                      aria-label="Información del temporizador"
                    />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-center text-xs font-medium normal-case tracking-normal text-white shadow-lg group-hover:block">
                      Activa el temporizador después de hacer la pregunta para comenzar a contar el
                      tiempo para responder.
                    </span>
                  </span>
                </div>
                <span className="text-2xl font-black tabular-nums text-stone-900">
                  {timerSeconds}s
                </span>
              </div>
              <Button
                className="mt-3 w-full"
                disabled={timerRunning}
                onClick={() => {
                  setTimerSeconds(30)
                  setTimerRunning(true)
                }}
              >
                <Timer size={16} aria-hidden="true" />
                Ya hice la pregunta
              </Button>
              <p className="mt-2 text-xs text-stone-500">Comienza el tiempo para responder.</p>
            </section>
            <section className="hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Enfrentamiento
              </p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                <div className="min-w-0 rounded-lg bg-blue-50 px-2 py-2 text-center">
                  <p className="truncate text-[10px] font-bold text-blue-700">Azul</p>
                  <p className="truncate text-sm font-black text-blue-950">
                    {state.faceoff?.bluePlayer ?? "—"}
                  </p>
                </div>
                <span className="text-xs font-black text-stone-400">VS</span>
                <div className="min-w-0 rounded-lg bg-red-50 px-2 py-2 text-center">
                  <p className="truncate text-[10px] font-bold text-red-700">Rojo</p>
                  <p className="truncate text-sm font-black text-red-950">
                    {state.faceoff?.redPlayer ?? "—"}
                  </p>
                </div>
              </div>
              <div className="hidden">
                <button
                  type="button"
                  className="min-h-10 cursor-pointer rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!["faceoff", "tiebreaker"].includes(state.phase)}
                  onClick={() => emitAction({ type: "faceoff_answer", team: "blue", index: 0 })}
                >
                  Pulsador azul
                </button>
                <button
                  type="button"
                  className="min-h-10 cursor-pointer rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!["faceoff", "tiebreaker"].includes(state.phase)}
                  onClick={() => emitAction({ type: "faceoff_answer", team: "red", index: 1 })}
                >
                  Pulsador rojo
                </button>
              </div>
            </section>
            <section className="hidden rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Errores
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((index) => {
                    const active = index < Math.max(state.strikes.blue, state.strikes.red)
                    return (
                      <span key={index} className="relative block size-9" aria-hidden="true">
                        {active ? (
                          <SquareX size={36} strokeWidth={1.8} className="text-red-600" />
                        ) : (
                          <>
                            <SquareDashed size={36} strokeWidth={1.8} className="text-stone-300" />
                            <X
                              className="absolute inset-0 m-auto text-stone-300"
                              size={15}
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </span>
                    )
                  })}
                </div>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setStrikeVisible(true)
                    emitAction({ type: "strike", team: teamId, source: "manual" })
                  }}
                >
                  <SquareX size={16} aria-hidden="true" /> Error
                </Button>
              </div>
            </section>
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
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Pulsadores manuales
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-b-8 border-blue-800 bg-blue-600 px-5 py-4 text-left text-white shadow-lg transition-all duration-150 hover:-translate-y-1 hover:scale-[1.02] hover:brightness-105 hover:shadow-xl active:translate-y-1 active:scale-[0.98] active:border-b-0 active:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!["faceoff", "tiebreaker"].includes(state.phase)}
                  onClick={() => emitAction({ type: "faceoff_answer", team: "blue", index: 0 })}
                >
                  <Hand size={32} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    <span className="block text-xl font-black">{state.teams[0].name}</span>
                    <span className="mt-1 block text-xs font-semibold text-blue-100">
                      Equipo azul
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-b-8 border-red-800 bg-red-600 px-5 py-4 text-left text-white shadow-lg transition-all duration-150 hover:-translate-y-1 hover:scale-[1.02] hover:brightness-105 hover:shadow-xl active:translate-y-1 active:scale-[0.98] active:border-b-0 active:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!["faceoff", "tiebreaker"].includes(state.phase)}
                  onClick={() => emitAction({ type: "faceoff_answer", team: "red", index: 1 })}
                >
                  <Hand size={32} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    <span className="block text-xl font-black">{state.teams[1].name}</span>
                    <span className="mt-1 block text-xs font-semibold text-red-100">
                      Equipo rojo
                    </span>
                  </span>
                </button>
              </div>
            </section>
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Errores
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((index) => {
                    const active = index < Math.max(state.strikes.blue, state.strikes.red)
                    return (
                      <span key={index} className="relative block size-10" aria-hidden="true">
                        {active ? (
                          <SquareX size={40} strokeWidth={1.8} className="text-red-600" />
                        ) : (
                          <>
                            <SquareDashed size={40} strokeWidth={1.8} className="text-stone-300" />
                            <X
                              className="absolute inset-0 m-auto text-stone-300"
                              size={17}
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </span>
                    )
                  })}
                </div>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setStrikeVisible(true)
                    emitAction({ type: "strike", team: teamId, source: "manual" })
                  }}
                >
                  <SquareX size={16} aria-hidden="true" /> Error
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </Shell>
    )
  if (screen === "steal")
    return (
      <Shell>
        <div className="mb-4 flex justify-end">{pauseControl}</div>
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
        <div className="flex justify-end">{pauseControl}</div>
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
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-5 py-10 text-white">
        <div className="display-floating-accent display-floating-accent-right pointer-events-none absolute -right-40 -top-48 size-[480px] rounded-full border-[65px] border-white/5" />
        <div className="display-floating-accent display-floating-accent-left pointer-events-none absolute -bottom-36 -left-28 size-[360px] rounded-full border-[50px] border-white/5" />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="flex justify-end">{pauseControl}</div>
          <p className="text-center text-2xl font-bold">La gente dice.</p>
          <div className="mb-4 text-center">
            <strong className="block text-7xl font-black leading-none tabular-nums tracking-tight text-amber-300 sm:text-8xl lg:text-9xl">
              {multipliedRoundPoints}
            </strong>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-amber-100/80 sm:text-xs">
              Ronda {String(state.roundIndex + 1).padStart(2, "0")} · x{roundMultiplier}
            </p>
          </div>
          <div className="mt-8 grid w-full items-center gap-4 lg:grid-cols-[1fr_5fr_1fr]">
            <div className="mb-4 rounded-2xl border border-white/20 bg-gradient-to-bl from-blue-950/60 via-blue-700/40 to-blue-300/20 px-4 py-4 text-center shadow-lg backdrop-blur-sm">
              <p className="text-sm font-black uppercase tracking-wide text-blue-100">
                {teams[0].name}
              </p>
              <strong className="block text-3xl font-black leading-none tabular-nums text-white sm:text-5xl lg:text-6xl">
                {blue}
              </strong>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                Puntos
              </p>
            </div>
            <div>
              <div className="mb-4 rounded-2xl border border-white/20 bg-black/20 px-4 py-4 text-center shadow-lg">
                <p className="text-2xl font-black text-white sm:text-3xl">{state.questionPrompt}</p>
              </div>
              <div className="mb-4 rounded-2xl border border-white/20 bg-black/20 px-4 py-4 text-center shadow-lg">
                <div className="grid gap-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-5">
                  {answers.length === 0 &&
                    [0, 1, 2, 3, 4].map((index) => (
                      <Skeleton key={`answer-skeleton-${index}`} className="h-20 bg-white/10" />
                    ))}
                  {answers.map((answer, index) => {
                    const visible = revealed.includes(index)
                    return visible ? (
                      <div
                        key={`${answer.text}-${index}`}
                        className="flex min-h-[74px] items-stretch overflow-hidden rounded-xl border border-amber-200/60 bg-white/20 shadow-md sm:min-h-[88px]"
                      >
                        <div className="grid w-11 shrink-0 place-items-center border-r border-white/15 bg-black/20 text-base font-black tabular-nums text-amber-200 sm:w-14 sm:text-xl">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center px-3 sm:px-5">
                          <span className="truncate text-lg font-black text-white sm:text-2xl">
                            {answer.text}
                          </span>
                        </div>
                        <div className="grid w-14 shrink-0 place-items-center border-l border-white/15 bg-amber-300 text-xl font-black tabular-nums text-emerald-950 sm:w-20 sm:text-3xl">
                          {answer.points}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`${answer.text}-${index}`}
                        className="flex min-h-[74px] items-stretch overflow-hidden rounded-xl border border-white/20 bg-black/20 shadow-md sm:min-h-[88px]"
                      >
                        <div className="grid w-full shrink-0 place-items-center border-r border-white/15 text-base font-black tabular-nums text-amber-200 sm:text-5xl">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="mb-4 rounded-2xl border border-white/20 bg-gradient-to-br from-red-950/60 via-red-700/40 to-red-300/20 px-4 py-4 text-center shadow-lg backdrop-blur-sm">
              <p className="text-sm font-black uppercase tracking-wide text-red-100">
                {teams[1].name}
              </p>
              <strong className="block text-3xl font-black leading-none tabular-nums text-white sm:text-5xl lg:text-6xl">
                {red}
              </strong>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                Puntos
              </p>
            </div>
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
