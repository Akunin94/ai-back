import { Router } from 'express'
import type { Request, Response } from 'express'
import { VectorStoreService } from '../services/vectorStore.service'

const router = Router()
let vectorStore: VectorStoreService | null = null

// Ленивая инициализация - создаём только когда нужно (экспортируем для GraphQL)
export const getVectorStore = () => {
  if (!vectorStore) {
    vectorStore = new VectorStoreService()
  }
  return vectorStore
}

// Создать embeddings для файлов проекта
router.post('/embed', async (req: Request, res: Response) => {
  try {
    const { files } = req.body // Array<{path: string, content: string}>

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Files array required' })
    }

    // Преобразуем файлы в Document формат
    const documents = files.map(file => ({
      id: crypto.randomUUID(),
      content: file.content,
      metadata: {
        source: 'project',
        filename: file.path,
        uploadedAt: new Date().toISOString()
      }
    }))

    // Добавляем в vector store
    const store = getVectorStore() // ← Используем ленивую инициализацию
    await store.addDocuments(documents)

    res.json({
      success: true,
      documentsAdded: documents.length
    })
  } catch (error) {
    console.error('Error creating embeddings:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create embeddings'
    })
  }
})

// Поиск по проекту
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body

    if (!query) {
      return res.status(400).json({ error: 'Query required' })
    }

    const store = getVectorStore() // ← Используем ленивую инициализацию
    const results = await store.search(query, limit)

    res.json({ results })
  } catch (error) {
    console.error('Error searching project:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Search failed'
    })
  }
})

export default router