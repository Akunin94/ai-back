import dotenv from 'dotenv'
import projectRoutes from './routes/project.routes'

dotenv.config({ path: '.env.local' })
dotenv.config()

import express, { Request, Response } from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import ragRoutes from './routes/rag.routes'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}))
app.use(express.json({ limit: '50mb' }))

// Инициализация Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Типы
interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: Message[]
  system?: string
  temperature?: number
  max_tokens?: number
}

// ====== ВАЖНО: ЭТИ ДВА РОУТА ДОЛЖНЫ БЫТЬ! ======

// Обычный запрос
app.post('/api/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const {
      messages,
      system,
      temperature = 0.7,
      max_tokens = 4096
    } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens,
      temperature,
      system,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    })

    res.json({
      id: response.id,
      content: response.content,
      role: response.role,
      model: response.model,
      usage: response.usage
    })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
})

// Streaming запрос
app.post('/api/chat/stream', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const {
      messages,
      system,
      temperature = 0.7,
      max_tokens = 4096
    } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens,
      temperature,
      system,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    })

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
    })

    stream.on('message', (message) => {
      res.write(`data: ${JSON.stringify({ type: 'message', message })}\n\n`)
    })

    stream.on('error', (error) => {
      console.error('Stream error:', error)
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
      res.end()
    })

    stream.on('end', () => {
      res.write('data: [DONE]\n\n')
      res.end()
    })

    req.on('close', () => {
      stream.abort()
    })

  } catch (error) {
    console.error('Stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error'
      })
    }
  }
})

// RAG routes
app.use('/api/rag', ragRoutes)

app.use('/api/project', projectRoutes)

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})