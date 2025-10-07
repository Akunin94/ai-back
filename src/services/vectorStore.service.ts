import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { OpenAIEmbeddings } from '@langchain/openai'
import { Document as LangchainDocument } from '@langchain/core/documents'
import path from 'path'
import fs from 'fs/promises'
import type { Document, SearchResult } from '../types/rag.types'

export class VectorStoreService {
  private embeddings: OpenAIEmbeddings
  private vectorStore: HNSWLib | null = null
  private storePath: string
  private documents: Document[] = []

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    })
    this.storePath = path.join(__dirname, '../../data/vectorstore')
  }

  async initialize() {
    try {
      await this.loadVectorStore()
      console.log('Vector store loaded from disk')
    } catch (error) {
      console.log('Creating new vector store')
      this.vectorStore = await HNSWLib.fromDocuments(
        [new LangchainDocument({ pageContent: 'init', metadata: {} })],
        this.embeddings
      )
    }
  }

  async addDocuments(docs: Document[]): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized')
    }

    const langchainDocs = docs.map(doc => 
      new LangchainDocument({
        pageContent: doc.content,
        metadata: {
          id: doc.id,
          ...doc.metadata
        }
      })
    )

    await this.vectorStore.addDocuments(langchainDocs)
    this.documents.push(...docs)
    await this.saveVectorStore()
    
    console.log(`Added ${docs.length} documents to vector store`)
  }

  async search(query: string, k: number = 4): Promise<SearchResult[]> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized')
    }

    const results = await this.vectorStore.similaritySearchWithScore(query, k)
    
    return results.map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata as Document['metadata'],
      score: score
    }))
  }

  async saveVectorStore(): Promise<void> {
    if (!this.vectorStore) return

    try {
      await fs.mkdir(this.storePath, { recursive: true })
      await this.vectorStore.save(this.storePath)
      
      await fs.writeFile(
        path.join(this.storePath, 'documents.json'),
        JSON.stringify(this.documents, null, 2)
      )
      
      console.log('Vector store saved to disk')
    } catch (error) {
      console.error('Error saving vector store:', error)
      throw error
    }
  }

  async loadVectorStore(): Promise<void> {
    try {
      this.vectorStore = await HNSWLib.load(this.storePath, this.embeddings)
      
      const docsData = await fs.readFile(
        path.join(this.storePath, 'documents.json'),
        'utf-8'
      )
      this.documents = JSON.parse(docsData)
      
      console.log(`Loaded ${this.documents.length} documents from disk`)
    } catch (error) {
      throw new Error('Vector store not found')
    }
  }

  async clearVectorStore(): Promise<void> {
    try {
      await fs.rm(this.storePath, { recursive: true, force: true })
      
      this.vectorStore = await HNSWLib.fromDocuments(
        [new LangchainDocument({ pageContent: 'init', metadata: {} })],
        this.embeddings
      )
      
      this.documents = []
      
      console.log('Vector store cleared')
    } catch (error) {
      console.error('Error clearing vector store:', error)
      throw error
    }
  }

  getDocuments(): Document[] {
    return this.documents
  }

  getDocumentCount(): number {
    return this.documents.length
  }
}