import { io } from 'socket.io-client';

export const gameSocket = io(import.meta.env.VITE_API_URL ?? '/', { autoConnect: false, transports: ['websocket'] });
