import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mountTranscriptApi } from './server/ytTranscript.ts'

// Serves GET /api/yt-transcript?v=<id> (YouTube captions) while running `npm run dev` or `vite preview`.
const ytTranscript = () => ({ name: 'nm-yt-transcript', configureServer(s: { middlewares: Parameters<typeof mountTranscriptApi>[0] }) { mountTranscriptApi(s.middlewares) }, configurePreviewServer(s: { middlewares: Parameters<typeof mountTranscriptApi>[0] }) { mountTranscriptApi(s.middlewares) } })

// Security headers for production (also written to render.yaml). connect-src stays open because users bring their own AI/Ollama endpoints.
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src *; frame-src https://www.youtube-nocookie.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=()',
};
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ytTranscript()],
  preview: { headers: SECURITY_HEADERS, allowedHosts: true },
  build: {
    rolldownOptions: {
      output: {
        // Heavy libraries get their own cacheable chunks so the first screen stays small.
        codeSplitting: {
          groups: [
            { name: 'katex', test: /node_modules[\\/](katex|rehype-katex|remark-math)/ },
            { name: 'markdown', test: /node_modules[\\/](react-markdown|remark|rehype|unified|micromark|mdast|hast|unist|vfile)/ },
            { name: 'pdf', test: /node_modules[\\/](pdfjs-dist|jspdf|html2canvas)/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
