import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Document } from '../types/rag.types'

export class DocumentLoaderService {
  private textSplitter: RecursiveCharacterTextSplitter

  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    })
  }

  async loadPDF(filepath: string, filename: string): Promise<Document[]> {
    // Временно отключено
    throw new Error('PDF support temporarily disabled. Use TXT, MD or DOCX files.')
  }

  async loadDOCX(filepath: string, filename: string): Promise<Document[]> {
    try {
      const result = await mammoth.extractRawText({ path: filepath })
      const text = result.value
      
      const chunks = await this.textSplitter.splitText(text)
      
      return chunks.map((chunk, index) => ({
        id: `${filename}-chunk-${index}`,
        content: chunk,
        metadata: {
          source: 'docx',
          filename,
          uploadedAt: new Date().toISOString()
        }
      }))
    } catch (error) {
      console.error('Error loading DOCX:', error)
      throw new Error(`Failed to load DOCX: ${filename}`)
    }
  }

  async loadTXT(filepath: string, filename: string): Promise<Document[]> {
    try {
      const text = await fs.readFile(filepath, 'utf-8')
      const chunks = await this.textSplitter.splitText(text)
      
      return chunks.map((chunk, index) => ({
        id: `${filename}-chunk-${index}`,
        content: chunk,
        metadata: {
          source: 'txt',
          filename,
          uploadedAt: new Date().toISOString()
        }
      }))
    } catch (error) {
      console.error('Error loading TXT:', error)
      throw new Error(`Failed to load TXT: ${filename}`)
    }
  }

  async loadMarkdown(filepath: string, filename: string): Promise<Document[]> {
    try {
      const text = await fs.readFile(filepath, 'utf-8')
      
      // Для Markdown используем специальные сепараторы
      const mdSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ['\n## ', '\n### ', '\n\n', '\n', '. ', ' ', '']
      })
      
      const chunks = await mdSplitter.splitText(text)
      
      return chunks.map((chunk, index) => ({
        id: `${filename}-chunk-${index}`,
        content: chunk,
        metadata: {
          source: 'markdown',
          filename,
          uploadedAt: new Date().toISOString()
        }
      }))
    } catch (error) {
      console.error('Error loading Markdown:', error)
      throw new Error(`Failed to load Markdown: ${filename}`)
    }
  }

  async loadDocument(filepath: string, filename: string): Promise<Document[]> {
    const ext = path.extname(filename).toLowerCase()
    
    switch (ext) {
      case '.pdf':
        return this.loadPDF(filepath, filename)
      case '.docx':
        return this.loadDOCX(filepath, filename)
      case '.txt':
        return this.loadTXT(filepath, filename)
      case '.md':
        return this.loadMarkdown(filepath, filename)
      default:
        throw new Error(`Unsupported file type: ${ext}`)
    }
  }
}