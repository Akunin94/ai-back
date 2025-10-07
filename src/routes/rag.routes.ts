import { Router, Request, Response } from 'express'
import formidable from 'formidable'
import path from 'path'
import fs from 'fs/promises'
import { DocumentLoaderService } from '../services/documentLoader.service'
import { VectorStoreService } from '../services/vectorStore.service'
import { RAGService } from '../services/rag.service'

const router = Router()

// Инициализация сервисов
const vectorStore = new VectorStoreService()
const documentLoader = new DocumentLoaderService()

// Инициализируем vector store при старте
let ragService: RAGService

// Асинхронная инициализация
const initializeServices = async () => {
  try {
    await vectorStore.initialize()
    ragService = new RAGService(vectorStore)
    console.log('RAG services initialized')
  } catch (error) {
    console.error('Failed to initialize RAG services:', error)
  }
}

initializeServices()

// Загрузка файлов
router.post('/upload', async (req: Request, res: Response) => {
    try {
      const uploadDir = path.join(__dirname, '../../uploads')
      await fs.mkdir(uploadDir, { recursive: true })
  
      const form = formidable({
        uploadDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        // Убираем filter - проверим расширение файла вручную
        filter: ({ name, originalFilename, mimetype }) => {
          // Разрешаем по MIME type
          const allowedMimeTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown',
            'text/x-markdown',
            'application/octet-stream' // Markdown часто приходит как octet-stream
          ]
          
          if (allowedMimeTypes.includes(mimetype || '')) {
            return true
          }
          
          // Проверяем по расширению файла как fallback
          const ext = originalFilename?.toLowerCase().match(/\.(pdf|docx|txt|md)$/)?.[1]
          return !!ext
        }
      })
  
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('Form parse error:', err)
          return res.status(400).json({ error: 'Failed to parse upload' })
        }
  
        const file = Array.isArray(files.file) ? files.file[0] : files.file
        if (!file) {
          return res.status(400).json({ error: 'No file uploaded' })
        }
  
        // Дополнительная проверка расширения
        const ext = file.originalFilename?.toLowerCase().match(/\.(pdf|docx|txt|md)$/)?.[1]
        if (!ext) {
          return res.status(400).json({ 
            error: 'Unsupported file type. Use PDF, DOCX, TXT, or MD files.' 
          })
        }
  
        try {
          console.log('Processing file:', file.originalFilename, 'MIME:', file.mimetype)
          
          // Загружаем и обрабатываем документ
          const documents = await documentLoader.loadDocument(
            file.filepath,
            file.originalFilename || 'unknown'
          )
  
          // Добавляем в vector store
          await vectorStore.addDocuments(documents)
  
          // Удаляем временный файл
          await fs.unlink(file.filepath)
  
          res.json({
            success: true,
            filename: file.originalFilename,
            chunks: documents.length,
            totalDocuments: vectorStore.getDocumentCount()
          })
        } catch (error) {
          console.error('Document processing error:', error)
          
          // Пытаемся удалить файл при ошибке
          try {
            await fs.unlink(file.filepath)
          } catch (unlinkError) {
            console.error('Failed to delete file:', unlinkError)
          }
          
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to process document'
          })
        }
      })
    } catch (error) {
      console.error('Upload error:', error)
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Upload failed'
      })
    }
  })

// Запрос к RAG
router.post('/query', async (req: Request, res: Response) => {
  try {
    if (!ragService) {
      return res.status(503).json({ error: 'RAG service not initialized' })
    }

    const { question } = req.body

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' })
    }

    const response = await ragService.query(question)
    res.json(response)
  } catch (error) {
    console.error('Query error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Query failed'
    })
  }
})

// Streaming запрос к RAG
router.post('/query/stream', async (req: Request, res: Response) => {
  try {
    if (!ragService) {
      return res.status(503).json({ error: 'RAG service not initialized' })
    }

    const { question } = req.body

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = ragService.streamQuery(question)

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    res.end()
  } catch (error) {
    console.error('Stream query error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Stream query failed'
      })
    }
  }
})

// Получить список документов
router.get('/documents', (req: Request, res: Response) => {
  try {
    const documents = vectorStore.getDocuments()
    
    // Группируем по файлам
    const fileMap = new Map<string, number>()
    documents.forEach(doc => {
      const count = fileMap.get(doc.metadata.filename) || 0
      fileMap.set(doc.metadata.filename, count + 1)
    })

    const files = Array.from(fileMap.entries()).map(([filename, chunks]) => ({
      filename,
      chunks,
      uploadedAt: documents.find(d => d.metadata.filename === filename)?.metadata.uploadedAt
    }))

    res.json({
      files,
      totalChunks: documents.length
    })
  } catch (error) {
    console.error('Get documents error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get documents'
    })
  }
})

// Очистить все документы
router.delete('/documents', async (req: Request, res: Response) => {
  try {
    await vectorStore.clearVectorStore()
    res.json({ success: true })
  } catch (error) {
    console.error('Clear documents error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to clear documents'
    })
  }
})

export default router