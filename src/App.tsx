import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  ClipboardPaste,
  ChevronDown,
  Clock3,
  ExternalLink,
  Hand,
  Info,
  Lock,
  LoaderCircle,
  LogIn,
  LogOut,
  Maximize2,
  Unlink,
  Pause,
  Pointer,
  SquareDashed,
  SquareX,
  Settings2,
  Timer,
  X,
} from "lucide-react"
import { gameSocket } from "./socket"
import {
  Button,
  AnimatedNumber,
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
import { GameSetupStep, QuestionsStep, RoundsStep, TeamsStep } from "./components/setup-wizard"
import type { SetupCategory, SetupModeOption, SetupQuestion } from "./components/setup-wizard"
import { cx } from "./lib/cx"

type Screen =
  | "home"
  | "rules"
  | "create"
  | "teams"
  | "rounds"
  | "questions"
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
type Mode = "classic" | "auto"
type DeviceRole = "host" | "display" | "blue_button" | "red_button" | "pending"
type Team = { name: string; color: "blue" | "red"; players: string[] }
type RoundDraft = { answerCount: string; multiplier: 1 | 2 | 3 }
type CreateDraft = {
  gameName: string
  mode: Mode
  teams: Team[]
  rounds: RoundDraft[]
  selectedCategoryIds: number[]
  selectedQuestions: SetupQuestion[]
  screen: Screen
}
type Answer = { text: string; points: number }
type State = {
  activeTeam?: "blue" | "red" | null
  phase: string
  roundIndex: number
  roundConfigs: Array<{ answerCount: number; multiplier: number }>
  questionPrompt?: string
  answers?: Answer[]
  answerCount?: number
  revealed: number[]
  strikes: { blue: number; red: number }
  faceoffStrikes?: { blue: number; red: number }
  faceoffStrikeTeam?: "blue" | "red"
  strikeLimit?: 3 | 5
  displayStrikes?: { blue: number; red: number }
  activePlayerId?: number | null
  activePlayer?: { id: number; name: string; team: "blue" | "red" } | null
  pot: number
  scores: { blue: number; red: number }
  turnIndex: { blue: number; red: number }
  control: "blue" | "red" | null
  stealTeam?: "blue" | "red" | null
  faceoff?: {
    bluePlayer?: string
    redPlayer?: string
    firstTeam?: "blue" | "red"
    activeTeam?: "blue" | "red"
    firstIndex?: number
  }
  teams: [{ name: string; players: string[] }, { name: string; players: string[] }]
  roundQuestions?: Array<{ roundIndex: number; questionId: number; prompt: string }>
  roundWinner?: "blue" | "red" | null
  roundPoints?: number
}
const screens: Screen[] = [
  "home",
  "rules",
  "create",
  "teams",
  "rounds",
  "questions",
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
  turnIndex: { blue: 0, red: 0 },
  control: null,
  teams: [
    { name: "Azul", players: ["Ana"] },
    { name: "Rojo", players: ["Sofía"] },
  ],
}
const modes: SetupModeOption[] = [
  {
    id: "classic",
    title: "Juego clásico",
    detail:
      "Controla la partida desde un dispositivo y conecta hasta tres dispositivos adicionales para mostrar el tablero o usar pulsadores.",
    devices: "De 1 a 4 dispositivos",
  },
  {
    id: "auto",
    title: "Modo automático",
    detail:
      "La máquina presenta y administra la partida mientras de dos a tres dispositivos participan como pantalla o pulsadores.",
    devices: "De 2 a 3 dispositivos",
  },
]
const createDraftKey = "people-says-create-draft"
const readCreateDraft = (): Partial<CreateDraft> => {
  try {
    return JSON.parse(localStorage.getItem(createDraftKey) ?? "{}") as Partial<CreateDraft>
  } catch {
    return {}
  }
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedDeviceConfig = getSavedDeviceConfig()
  const savedCreateDraft = readCreateDraft()
  const [screen, setScreenState] = useState<Screen>(() =>
    screenFromLocation() === "home" ? (savedCreateDraft.screen ?? "home") : screenFromLocation()
  )
  const [mode, setMode] = useState<Mode>(savedCreateDraft.mode ?? "classic")
  const [state, setState] = useState<State>(defaultState)
  const [gameName, setGameName] = useState(savedCreateDraft.gameName ?? "")
  const [categories, setCategories] = useState<SetupCategory[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
    savedCreateDraft.selectedCategoryIds ?? []
  )
  const [teams, setTeams] = useState<Team[]>(
    savedCreateDraft.teams ?? [
      { name: "Azul", color: "blue", players: [""] },
      { name: "Rojo", color: "red", players: [""] },
    ]
  )
  const [rounds, setRounds] = useState<RoundDraft[]>(
    savedCreateDraft.rounds ?? [
      { answerCount: "10", multiplier: 1 },
      { answerCount: "8", multiplier: 1 },
      { answerCount: "6", multiplier: 1 },
      { answerCount: "5", multiplier: 2 },
      { answerCount: "4", multiplier: 3 },
    ]
  )
  const [selectedQuestions, setSelectedQuestions] = useState<SetupQuestion[]>(
    savedCreateDraft.selectedQuestions ?? []
  )
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionLoadingRound, setQuestionLoadingRound] = useState<number | null>(null)
  const [roomCode, setRoomCode] = useState(
    () => roomCodeFromLocation() || localStorage.getItem("people-says-room-code") || ""
  )
  const [roomLoading, setRoomLoading] = useState(() => isEditLocation())
  const [hostToken, setHostToken] = useState(
    () => localStorage.getItem("people-says-host-token") ?? ""
  )
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [showLeaveDisplayDialog, setShowLeaveDisplayDialog] = useState(false)
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
  const [activeTeam, setActiveTeam] = useState<"blue" | "red" | null>(null)
  const [socketConnected, setSocketConnected] = useState(() => gameSocket.connected)
  const [buttonRole, setButtonRole] = useState<"blue_button" | "red_button">("blue_button")
  const [currentDeviceRole, setCurrentDeviceRole] = useState<DeviceRole>(
    () => savedDeviceConfig?.role ?? "host"
  )
  const [devices, setDevices] = useState<
    Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
  >([])
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<"code" | "url" | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrLoaded, setQrLoaded] = useState(false)
  const [lobbyQrLoaded, setLobbyQrLoaded] = useState(false)
  const [loadingAction, setLoadingAction] = useState<
    "create" | "teams" | "rounds" | "start" | "join" | null
  >(null)
  const [showConnectedDevices, setShowConnectedDevices] = useState(false)
  const [showLobbyQuestions, setShowLobbyQuestions] = useState(false)
  const [revealedLobbyQuestions, setRevealedLobbyQuestions] = useState<number[]>([])
  const lobbyQuestionTimers = useRef<Record<number, number>>({})
  const revealLobbyQuestion = (roundIndex: number) => {
    setRevealedLobbyQuestions((current) =>
      current.includes(roundIndex) ? current : [...current, roundIndex]
    )
    window.clearTimeout(lobbyQuestionTimers.current[roundIndex])
    lobbyQuestionTimers.current[roundIndex] = window.setTimeout(() => {
      setRevealedLobbyQuestions((current) => current.filter((index) => index !== roundIndex))
    }, 3000)
  }
  const [timerSeconds, setTimerSeconds] = useState(5)
  const [timerRunning, setTimerRunning] = useState(false)
  const [strikeVisible, setStrikeVisible] = useState(false)
  const [publicStrikeVisible, setPublicStrikeVisible] = useState(false)
  const [strikeOverlayCount, setStrikeOverlayCount] = useState(1)
  const [teamBackVisible, setTeamBackVisible] = useState(false)
  const [stealPromptVisible, setStealPromptVisible] = useState(false)
  const [teamBackTeam, setTeamBackTeam] = useState<"blue" | "red">("red")
  const [publicAnswerFlipIndex, setPublicAnswerFlipIndex] = useState<number | null>(null)
  useEffect(() => {
    if (roomCode || !["create", "teams", "rounds", "questions"].includes(screen)) return
    localStorage.setItem(
      createDraftKey,
      JSON.stringify({
        gameName,
        mode,
        teams,
        rounds,
        selectedCategoryIds,
        selectedQuestions,
        screen,
      })
    )
  }, [roomCode, screen, gameName, mode, teams, rounds, selectedCategoryIds, selectedQuestions])
  useEffect(() => {
    fetch(`${api}/api/categories`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: SetupCategory[]) => {
        setCategories(data)
        if (!savedCreateDraft.selectedCategoryIds) setSelectedCategoryIds([])
      })
      .catch(() => setCategories([]))
  }, [])
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
    const timeout = window.setTimeout(() => setStrikeVisible(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [strikeVisible])
  useEffect(() => {
    if (!publicStrikeVisible) return
    const timeout = window.setTimeout(() => setPublicStrikeVisible(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [publicStrikeVisible])
  useEffect(() => {
    if (!teamBackVisible) return
    const timeout = window.setTimeout(() => setTeamBackVisible(false), 5200)
    return () => window.clearTimeout(timeout)
  }, [teamBackVisible])
  useEffect(() => {
    if (!stealPromptVisible) return
    const timeout = window.setTimeout(() => setStealPromptVisible(false), 5200)
    return () => window.clearTimeout(timeout)
  }, [stealPromptVisible])
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
  const validGameSetup =
    gameName.trim().length > 0 && (categories.length === 0 || selectedCategoryIds.length > 0)
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
      (next === "create" || next === "teams" || next === "rounds" || next === "questions"
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
      activeTeam?: "blue" | "red" | null
      activePlayer?: { id: number; name: string; team: "blue" | "red" } | null
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => {
      if (payload.activeTeam !== undefined) {
        setActiveTeam(payload.activeTeam)
        if (payload.activeTeam === null) setBuzzerWinner(null)
      }
      if (payload.state)
        setState({
          ...payload.state,
          activeTeam: payload.activeTeam ?? payload.state.activeTeam,
          activePlayer: payload.activePlayer ?? payload.state.activePlayer,
        })
      if (payload.devices) {
        setDevices(payload.devices.filter((device) => device.id !== deviceToken))
      }
    }
    const presence = (payload: {
      devices?: Array<{ id?: string; role: string; name?: string; deviceType?: DeviceType }>
    }) => setDevices((payload.devices ?? []).filter((device) => device.id !== deviceToken))
    const failure = (payload: { error?: string }) => {
      setLoadingAction(null)
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
    const socketConnected = () => setSocketConnected(true)
    const socketDisconnected = () => setSocketConnected(false)
    const strike = (payload: { count?: number; team?: "blue" | "red" }) => {
      const buzzerTeam = currentDeviceRole === "red_button" ? "red" : "blue"
      const shouldShowStrike = screen !== "buzzer" || payload.team === buzzerTeam
      if (shouldShowStrike) {
        setStrikeOverlayCount(Math.max(1, payload.count ?? 1))
        setPublicStrikeVisible(true)
        setStrikeVisible(true)
      } else if (screen === "buzzer") {
        setPublicStrikeVisible(false)
        setStrikeVisible(false)
      }
      if (payload.team) {
        const strikeTeam = payload.team
        setState((current) => {
          const faceoffMode = ["faceoff", "decision", "tiebreaker"].includes(current.phase)
          const strikeKey = faceoffMode ? "faceoffStrikes" : "strikes"
          const currentStrikes = current[strikeKey] ?? { blue: 0, red: 0 }
          const nextStrikes = {
            ...currentStrikes,
            [strikeTeam]: payload.count ?? currentStrikes[strikeTeam] + 1,
          }
          const nextFaceoffStrikes = {
            ...(current.faceoffStrikes ?? { blue: 0, red: 0 }),
            [strikeTeam]: payload.count ?? current.faceoffStrikes?.[strikeTeam] ?? 1,
          }
          const nextRegularStrikes = {
            ...current.strikes,
            [strikeTeam]: payload.count ?? current.strikes[strikeTeam] + 1,
          }
          return {
            ...current,
            [strikeKey]: nextStrikes,
            faceoffStrikes: nextFaceoffStrikes,
            strikes: nextRegularStrikes,
            displayStrikes: faceoffMode ? nextStrikes : nextRegularStrikes,
          }
        })
      }
      if (payload.count === 2) {
        setTeamBackTeam(payload.team === "blue" ? "red" : "blue")
        window.setTimeout(() => setTeamBackVisible(true), 3000)
      }
      if (payload.count === 3) {
        setTeamBackTeam(payload.team === "blue" ? "red" : "blue")
        window.setTimeout(() => setStealPromptVisible(true), 3000)
      }
    }
    const answerRevealed = (payload: { index?: number }) => {
      if (!Number.isInteger(payload.index)) return
      setPublicAnswerFlipIndex(payload.index ?? null)
      window.setTimeout(() => setPublicAnswerFlipIndex(null), 700)
    }
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
    gameSocket.on("connect", socketConnected)
    gameSocket.on("disconnect", socketDisconnected)
    gameSocket.on("game:strike", strike)
    gameSocket.on("game:answer-revealed", answerRevealed)
    gameSocket.on("device:role-replaced", roleReplaced)
    gameSocket.on("buzzer:reset", () => setBuzzerWinner(null))
    return () => {
      gameSocket.off("room:snapshot", receive)
      gameSocket.off("game:state", receive)
      gameSocket.off("room:presence", presence)
      gameSocket.off("game:error", failure)
      gameSocket.off("buzzer:winner", buzzer)
      gameSocket.off("connect", socketConnected)
      gameSocket.off("disconnect", socketDisconnected)
      gameSocket.off("game:strike", strike)
      gameSocket.off("game:answer-revealed", answerRevealed)
      gameSocket.off("device:role-replaced", roleReplaced)
      gameSocket.off("buzzer:reset")
    }
  }, [roomCode, screen, hostToken, deviceToken, buttonRole, currentDeviceRole, deviceName])
  useEffect(() => {
    if (["host", "display", "buzzer", "lobby", "joinLobby"].includes(screen)) return
    gameSocket.disconnect()
  }, [screen])
  useEffect(() => {
    if (screen !== "buzzer") return
    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow
      document.body.style.overflow = previousBodyOverflow
    }
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
        setActiveTeam(data.activeTeam ?? null)
        setState((old) => ({
          ...old,
          ...data.state,
          activeTeam: data.activeTeam ?? data.state.activeTeam,
        }))
        setDevices(
          (data.devices ?? []).filter((device: { id?: string }) => device.id !== deviceToken)
        )
      })
      .catch((error: unknown) => {
        setDevices([])
        const roomUnavailable = error instanceof Error && error.message === "room_not_found"
        if (!roomUnavailable) return
        setError("La partida guardada ya no existe. Inicia una nueva partida o únete a otra sala.")
        localStorage.removeItem("people-says-room-code")
        localStorage.removeItem("people-says-host-token")
        localStorage.removeItem(createDraftKey)
        localStorage.removeItem("people-says-device-token")
        sessionStorage.removeItem("people-says-device-token")
        if (roomCode) localStorage.removeItem(deviceConfigKey(roomCode))
        setRoomCode("")
        setHostToken("")
        setCurrentDeviceRole("pending")
        if (
          [
            "lobby",
            "joinLobby",
            "host",
            "display",
            "buzzer",
            "faceoff",
            "decision",
            "steal",
            "roundResult",
          ].includes(screen)
        ) {
          navigate("/")
          setScreenState("home")
        }
      })
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
        setActiveTeam(data.activeTeam ?? null)
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
        if (data.state?.roundQuestions && data.state?.roundConfigs) {
          setSelectedQuestions(
            data.state.roundQuestions.map(
              (question: { questionId: number; prompt: string; roundIndex: number }) => {
                const round = data.state.roundConfigs[question.roundIndex]
                return {
                  id: question.questionId,
                  prompt: question.prompt,
                  answerCount: round?.answerCount ?? 4,
                  multiplier: (round?.multiplier ?? 1) as 1 | 2 | 3,
                }
              }
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
    setLoadingAction("create")
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
          categoryIds: selectedCategoryIds,
          questions: selectedQuestions.map((question, index) => ({
            id: question.id,
            answerCount: Number(rounds[index].answerCount),
          })),
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
      localStorage.removeItem(createDraftKey)
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
      setLoadingAction(null)
      await prepareQuestions()
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
      if (isEditLocation()) {
        const nextQuestions = (data.state?.roundQuestions ?? []).map(
          (question: { questionId: number; prompt: string; roundIndex: number }) => ({
            id: question.questionId,
            prompt: question.prompt,
            answerCount: Number(rounds[question.roundIndex]?.answerCount ?? 4),
            multiplier: rounds[question.roundIndex]?.multiplier ?? 1,
          })
        )
        setSelectedQuestions(nextQuestions)
        setScreen("questions")
      } else {
        setScreen("lobby")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las rondas")
    } finally {
      setLoadingAction(null)
    }
  }
  const fetchQuestion = async (answerCount: number, excludedIds: number[]) => {
    const response = await fetch(
      `${api}/api/questions/selection?categoryIds=${selectedCategoryIds.join(",")}&answerCount=${answerCount}&excludeIds=${excludedIds.join(",")}`
    )
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data as { id: number; prompt: string; answerCount: number }
  }
  const prepareQuestions = async () => {
    setError("")
    setQuestionsLoading(true)
    try {
      const used: number[] = []
      const next = []
      for (const round of rounds) {
        const question = await fetchQuestion(Number(round.answerCount), used)
        used.push(question.id)
        next.push({ ...question, multiplier: round.multiplier as 1 | 2 | 3 })
      }
      setSelectedQuestions(next)
      setScreen("questions")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron seleccionar las preguntas")
    } finally {
      setQuestionsLoading(false)
    }
  }
  const replaceQuestion = async (index: number) => {
    setQuestionLoadingRound(index)
    try {
      const excluded = selectedQuestions.map((question) => question.id)
      const question = await fetchQuestion(Number(rounds[index].answerCount), excluded)
      setSelectedQuestions((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...question, multiplier: rounds[index].multiplier } : item
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la pregunta")
    } finally {
      setQuestionLoadingRound(null)
    }
  }
  const saveEditedQuestions = async () => {
    setLoadingAction("create")
    try {
      const response = await fetch(`${api}/api/rooms/${roomCode}/questions`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-host-token": hostToken },
        body: JSON.stringify({
          questions: selectedQuestions.map((question) => ({ id: question.id })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setState((old) => ({ ...old, ...data.state }))
      setScreen("lobby")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las preguntas")
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
  const leaveDisplaySession = () => {
    gameSocket.disconnect()
    if (roomCode) localStorage.removeItem(deviceConfigKey(roomCode))
    if (localStorage.getItem("people-says-room-code") === roomCode) {
      localStorage.removeItem("people-says-room-code")
    }
    localStorage.removeItem("people-says-host-token")
    setRoomCode("")
    setJoinCode("")
    setHostToken("")
    setCurrentDeviceRole("pending")
    setDevices([])
    setShowLeaveDisplayDialog(false)
    navigate("/")
    setScreenState("home")
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
  }
  const reveal = (index: number) => {
    if (!revealed.includes(index)) emitAction({ type: "reveal_answer", index })
  }
  const teamId = state.activeTeam ?? state.control ?? "blue"
  const teamName = teamId === "blue" ? teams[0].name : teams[1].name
  const faceoffFirstTeam =
    state.phase === "steal"
      ? state.activeTeam
      : ((strikeVisible || publicStrikeVisible
          ? (state.faceoffStrikeTeam ?? state.faceoff?.activeTeam)
          : state.faceoff?.activeTeam) ??
        state.faceoff?.firstTeam ??
        state.control)
  const strikeTeam =
    state.phase === "steal" ? (state.stealTeam ?? teamId) : (faceoffFirstTeam ?? teamId)
  const faceoffMode = ["faceoff", "decision", "tiebreaker"].includes(state.phase)
  const participantStatusTitle =
    state.phase === "steal"
      ? "Robo de Puntos"
      : state.phase === "turn"
        ? "Modo Turno / Normal"
        : "Enfrentamiento"
  const blueFaceoffPlayer =
    (faceoffMode ? state.faceoff?.bluePlayer : undefined) ??
    (state.activePlayer?.team === "blue"
      ? state.activePlayer.name
      : teams[0].players[state.turnIndex.blue % Math.max(teams[0].players.length, 1)]) ??
    "—"
  const redFaceoffPlayer =
    (faceoffMode ? state.faceoff?.redPlayer : undefined) ??
    (state.activePlayer?.team === "red"
      ? state.activePlayer.name
      : teams[1].players[state.turnIndex.red % Math.max(teams[1].players.length, 1)]) ??
    "—"
  const canRegisterStrike =
    state.phase === "turn" ||
    state.phase === "steal" ||
    (["faceoff", "decision", "tiebreaker"].includes(state.phase) && Boolean(faceoffFirstTeam))
  const manualActiveTeam = state.phase === "turn" ? teamId : faceoffFirstTeam
  const connectedDeviceCount = devices.length + 1
  const principalDeviceLinked =
    Boolean(hostToken) ||
    currentDeviceRole === "host" ||
    devices.some((device) => device.role === "host")
  const roundMultiplier = state.roundConfigs[state.roundIndex]?.multiplier ?? 1
  const roundWinner = state.roundWinner
  const roundWinnerName =
    roundWinner === "blue" ? teams[0].name : roundWinner === "red" ? teams[1].name : "—"
  const roundPointsWon = state.roundPoints ?? 0
  const baseRoundPoints = revealed.reduce(
    (total, index) => total + (answers[index]?.points ?? 0),
    0
  )
  const multipliedRoundPoints = baseRoundPoints * roundMultiplier
  const stealTeamId =
    teamBackVisible || stealPromptVisible
      ? teamBackTeam
      : (state.stealTeam ?? (state.control === "blue" ? "red" : "blue"))
  const stealTeamName = stealTeamId === "blue" ? teams[0].name : teams[1].name
  const stealBanner =
    teamBackVisible || stealPromptVisible ? (
      <>
        <div className="team-back-overlay pointer-events-auto fixed inset-0 z-30 bg-black/50" />
        <div
          className={cx(
            "team-back-banner pointer-events-none fixed inset-x-0 top-1/2 z-40 -translate-y-1/2 overflow-hidden bg-gradient-to-r py-12 text-center text-white shadow-2xl",
            stealTeamId === "blue"
              ? "from-blue-950 via-blue-900 to-blue-950"
              : "from-red-950 via-red-900 to-red-950"
          )}
        >
          <div className="team-back-banner-content mx-auto w-fit px-8">
            <p className="text-xs font-black uppercase tracking-[.28em] text-amber-300">
              {stealTeamName}
            </p>
            <h2 className="mt-1 text-3xl font-black sm:text-5xl">
              {stealPromptVisible ? "¡Es hora de robar puntos!" : "¡Hagan team back!"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-emerald-100 sm:text-base">
              {stealPromptVisible
                ? "Elige una sola respuesta correcta para llevarte los puntos acumulados."
                : "Prepárense para robar los puntos."}
            </p>
          </div>
        </div>
      </>
    ) : null
  const roundResultBanner =
    state.phase === "round_result" && roundWinner ? (
      <>
        <div className="pointer-events-auto fixed inset-0 z-30 bg-black/50" />
        <div
          className={cx(
            "pointer-events-none fixed inset-x-0 top-1/2 z-40 -translate-y-1/2 bg-gradient-to-r py-12 text-center text-white shadow-2xl",
            roundWinner === "blue"
              ? "from-blue-950 via-blue-900 to-blue-950"
              : "from-red-950 via-red-900 to-red-950"
          )}
        >
          <div className="mx-auto w-fit px-8">
            <p className="text-xs font-black uppercase tracking-[.28em] text-amber-300">
              {roundWinnerName}
            </p>
            <h2 className="mt-1 text-3xl font-black sm:text-5xl">¡Ronda ganada!</h2>
            <p className="mt-1 text-sm font-semibold text-emerald-100 sm:text-base">
              +<AnimatedNumber value={roundPointsWon} padStart={2} /> puntos · marcador actualizado
            </p>
          </div>
        </div>
      </>
    ) : null
  useEffect(() => {
    if (state.phase !== "lobby") setLoadingAction(null)
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
          {error && (
            <p className="mx-auto mt-5 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </p>
          )}
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
        categories={categories}
        selectedCategoryIds={selectedCategoryIds}
        onCategoryToggle={(id) =>
          setSelectedCategoryIds((current) =>
            current.includes(id)
              ? current.filter((categoryId) => categoryId !== id)
              : [...current, id]
          )
        }
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
  if (screen === "questions")
    return (
      <QuestionsStep
        rounds={rounds}
        questions={selectedQuestions}
        initialLoading={questionsLoading}
        loadingRound={questionLoadingRound}
        creating={loadingAction === "create"}
        editing={isEditLocation()}
        onChange={replaceQuestion}
        onBack={() => setScreen("rounds")}
        onSave={() => (isEditLocation() ? saveEditedQuestions() : createRoom(true))}
      />
    )
  if (screen === "lobby")
    return (
      <Shell onBack={() => setScreen("create", `/${roomCode}/edit`)}>
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
              <div className="relative size-[194px] rounded-xl border border-stone-200 bg-white p-3">
                {!lobbyQrLoaded && (
                  <span className="absolute inset-0 grid place-items-center text-emerald-800">
                    <LoaderCircle
                      size={24}
                      className="animate-spin"
                      aria-label="Cargando código QR"
                    />
                  </span>
                )}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(shareUrl)}`}
                  alt="Código QR para unirse a la sala"
                  width="168"
                  height="168"
                  className={cx(
                    "block size-full object-contain transition-opacity",
                    !lobbyQrLoaded && "opacity-0"
                  )}
                  onLoad={() => setLobbyQrLoaded(true)}
                />
              </div>
              <p className="mt-3 text-xs text-stone-500">
                Escanea el código QR para unirte a la sala
              </p>
              <Button
                secondary
                onClick={() => {
                  setQrLoaded(false)
                  setShowQrModal(true)
                }}
                className="mt-4"
              >
                <Maximize2 size={16} aria-hidden="true" /> Ver en grande
              </Button>
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
        <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <button
            type="button"
            onClick={() => setShowLobbyQuestions((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition hover:bg-stone-50"
            aria-expanded={showLobbyQuestions}
          >
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-900">
                Preguntas de la partida
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Consulta las preguntas asignadas a cada ronda.
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-stone-400">
                <Info size={13} aria-hidden="true" />
                Por seguridad, las preguntas permanecen ocultas hasta que las selecciones.
              </p>
            </div>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={cx(
                "shrink-0 text-stone-500 transition-transform",
                showLobbyQuestions && "rotate-180"
              )}
            />
          </button>
          {showLobbyQuestions && (
            <div className="border-t border-stone-100 p-4">
              <div className="space-y-2">
                {(state.roundQuestions ?? []).map((question) => (
                  <button
                    key={`${question.roundIndex}-${question.questionId}`}
                    type="button"
                    onClick={() => revealLobbyQuestion(question.roundIndex)}
                    className="group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-left transition hover:bg-white focus-within:border-emerald-600"
                    aria-label={`Revelar pregunta de la ronda ${question.roundIndex + 1}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-bold text-stone-600">
                      {String(question.roundIndex + 1).padStart(2, "0")}
                    </span>
                    <p
                      className={cx(
                        "min-w-0 flex-1 pt-1 text-sm font-semibold text-stone-800 transition duration-200",
                        revealedLobbyQuestions.includes(question.roundIndex) ? "blur-0" : "blur-sm"
                      )}
                    >
                      {question.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button ghost onClick={() => setScreen("questions")}>
            <ArrowLeft size={16} aria-hidden="true" /> Editar
          </Button>
          <Button loading={loadingAction === "start"} onClick={start}>
            Iniciar partida <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
        {error && <p className="mt-4 text-right text-sm text-red-700">{error}</p>}
        {showQrModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Código QR ampliado"
            onClick={() => setShowQrModal(false)}
          >
            <div
              className="relative flex w-full max-w-lg flex-col items-center rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="absolute right-4 top-4 cursor-pointer rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
                aria-label="Cerrar código QR ampliado"
                onClick={() => setShowQrModal(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Código QR
              </p>
              <div className="relative mt-5 size-[min(70vw,420px)] rounded-2xl border border-stone-200 bg-white p-5">
                {!qrLoaded && (
                  <span className="absolute inset-0 grid place-items-center text-emerald-800">
                    <LoaderCircle
                      size={32}
                      className="animate-spin"
                      aria-label="Cargando código QR"
                    />
                  </span>
                )}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(shareUrl)}`}
                  alt="Código QR ampliado para unirse a la sala"
                  width="420"
                  height="420"
                  className={cx(
                    "block size-full object-contain transition-opacity",
                    !qrLoaded && "opacity-0"
                  )}
                  onLoad={() => setQrLoaded(true)}
                />
              </div>
              <p className="mt-4 text-center text-sm text-stone-500">
                Escanea el código QR para unirte a la sala
              </p>
            </div>
          </div>
        )}
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
            <div
              className={cx(
                "mx-auto grid size-16 place-items-center rounded-xl",
                principalDeviceLinked ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-700"
              )}
            >
              {principalDeviceLinked ? (
                <LoaderCircle
                  size={32}
                  strokeWidth={1.8}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Unlink size={32} strokeWidth={1.8} aria-hidden="true" />
              )}
            </div>
            <div
              className={cx(
                "mx-auto mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                principalDeviceLinked ? "bg-yellow-50 text-yellow-800" : "bg-red-50 text-red-700"
              )}
            >
              <span
                className={cx(
                  "size-2 rounded-full",
                  principalDeviceLinked ? "animate-pulse bg-yellow-500" : "bg-red-600"
                )}
                aria-hidden="true"
              />
              {principalDeviceLinked ? "En sala de espera" : "Sin vinculación"}
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">Esperando inicio...</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
              {principalDeviceLinked
                ? "Tu dispositivo ya está vinculado. La partida comenzará en breve."
                : "Tu dispositivo está conectado, pero aún no está vinculado al dispositivo principal."}
            </p>
            {!principalDeviceLinked && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-left text-sm text-red-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-bold">¿Cómo solucionar la desconexión?</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                      <li>Actualiza esta página y espera unos segundos.</li>
                      <li>Pide al dispositivo principal que también actualice su página.</li>
                      <li>Verifica que ambos dispositivos estén usando el mismo código de sala.</li>
                      <li>Si el problema continúa, vuelve a configurar este dispositivo.</li>
                    </ul>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        secondary
                        className="border-red-200 bg-white text-red-800 hover:bg-red-100"
                        onClick={() => window.location.reload()}
                      >
                        Actualizar página
                      </Button>
                      <Button
                        ghost
                        className="text-red-700 hover:bg-red-100 hover:text-red-800"
                        onClick={changeDeviceConfiguration}
                      >
                        Reconfigurar dispositivo
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-7 rounded-xl border border-stone-200 bg-stone-50 p-4 text-left">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <span className="text-stone-500">Partida</span>
                <span className="text-right font-semibold text-stone-900">{gameName}</span>
                <span className="text-stone-500">Código de partida</span>
                <span className="text-right font-mono font-bold tracking-wider text-stone-900">
                  {roomCode}
                </span>
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
                <span
                  className={cx(
                    "inline-flex items-center justify-end gap-1.5 font-semibold",
                    principalDeviceLinked ? "text-emerald-700" : "text-red-700"
                  )}
                >
                  <span
                    className={cx(
                      "size-2 rounded-full",
                      principalDeviceLinked ? "bg-emerald-600" : "bg-red-600"
                    )}
                    aria-hidden="true"
                  />
                  {principalDeviceLinked ? "Vinculado" : "No vinculado"}
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
              onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "blue" })}
            >
              {teams[0].name}
            </Button>
            <Button
              secondary
              className={buzzerWinner === "blue" ? "opacity-50" : ""}
              onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "red" })}
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
        {stealBanner}
        {strikeVisible && (
          <div className="public-strike-overlay pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/50">
            <div
              className="public-strike-animation flex items-center justify-center gap-3 text-red-600 drop-shadow-2xl"
              aria-label="Strike registrado"
            >
              {Array.from({ length: strikeOverlayCount }, (_, index) => (
                <SquareX key={index} size={140} strokeWidth={1.5} />
              ))}
            </div>
          </div>
        )}
        <Heading
          k="Panel del presentador"
          aside={
            <div className="hidden flex min-w-56 items-stretch text-left">
              <div className="rounded-l-2xl rounded-r-none border border-r-0 border-stone-200 bg-white p-4">
                <div className="grid grid-cols-[auto_auto_auto] items-stretch justify-center gap-4 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-xs font-black uppercase text-emerald-900">
                        RONDA {String(state.roundIndex + 1).padStart(2, "0")}
                      </p>
                      {roundMultiplier > 1 && (
                        <>
                          <span className="text-sm font-bold text-stone-300" aria-hidden="true">
                            ·
                          </span>
                          <p className="text-xs font-semibold text-stone-400">x{roundMultiplier}</p>
                        </>
                      )}
                    </div>
                    <span className="mt-1 inline-flex rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                      {["faceoff", "tiebreaker", "decision"].includes(state.phase)
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
                      <AnimatedNumber value={multipliedRoundPoints} padStart={2} />
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
                      <AnimatedNumber value={blue} padStart={2} />
                    </strong>
                  </div>
                </div>
                <div className="flex flex-1 items-stretch bg-gradient-to-r from-red-100 to-white text-left text-red-950 last:rounded-br-2xl">
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate pl-3 text-xs font-bold">
                      {teams[1].name}
                    </p>
                    <strong className="flex self-stretch items-center bg-red-600 px-3 py-0 text-lg font-black tabular-nums text-white">
                      <AnimatedNumber value={red} padStart={2} />
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
            <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-emerald-800">
              Panel del presentador
            </p>
            <section className="rounded-2xl bg-gradient-to-r from-blue-100/80 via-slate-50 to-red-100/80 p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                {state.phase === "round_result" ? "Equipo ganador" : participantStatusTitle}
              </h2>
              {state.phase === "round_result" ? (
                <div className="flex min-h-16 items-center justify-center gap-3 rounded-lg bg-white/85 px-4 py-3 text-center shadow-sm">
                  <strong
                    className={cx(
                      "text-lg font-black",
                      roundWinner === "blue" ? "text-blue-900" : "text-red-900"
                    )}
                  >
                    {roundWinnerName}
                  </strong>
                  <span className="text-sm font-bold text-stone-400">·</span>
                  <span className="text-sm font-semibold text-stone-600">
                    +<AnimatedNumber value={roundPointsWon} padStart={2} /> puntos
                  </span>
                </div>
              ) : (
                <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-1">
                  <div
                    className={cx(
                      "min-w-0 rounded-lg bg-white/85 px-2 py-2 text-center shadow-sm transition duration-300",
                      faceoffFirstTeam === "blue"
                        ? "z-10 scale-150 translate-x-1/2 bg-gradient-to-br from-blue-700 to-blue-500 text-white"
                        : faceoffFirstTeam === "red"
                          ? "scale-75 opacity-0"
                          : ""
                    )}
                  >
                    <p
                      className={cx(
                        "truncate text-[10px] font-bold",
                        faceoffFirstTeam === "blue" ? "text-white/70" : "text-blue-700"
                      )}
                    >
                      {teams[0].name}
                    </p>
                    <p
                      className={cx(
                        "truncate text-sm font-black",
                        faceoffFirstTeam === "blue" ? "text-white" : "text-blue-950"
                      )}
                    >
                      {blueFaceoffPlayer}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "text-xs font-black text-stone-400 transition duration-300",
                      faceoffFirstTeam && "opacity-0"
                    )}
                  >
                    VS
                  </span>
                  <div
                    className={cx(
                      "min-w-0 rounded-lg bg-white/85 px-2 py-2 text-center shadow-sm transition duration-300",
                      faceoffFirstTeam === "red"
                        ? "z-10 scale-150 -translate-x-1/2 bg-gradient-to-bl from-red-700 to-red-500 text-white"
                        : faceoffFirstTeam === "blue"
                          ? "scale-75 opacity-0"
                          : ""
                    )}
                  >
                    <p
                      className={cx(
                        "truncate text-[10px] font-bold",
                        faceoffFirstTeam === "red" ? "text-white/70" : "text-red-700"
                      )}
                    >
                      {teams[1].name}
                    </p>
                    <p
                      className={cx(
                        "truncate text-sm font-black",
                        faceoffFirstTeam === "red" ? "text-white" : "text-red-950"
                      )}
                    >
                      {redFaceoffPlayer}
                    </p>
                  </div>
                </div>
              )}
            </section>
            <div className="rounded-xl bg-emerald-950 px-4 py-4 text-white">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                Pregunta
              </p>
              <h2 className="text-lg font-bold leading-snug sm:text-xl">{state.questionPrompt}</h2>
            </div>
            <section className="relative rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Respuestas
              </h2>
              <div>
                <div className="grid gap-1 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
                  {answers.map((answer, index) => {
                    const visible = revealed.includes(index)
                    return (
                      <button
                        key={`${answer.text}-${index}`}
                        disabled={
                          state.phase !== "turn" &&
                          state.phase !== "steal" &&
                          !(
                            ["faceoff", "decision", "tiebreaker"].includes(state.phase) &&
                            Boolean(faceoffFirstTeam)
                          )
                        }
                        onClick={() => reveal(index)}
                        className={cx(
                          "relative flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                          visible
                            ? "border-emerald-800 bg-emerald-50"
                            : "border-stone-200 bg-white hover:border-emerald-500"
                        )}
                      >
                        <span
                          className={cx(
                            "grid size-8 shrink-0 place-items-center rounded-lg border text-sm",
                            visible
                              ? "border-emerald-800 bg-emerald-800 text-white"
                              : "border-stone-100 bg-stone-100 text-stone-600"
                          )}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 text-sm font-semibold">{answer.text}</span>
                        <span
                          className={cx(
                            "-my-3 -mr-4 grid w-16 shrink-0 self-stretch place-items-center rounded-r-xl border-l px-3 font-bold tabular-nums",
                            visible
                              ? "border-emerald-800 bg-emerald-800 text-white"
                              : "border-stone-200 bg-stone-100 text-stone-700"
                          )}
                        >
                          {visible ? <AnimatedNumber value={answer.points} padStart={2} /> : "-"}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div
                  className={cx(
                    "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/65 px-6 text-center text-white backdrop-blur-[1px] transition duration-300",
                    ["faceoff", "tiebreaker"].includes(state.phase) && !faceoffFirstTeam
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-75 opacity-0"
                  )}
                >
                  <Pointer
                    size={88}
                    strokeWidth={1.8}
                    className="faceoff-lock-pointer absolute right-8 top-[40%] text-amber-300"
                    aria-hidden="true"
                  />
                  <Lock size={48} strokeWidth={1.7} aria-hidden="true" />
                  <strong className="text-sm font-black">Respuestas bloqueadas</strong>
                  <span className="max-w-sm text-xs font-bold">
                    Selecciona primero al equipo participante de forma manual o mediante los
                    pulsadores.
                  </span>
                </div>
              </div>
            </section>
          </div>
          <aside className="space-y-3">
            <section className="mt-7 flex items-stretch overflow-hidden rounded-2xl border border-stone-200 bg-white text-left">
              <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black uppercase text-emerald-900">
                    RONDA {String(state.roundIndex + 1).padStart(2, "0")}
                  </p>
                  {roundMultiplier > 1 && (
                    <>
                      <span className="text-sm font-bold text-stone-300" aria-hidden="true">
                        ·
                      </span>
                      <p className="text-xs font-semibold text-stone-400">x{roundMultiplier}</p>
                    </>
                  )}
                </div>
                <span className="rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                  {["faceoff", "tiebreaker", "decision"].includes(state.phase)
                    ? "Enfrentamiento"
                    : "Normal"}
                </span>
              </div>
              <div className="w-px bg-stone-200" aria-hidden="true" />
              <div className="flex shrink-0 flex-col items-center justify-center p-4 text-center">
                <strong className="text-3xl font-black tabular-nums text-emerald-900">
                  <AnimatedNumber value={multipliedRoundPoints} padStart={2} />
                </strong>
                <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                  puntos
                </span>
              </div>
              <div className="flex w-fit shrink-0 flex-col overflow-hidden rounded-r-2xl">
                <div className="flex flex-1 items-center gap-2 whitespace-nowrap bg-gradient-to-r from-blue-100 to-white px-3">
                  <span className="text-xs font-bold text-blue-950">{teams[0].name}</span>
                  <strong className="text-lg font-black tabular-nums text-blue-900">
                    <AnimatedNumber value={blue} padStart={2} />
                  </strong>
                </div>
                <div className="flex flex-1 items-center gap-2 whitespace-nowrap bg-gradient-to-r from-red-100 to-white px-3">
                  <span className="text-xs font-bold text-red-950">{teams[1].name}</span>
                  <strong className="text-lg font-black tabular-nums text-red-900">
                    <AnimatedNumber value={red} padStart={2} />
                  </strong>
                </div>
              </div>
            </section>
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
                  setTimerSeconds(5)
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
                  <p className="truncate text-sm font-black text-blue-950">{blueFaceoffPlayer}</p>
                </div>
                <span className="text-xs font-black text-stone-400">VS</span>
                <div className="min-w-0 rounded-lg bg-red-50 px-2 py-2 text-center">
                  <p className="truncate text-[10px] font-bold text-red-700">Rojo</p>
                  <p className="truncate text-sm font-black text-red-950">{redFaceoffPlayer}</p>
                </div>
              </div>
              <div className="hidden">
                <button
                  type="button"
                  className="min-h-10 cursor-pointer rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !["faceoff", "tiebreaker"].includes(state.phase) || Boolean(faceoffFirstTeam)
                  }
                  onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "blue" })}
                >
                  Pulsador azul
                </button>
                <button
                  type="button"
                  className="min-h-10 cursor-pointer rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !["faceoff", "tiebreaker"].includes(state.phase) || Boolean(faceoffFirstTeam)
                  }
                  onClick={() => gameSocket.emit("buzzer:press", { code: roomCode, team: "red" })}
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
                  {Array.from({ length: state.strikeLimit ?? 3 }, (_, index) => index).map(
                    (index) => {
                      const active =
                        index < (state.displayStrikes?.[strikeTeam] ?? state.strikes[strikeTeam])
                      return (
                        <span key={index} className="relative block size-9" aria-hidden="true">
                          {active ? (
                            <SquareX size={36} strokeWidth={1.8} className="text-red-600" />
                          ) : (
                            <>
                              <SquareDashed
                                size={36}
                                strokeWidth={1.8}
                                className="text-stone-300"
                              />
                              <X
                                className="absolute inset-0 m-auto text-stone-300"
                                size={15}
                                strokeWidth={2}
                              />
                            </>
                          )}
                        </span>
                      )
                    }
                  )}
                </div>
                <Button
                  disabled={!canRegisterStrike}
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setStrikeVisible(true)
                    emitAction({ type: "strike", team: strikeTeam, source: "manual" })
                  }}
                >
                  <SquareX size={16} aria-hidden="true" /> Error
                </Button>
              </div>
            </section>
            {state.phase === "round_result" && (
              <Button
                className="w-full"
                onClick={() => {
                  emitAction({ type: "next_round" })
                }}
              >
                Siguiente ronda <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Pulsadores manuales
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={cx(
                    "flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-b-8 border-blue-800 bg-blue-600 px-5 py-4 text-left text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    !manualActiveTeam &&
                      "shadow-lg hover:-translate-y-1 hover:scale-[1.02] hover:brightness-105 hover:shadow-xl active:translate-y-1 active:scale-[0.98] active:border-b-0 active:shadow-md",
                    manualActiveTeam === "blue" &&
                      "translate-y-1 scale-[0.98] border-b-0 shadow-[0_0_30px_rgba(37,99,235,0.75)] disabled:opacity-100"
                  )}
                  disabled={
                    !["faceoff", "tiebreaker", "decision", "steal"].includes(state.phase) ||
                    faceoffFirstTeam === "red"
                  }
                  onClick={() => {
                    if (!faceoffFirstTeam)
                      gameSocket.emit("buzzer:press", { code: roomCode, team: "blue" })
                  }}
                >
                  <Hand size={32} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    <span className="block text-xl font-black">{state.teams[0].name}</span>
                    <span className="mt-1 block text-xs font-semibold text-blue-100">
                      {teams[0].name}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={cx(
                    "flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-b-8 border-red-800 bg-red-600 px-5 py-4 text-left text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    !manualActiveTeam &&
                      "shadow-lg hover:-translate-y-1 hover:scale-[1.02] hover:brightness-105 hover:shadow-xl active:translate-y-1 active:scale-[0.98] active:border-b-0 active:shadow-md",
                    manualActiveTeam === "red" &&
                      "translate-y-1 scale-[0.98] border-b-0 shadow-[0_0_30px_rgba(220,38,38,0.75)] disabled:opacity-100"
                  )}
                  disabled={
                    !["faceoff", "tiebreaker", "decision"].includes(state.phase) ||
                    faceoffFirstTeam === "blue"
                  }
                  onClick={() => {
                    if (!faceoffFirstTeam)
                      gameSocket.emit("buzzer:press", { code: roomCode, team: "red" })
                  }}
                >
                  <Hand size={32} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    <span className="block text-xl font-black">{state.teams[1].name}</span>
                    <span className="mt-1 block text-xs font-semibold text-red-100">
                      {teams[1].name}
                    </span>
                  </span>
                </button>
              </div>
              {faceoffFirstTeam && ["faceoff", "tiebreaker", "decision"].includes(state.phase) && (
                <Button
                  secondary
                  className="mt-3 w-full"
                  onClick={() => emitAction({ type: "cancel_faceoff" })}
                >
                  Soltar selección
                </Button>
              )}
            </section>
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-900">
                Errores
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {Array.from({ length: state.strikeLimit ?? 3 }, (_, index) => index).map(
                    (index) => {
                      const active =
                        index < (state.displayStrikes?.[strikeTeam] ?? state.strikes[strikeTeam])
                      return (
                        <span key={index} className="relative block size-10" aria-hidden="true">
                          {active ? (
                            <SquareX size={40} strokeWidth={1.8} className="text-red-600" />
                          ) : (
                            <>
                              <SquareDashed
                                size={40}
                                strokeWidth={1.8}
                                className="text-stone-300"
                              />
                              <X
                                className="absolute inset-0 m-auto text-stone-300"
                                size={17}
                                strokeWidth={2}
                              />
                            </>
                          )}
                        </span>
                      )
                    }
                  )}
                </div>
                <Button
                  disabled={!canRegisterStrike}
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setStrikeVisible(true)
                    emitAction({ type: "strike", team: strikeTeam, source: "manual" })
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
      <div className="public-display relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-5 py-10 text-white">
        {stealBanner}
        {roundResultBanner}
        <Button
          ghost
          ariaLabel="Salir de la partida"
          className="fixed right-3 top-3 z-20 p-2 text-white/40 hover:bg-white/10 hover:text-white"
          onClick={() => setShowLeaveDisplayDialog(true)}
        >
          <LogOut size={16} aria-hidden="true" />
        </Button>
        {publicStrikeVisible && (
          <div className="public-strike-overlay pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/50">
            <div
              className="public-strike-animation flex items-center justify-center gap-3 text-red-600"
              aria-label="Strike registrado"
            >
              {Array.from({ length: strikeOverlayCount }, (_, index) => (
                <SquareX key={index} size={140} strokeWidth={1.5} />
              ))}
            </div>
          </div>
        )}
        <div className="display-floating-accent display-floating-accent-right pointer-events-none absolute -right-40 -top-48 size-[480px] rounded-full border-[65px] border-white/5" />
        <div className="display-floating-accent display-floating-accent-left pointer-events-none absolute -bottom-36 -left-28 size-[360px] rounded-full border-[50px] border-white/5" />
        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <div className="flex justify-end">{pauseControl}</div>
          {false ? (
            <section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/20 bg-black/20 px-6 py-8 text-center shadow-lg">
              <p className="text-xs font-black uppercase tracking-[.24em] text-amber-100/80">
                Ronda {String(state.roundIndex + 1).padStart(2, "0")}
              </p>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-white/60">
                Equipo ganador
              </p>
              <h1
                className={cx(
                  "mt-2 text-4xl font-black sm:text-6xl",
                  roundWinner === "blue" ? "text-blue-200" : "text-red-200"
                )}
              >
                {roundWinnerName}
              </h1>
              <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-white/60">
                Puntos ganados
              </p>
              <strong className="mt-1 block font-mono text-6xl font-black tabular-nums text-amber-300 sm:text-8xl">
                +<AnimatedNumber value={roundPointsWon} padStart={2} />
              </strong>
              <div className="mt-8 grid grid-cols-2 gap-3 text-left">
                <div className="rounded-xl bg-blue-900/60 p-4">
                  <p className="text-xs font-bold text-blue-100">{teams[0].name}</p>
                  <strong className="mt-1 block font-mono text-3xl font-black tabular-nums text-white">
                    <AnimatedNumber value={blue} padStart={2} />
                  </strong>
                </div>
                <div className="rounded-xl bg-red-900/60 p-4">
                  <p className="text-xs font-bold text-red-100">{teams[1].name}</p>
                  <strong className="mt-1 block font-mono text-3xl font-black tabular-nums text-white">
                    <AnimatedNumber value={red} padStart={2} />
                  </strong>
                </div>
              </div>
            </section>
          ) : null}
          <div className="grid w-full items-center gap-4 lg:grid-cols-[1fr_5fr_1fr]">
            <div
              className={cx(
                "mb-4 rounded-2xl bg-gradient-to-br from-blue-900/60 via-blue-700/40 to-blue-400/20 px-4 py-4 text-center shadow-[0_10px_34px_rgba(0,0,0,0.38)] backdrop-blur-sm transition duration-300",
                faceoffFirstTeam === "blue"
                  ? "z-10 scale-[1.2] -translate-x-4 bg-blue-600 shadow-[0_0_42px_rgba(37,99,235,0.75)]"
                  : faceoffFirstTeam === "red"
                    ? "scale-90 translate-x-2 opacity-30"
                    : ""
              )}
            >
              <p className="text-sm font-black uppercase tracking-wide text-blue-100">
                {teams[0].name}
              </p>
              <strong className="block font-mono text-3xl font-black leading-none tabular-nums text-white sm:text-5xl lg:text-6xl">
                <AnimatedNumber value={blue} padStart={2} />
              </strong>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                Puntos
              </p>
            </div>
            <div>
              <div className="mb-4 flex justify-center">
                <div className="w-fit rounded-2xl border border-white/20 bg-black/20 px-4 py-4 text-center shadow-lg">
                  <strong className="block font-mono text-6xl font-black leading-none tabular-nums tracking-tight text-amber-300 sm:text-7xl lg:text-8xl">
                    <AnimatedNumber value={multipliedRoundPoints} padStart={2} />
                  </strong>
                  <p className="text-[10px] font-black uppercase tracking-[.24em] text-amber-100/80 sm:text-xs">
                    Ronda {String(state.roundIndex + 1).padStart(2, "0")}
                    {roundMultiplier > 1 && ` · x${roundMultiplier}`}
                  </p>
                </div>
              </div>
              <div className="mb-4 rounded-2xl border border-amber-300/60 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 px-4 py-4 text-center shadow-xl shadow-black/25 ring-1 ring-amber-200/20">
                <p className="text-xl font-black text-white sm:text-2xl">{state.questionPrompt}</p>
              </div>
              <div className="mb-4 rounded-2xl border border-white/20 bg-black/20 px-4 py-4 text-center shadow-lg">
                <div className="grid gap-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-5">
                  {answers.length === 0 &&
                    [0, 1, 2, 3, 4].map((index) => (
                      <Skeleton key={`answer-skeleton-${index}`} className="h-16 bg-white/10" />
                    ))}
                  {answers.map((answer, index) => {
                    const visible = revealed.includes(index)
                    return (
                      <div
                        key={`${answer.text}-${index}`}
                        className="min-h-[60px] [perspective:900px] sm:min-h-[72px]"
                      >
                        <div
                          className={cx(
                            "relative size-full min-h-[60px] [transform-style:preserve-3d] sm:min-h-[72px]",
                            visible && "[transform:rotateX(180deg)]",
                            publicAnswerFlipIndex === index && "public-answer-flip"
                          )}
                        >
                          <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-xl border border-white/20 bg-black/20 shadow-md [backface-visibility:hidden]">
                            <div className="grid w-full place-items-center font-mono text-sm font-black tabular-nums text-amber-200 sm:text-4xl">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                          </div>
                          <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-xl border border-amber-200/60 bg-white/20 shadow-md [backface-visibility:hidden] [transform:rotateX(180deg)]">
                            <div className="grid w-11 shrink-0 place-items-center border-r border-white/15 bg-black/20 font-mono text-base font-black tabular-nums text-amber-200 sm:w-14 sm:text-xl">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <div className="flex min-w-0 flex-1 items-center px-3 sm:px-5">
                              <span className="truncate text-base font-black text-white sm:text-xl">
                                {answer.text}
                              </span>
                            </div>
                            <div className="grid w-14 shrink-0 place-items-center border-l border-white/15 bg-amber-300 font-mono text-lg font-black tabular-nums text-emerald-950 sm:w-20 sm:text-2xl">
                              <AnimatedNumber value={answer.points} padStart={2} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[auto_auto] items-center justify-center gap-3">
                <div
                  className={cx(
                    "w-fit rounded-2xl border border-white/20 bg-black/20 px-3 py-3 text-center shadow-lg transition duration-300",
                    ""
                  )}
                >
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[.24em] text-amber-100/80">
                    {participantStatusTitle}
                  </p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div
                      className={cx(
                        "rounded-lg bg-white/85 px-2 py-1.5 text-center shadow-sm transition duration-300",
                        faceoffFirstTeam === "blue"
                          ? "z-10 scale-110 translate-x-[66.666%] bg-gradient-to-br from-blue-700 to-blue-500 text-white"
                          : faceoffFirstTeam === "red"
                            ? "scale-75 opacity-0"
                            : ""
                      )}
                    >
                      <p
                        className={cx(
                          "text-[9px] font-bold uppercase leading-none tracking-wider",
                          faceoffFirstTeam === "blue" ? "text-white/70" : "text-blue-700"
                        )}
                      >
                        {teams[0].name}
                      </p>
                      <p
                        className={cx(
                          "truncate text-sm font-black leading-none",
                          faceoffFirstTeam === "blue" ? "text-white" : "text-blue-950"
                        )}
                      >
                        {blueFaceoffPlayer}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "text-xs font-black text-amber-200 transition duration-300",
                        faceoffFirstTeam && "opacity-0"
                      )}
                    >
                      VS
                    </span>
                    <div
                      className={cx(
                        "rounded-lg bg-white/85 px-2 py-1.5 text-center shadow-sm transition duration-300",
                        faceoffFirstTeam === "red"
                          ? "z-10 scale-110 -translate-x-[66.666%] bg-gradient-to-bl from-red-700 to-red-500 text-white"
                          : faceoffFirstTeam === "blue"
                            ? "scale-75 opacity-0"
                            : ""
                      )}
                    >
                      <p
                        className={cx(
                          "text-[9px] font-bold uppercase leading-none tracking-wider",
                          faceoffFirstTeam === "red" ? "text-white/70" : "text-red-700"
                        )}
                      >
                        {teams[1].name}
                      </p>
                      <p
                        className={cx(
                          "truncate text-sm font-black leading-none",
                          faceoffFirstTeam === "red" ? "text-white" : "text-red-950"
                        )}
                      >
                        {redFaceoffPlayer}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex w-fit justify-center gap-3" aria-label="Errores de la ronda">
                  {Array.from({ length: state.strikeLimit ?? 3 }, (_, index) => index).map(
                    (index) => {
                      const active =
                        index <
                        (state.displayStrikes?.[faceoffFirstTeam ?? teamId] ??
                          state.strikes[faceoffFirstTeam ?? teamId])
                      return active ? (
                        <SquareX key={index} size={64} strokeWidth={1.8} className="text-red-600" />
                      ) : (
                        <span key={index} className="relative block size-16 text-white/25">
                          <SquareDashed size={64} strokeWidth={1.8} />
                          <X className="absolute inset-0 m-auto" size={28} strokeWidth={2} />
                        </span>
                      )
                    }
                  )}
                </div>
              </div>
            </div>
            <div
              className={cx(
                "mb-4 rounded-2xl bg-gradient-to-bl from-red-900/60 via-red-700/40 to-red-400/20 px-4 py-4 text-center shadow-[0_10px_34px_rgba(0,0,0,0.38)] backdrop-blur-sm transition duration-300",
                faceoffFirstTeam === "red"
                  ? "z-10 scale-115 translate-x-4 bg-red-600 shadow-[0_0_42px_rgba(220,38,38,0.75)]"
                  : faceoffFirstTeam === "blue"
                    ? "scale-90 -translate-x-2 opacity-30"
                    : ""
              )}
            >
              <p className="text-sm font-black uppercase tracking-wide text-red-100">
                {teams[1].name}
              </p>
              <strong className="block font-mono text-3xl font-black leading-none tabular-nums text-white sm:text-5xl lg:text-6xl">
                <AnimatedNumber value={red} padStart={2} />
              </strong>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                Puntos
              </p>
            </div>
          </div>
        </div>
        {showLeaveDisplayDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-5">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-display-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 text-left text-stone-900 shadow-xl"
            >
              <h2 id="leave-display-title" className="text-xl font-semibold">
                ¿Salir de esta partida?
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Se desconectará esta pantalla y se borrará la configuración guardada de esta sala.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button ghost onClick={() => setShowLeaveDisplayDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  secondary
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={leaveDisplaySession}
                >
                  Salir y borrar configuración
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  if (screen === "buzzer")
    return (() => {
      const buzzerTeam = buttonRole === "blue_button" ? "blue" : "red"
      const buzzerTeamIndex = buzzerTeam === "blue" ? 0 : 1
      const buzzerTeamName =
        state.teams?.[buzzerTeamIndex]?.name ?? (buzzerTeam === "blue" ? "Azul" : "Rojo")
      const buzzerTeamScore = state.scores?.[buzzerTeam] ?? 0
      const buzzerPlayer =
        state.activePlayer?.team === buzzerTeam
          ? state.activePlayer.name
          : (state.faceoff?.[buzzerTeam === "blue" ? "bluePlayer" : "redPlayer"] ??
            state.teams?.[buzzerTeamIndex]?.players?.[
              (state.turnIndex?.[buzzerTeam] ?? 0) %
                Math.max(state.teams?.[buzzerTeamIndex]?.players?.length ?? 1, 1)
            ] ??
            "Participante en turno")
      const faceoffActive = state.phase === "faceoff"
      const buzzerSelected = faceoffActive && activeTeam === buzzerTeam
      const buzzerHighlighted =
        ["faceoff", "turn"].includes(state.phase) && activeTeam === buzzerTeam
      const buzzerBlocked = faceoffActive && Boolean(activeTeam) && activeTeam !== buzzerTeam
      const buttonClasses = buzzerSelected
        ? "border-emerald-950 bg-emerald-700 shadow-[0_18px_0_#064e3b,0_25px_40px_rgba(0,0,0,.45)]"
        : buzzerBlocked
          ? "border-stone-700 bg-stone-600 shadow-[0_18px_0_#292524,0_25px_40px_rgba(0,0,0,.35)]"
          : buzzerTeam === "blue"
            ? "border-blue-950 bg-blue-800 shadow-[0_18px_0_#172554,0_25px_40px_rgba(0,0,0,.45)]"
            : "border-red-950 bg-red-800 shadow-[0_18px_0_#450a0a,0_25px_40px_rgba(0,0,0,.45)]"
      const screenClasses =
        buzzerTeam === "blue"
          ? "bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950"
          : "bg-gradient-to-b from-red-950 via-red-900 to-slate-950"

      return (
        <main
          className={cx(
            "buzzer-screen fixed inset-0 overflow-y-auto px-5 py-6 text-white sm:px-8",
            screenClasses,
            faceoffActive && socketConnected && !buzzerWinner && !buzzerBlocked && "cursor-pointer"
          )}
          onClick={(event) => {
            if (!faceoffActive || !socketConnected || buzzerWinner || buzzerBlocked) return
            if ((event.target as HTMLElement).closest(".pointer-events-auto")) return
            gameSocket.emit("buzzer:press", { code: roomCode, team: buzzerTeam })
          }}
        >
          {(currentDeviceRole !== "blue_button" && currentDeviceRole !== "red_button") ||
          teamBackTeam === (currentDeviceRole === "blue_button" ? "blue" : "red")
            ? stealBanner
            : null}
          {roundResultBanner}
          {strikeVisible && (
            <div className="public-strike-overlay pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/60">
              <div
                className="public-strike-animation flex items-center justify-center gap-3 text-red-500 drop-shadow-2xl"
                aria-label="Strike registrado"
              >
                {Array.from({ length: strikeOverlayCount }, (_, index) => (
                  <SquareX key={index} size={140} strokeWidth={1.5} />
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col justify-center gap-6">
            <section
              className={cx(
                "text-center transition-all duration-300",
                buzzerHighlighted && "translate-y-3 scale-[1.5]"
              )}
            >
              <p className="text-xs font-bold uppercase tracking-[.22em] text-white/65">
                {buzzerTeamName}
              </p>
              <h1
                className={cx(
                  "mt-1 text-5xl font-black tracking-tight drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)] transition-colors duration-300 sm:text-6xl",
                  "text-white"
                )}
              >
                {buzzerPlayer}
              </h1>
            </section>
            <p
              className={cx(
                "-mt-5 text-center text-sm text-white/70 transition-opacity duration-300",
                buzzerHighlighted ? "opacity-0" : "opacity-100"
              )}
            >
              ¡Pulsa antes que el equipo contrario!
            </p>

            <div className="relative mx-auto w-full">
              {!faceoffActive && (
                <div className="buzzer-turn-card-enter pointer-events-auto absolute inset-0 z-20 m-auto h-fit w-[calc(100%-2rem)] rounded-3xl border border-white/20 bg-black/15 p-8 text-center shadow-sm backdrop-blur-md transition-all duration-300">
                  {state.phase === "turn" && activeTeam === buzzerTeam ? (
                    <Hand className="mx-auto mb-3 size-12 text-emerald-300" strokeWidth={2.5} />
                  ) : (
                    <Clock3 className="mx-auto mb-3 size-12 text-white/60" strokeWidth={2.5} />
                  )}
                  <p className="text-4xl font-black tracking-tight text-white drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)] sm:text-5xl">
                    {state.phase === "turn"
                      ? activeTeam === buzzerTeam
                        ? "Es tu turno"
                        : "No es tu turno"
                      : "El pulsador no está disponible"}
                  </p>
                  <p className="mt-1 text-sm text-white/65">
                    {state.phase === "turn"
                      ? activeTeam === buzzerTeam
                        ? "Tu equipo está jugando ahora."
                        : "El otro equipo está jugando. Espera tu turno."
                      : "Tu equipo podrá volver a usarlo cuando comience un nuevo enfrentamiento."}
                  </p>
                </div>
              )}
              <button
                type="button"
                disabled={!faceoffActive || Boolean(buzzerWinner) || buzzerBlocked}
                aria-label={`Pulsador del equipo ${buzzerTeamName}`}
                className={cx(
                  "group relative mx-auto flex aspect-square w-[min(76vw,340px)] max-w-full flex-col items-center justify-center rounded-full border-[12px] px-6 text-center text-white transition-transform before:pointer-events-none before:absolute before:inset-3 before:rounded-full before:border before:border-white/25 before:bg-gradient-to-br before:from-white/35 before:via-white/5 before:to-black/25 before:content-[''] disabled:cursor-not-allowed disabled:opacity-55 sm:w-[min(56vw,360px)]",
                  buttonClasses,
                  faceoffActive
                    ? "hover:-translate-y-1 active:translate-y-3 active:shadow-none"
                    : "hover:translate-y-0 active:translate-y-0",
                  buzzerSelected &&
                    "translate-y-3 shadow-none hover:translate-y-3 disabled:opacity-100"
                )}
              >
                {buzzerBlocked ? (
                  <Lock className="mb-5 size-20 drop-shadow-lg sm:size-24" strokeWidth={2.5} />
                ) : buzzerSelected ? (
                  <Check className="mb-5 size-20 drop-shadow-lg sm:size-24" strokeWidth={3} />
                ) : (
                  <Hand
                    className={cx(
                      "mb-5 size-20 drop-shadow-lg sm:size-24",
                      faceoffActive && "transition-transform group-active:scale-90"
                    )}
                  />
                )}
                <span className="text-3xl font-black uppercase tracking-wide drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)] sm:text-5xl">
                  {buzzerBlocked ? "¡Oops!" : buzzerSelected ? "Pulsado" : "Pulsar"}
                </span>
                <span className="mt-2 text-sm font-bold text-white/75">{buzzerTeamName}</span>
              </button>
            </div>
            <div className="mt-6 text-center">
              <p
                className={cx(
                  "text-xs font-black uppercase tracking-[.18em]",
                  socketConnected ? "text-emerald-300" : "text-white/50"
                )}
              >
                {socketConnected ? "● Pulsador activo" : "● Pulsador desconectado"}
              </p>
              {!socketConnected && (
                <p className="mt-2 text-sm text-white/70">Reconectando con la sala…</p>
              )}
            </div>
            <div className="-mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/20 bg-black/15 text-center">
              <div className="p-4">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/60">
                  Ronda
                </p>
                <p className="mt-1 font-mono text-2xl font-black tabular-nums text-white">
                  <AnimatedNumber value={state.pot ?? 0} padStart={2} />
                </p>
                <span className="block text-xs font-normal leading-none text-white/50">puntos</span>
              </div>
              <div
                className={cx(
                  "border-l border-white/20 bg-gradient-to-b p-4",
                  buzzerTeam === "blue"
                    ? "from-blue-900/45 to-blue-500/10"
                    : "from-red-900/45 to-red-500/10"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/60">
                  {buzzerTeamName}
                </p>
                <p className="mt-1 font-mono text-2xl font-black tabular-nums text-white">
                  <AnimatedNumber value={buzzerTeamScore} padStart={2} />
                </p>
                <span className="block text-xs font-normal leading-none text-white/50">puntos</span>
              </div>
            </div>
            <div
              className="-mt-4 flex w-fit justify-center gap-3 self-center"
              aria-label="Errores del equipo"
            >
              {Array.from({ length: faceoffActive ? 5 : 3 }, (_, index) => {
                const active =
                  index <
                  (faceoffActive
                    ? (state.faceoffStrikes?.[buzzerTeam] ?? 0)
                    : (state.strikes?.[buzzerTeam] ?? 0))
                return active ? (
                  <SquareX key={index} size={64} strokeWidth={1.8} className="text-red-600" />
                ) : (
                  <span key={index} className="relative block size-16 text-white/25">
                    <SquareDashed size={64} strokeWidth={1.8} />
                    <X className="absolute inset-0 m-auto" size={28} strokeWidth={2} />
                  </span>
                )
              })}
            </div>
          </div>
        </main>
      )
    })()
  return (
    <Shell>
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        {error || "Conectando con la partida…"}
      </div>
    </Shell>
  )
}
