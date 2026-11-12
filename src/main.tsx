import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/create" element={<App />} />
        <Route path="/teams" element={<App />} />
        <Route path="/rounds" element={<App />} />
        <Route path="/questions" element={<App />} />
        <Route path="/edit" element={<App />} />
        <Route path="/edit/teams" element={<App />} />
        <Route path="/edit/rounds" element={<App />} />
        <Route path="/edit/questions" element={<App />} />
        <Route path="/lobby" element={<App />} />
        <Route path="/join" element={<App />} />
        <Route path="/join/device" element={<App />} />
        <Route path="/join/role" element={<App />} />
        <Route path="/join/lobby" element={<App />} />
        <Route path="/:code/join" element={<App />} />
        <Route path="/rules" element={<App />} />
        <Route path="/host" element={<App />} />
        <Route path="/display" element={<App />} />
        <Route path="/buzzer" element={<App />} />
        <Route path="/faceoff" element={<App />} />
        <Route path="/decision" element={<App />} />
        <Route path="/steal" element={<App />} />
        <Route path="/roundResult" element={<App />} />
        <Route path="/final" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
