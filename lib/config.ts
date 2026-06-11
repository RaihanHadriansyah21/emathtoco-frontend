export const API_URL = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? "http://localhost:8000"
    : (process.env.NEXT_PUBLIC_API_URL || "https://strife-trapper-dad.ngrok-free.dev");
