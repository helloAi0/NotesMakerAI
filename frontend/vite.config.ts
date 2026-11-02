import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mountTranscriptApi } from './server/ytTranscript.ts'

// Serves GET /api/yt-transcript?v=<id> (YouTube captions) while running `npm run dev` or `vite preview`.
const ytTranscript = () => ({ name: 'nm-yt-transcript', configureServer(s: { middlewares: Parameters<typeof mountTranscriptApi>[0] }) { mountTranscriptApi(s.middlewares) }, configurePreviewServer(s: { middlewares: Parameters<typeof mountTranscriptApi>[0] }) { mountTranscriptApi(s.middlewares) } })

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ytTranscript()],
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
