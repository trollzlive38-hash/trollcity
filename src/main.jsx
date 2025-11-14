import React from 'react'
import './index.css'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import Pages from './pages/index.jsx'

// Create a single query client instance for react-query
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Pages />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)

// Optional: register service worker if present
// Only register a service worker when explicitly enabled via env and in production
if (
  import.meta.env.PROD &&
  import.meta.env.VITE_ENABLE_SW === 'true' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((err) => console.error('Service worker registration failed:', err))
  })
}
