import { ChatAnthropic } from '@langchain/anthropic'
import type { SearchResult, RAGResponse } from '../types/rag.types'
import { VectorStoreService } from './vectorStore.service'

export class RAGService {
  private vectorStore: VectorStoreService
  private llm: ChatAnthropic

  constructor(vectorStore: VectorStoreService) {
    this.vectorStore = vectorStore
    this.llm = new ChatAnthropic({
      modelName: 'claude-sonnet-4-20250514',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.3,
      maxTokens: 4096
    })
  }

  async query(question: string): Promise<RAGResponse> {
    // 1. Поиск релевантных документов
    const searchResults = await this.vectorStore.search(question, 4)
    
    if (searchResults.length === 0) {
      throw new Error('No relevant documents found')
    }

    // 2. Формируем контекст
    const context = searchResults
      .map((result, index) => {
        return `<document index="${index}">
<source>${result.metadata.filename}</source>
<content>
${result.content}
</content>
</document>`
      })
      .join('\n\n')

    // 3. Создаем промпт
    const prompt = `На основе следующих документов ответь на вопрос пользователя.

ВАЖНЫЕ ПРАВИЛА:
1. Используй ТОЛЬКО информацию из предоставленных документов
2. Если ответа нет в документах - честно скажи об этом
3. ОБЯЗАТЕЛЬНО указывай источники: упоминай filename и index документа
4. Цитируй конкретные части текста когда это уместно
5. Если информация противоречива в разных документах - укажи на это

Документы:
${context}

Вопрос: ${question}

Формат ответа:
<answer>
Твой детальный ответ с упоминанием источников
</answer>

<sources>
<source index="0">Краткая цитата или резюме что взято из этого документа</source>
<source index="1">...</source>
</sources>`

    // 4. Запрос к Claude
    const response = await this.llm.invoke([
      {
        role: 'user',
        content: prompt
      }
    ])

    const responseText = response.content as string

    // 5. Парсим ответ
    const answerMatch = responseText.match(/<answer>([\s\S]*?)<\/answer>/)
    const answer = answerMatch ? answerMatch[1].trim() : responseText

    return {
      answer,
      sources: searchResults,
      tokensUsed: {
        input: response.response_metadata?.usage?.input_tokens || 0,
        output: response.response_metadata?.usage?.output_tokens || 0
      }
    }
  }

  async *streamQuery(question: string): AsyncGenerator<{
    type: 'answer' | 'sources' | 'done'
    data: string | SearchResult[]
  }> {
    // 1. Поиск релевантных документов
    const searchResults = await this.vectorStore.search(question, 4)
    
    if (searchResults.length === 0) {
      throw new Error('No relevant documents found')
    }

    // Сразу отправляем источники
    yield {
      type: 'sources',
      data: searchResults
    }

    // 2. Формируем контекст (как выше)
    const context = searchResults
      .map((result, index) => {
        return `<document index="${index}">
<source>${result.metadata.filename}</source>
<content>
${result.content}
</content>
</document>`
      })
      .join('\n\n')

    // 3. Промпт
    const prompt = `На основе следующих документов ответь на вопрос пользователя.

ВАЖНЫЕ ПРАВИЛА:
1. Используй ТОЛЬКО информацию из предоставленных документов
2. Если ответа нет в документах - честно скажи об этом
3. Упоминай источники (filename и index)
4. Будь конкретным и точным

Документы:
${context}

Вопрос: ${question}

Дай детальный ответ, упоминая откуда взята каждая часть информации.`

    // 4. Streaming ответ
    const stream = await this.llm.stream([
      {
        role: 'user',
        content: prompt
      }
    ])

    for await (const chunk of stream) {
      const content = chunk.content as string
      if (content) {
        yield {
          type: 'answer',
          data: content
        }
      }
    }

    yield {
      type: 'done',
      data: ''
    }
  }
}