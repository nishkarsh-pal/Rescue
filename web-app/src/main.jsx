import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import RescueDashboard from './RescueDashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RescueDashboard />
  </StrictMode>,
)
