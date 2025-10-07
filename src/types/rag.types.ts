export interface Document {
    id: string
    content: string
    metadata: {
      source: string
      filename: string
      page?: number
      uploadedAt: string
    }
  }
  
  export interface SearchResult {
    content: string
    metadata: Document['metadata']
    score: number
  }
  
  export interface RAGResponse {
    answer: string
    sources: SearchResult[]
    tokensUsed: {
      input: number
      output: number
    }
  }