import { io } from "socket.io-client"

export const gameSocket = io(import.meta.env.VITE_API_URL ?? "/", {
  autoConnect: false,
  path: "/api/socket-io/socket.io",
  transports: ["websocket"],
})
