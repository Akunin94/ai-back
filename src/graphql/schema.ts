import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList
} from 'graphql'
import { VectorStoreService } from '../services/vectorStore.service'

// === Health ===

const HealthType = new GraphQLObjectType({
  name: 'Health',
  fields: {
    status: { type: new GraphQLNonNull(GraphQLString) }
  }
})

// === Documents ===

const UploadedFileType = new GraphQLObjectType({
  name: 'UploadedFile',
  fields: {
    filename: { type: new GraphQLNonNull(GraphQLString) },
    chunks: { type: new GraphQLNonNull(GraphQLInt) },
    uploadedAt: { type: GraphQLString }
  }
})

const DocumentsResponseType = new GraphQLObjectType({
  name: 'DocumentsResponse',
  fields: {
    files: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UploadedFileType))) },
    totalChunks: { type: new GraphQLNonNull(GraphQLInt) }
  }
})

const ClearResponseType = new GraphQLObjectType({
  name: 'ClearResponse',
  fields: {
    success: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

// === Project Search ===

const SearchMetadataType = new GraphQLObjectType({
  name: 'SearchMetadata',
  fields: {
    source: { type: new GraphQLNonNull(GraphQLString) },
    filename: { type: new GraphQLNonNull(GraphQLString) },
    page: { type: GraphQLInt },
    uploadedAt: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const SearchResultType = new GraphQLObjectType({
  name: 'SearchResult',
  fields: {
    content: { type: new GraphQLNonNull(GraphQLString) },
    metadata: { type: new GraphQLNonNull(SearchMetadataType) },
    score: { type: new GraphQLNonNull(GraphQLFloat) }
  }
})

export function createSchema(
  vectorStore: VectorStoreService,
  getProjectVectorStore: () => VectorStoreService
) {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        health: {
          type: new GraphQLNonNull(HealthType),
          resolve() {
            return { status: 'ok' }
          }
        },

        documents: {
          type: new GraphQLNonNull(DocumentsResponseType),
          resolve() {
            const documents = vectorStore.getDocuments()

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

            return { files, totalChunks: documents.length }
          }
        },

        projectSearch: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SearchResultType))),
          args: {
            query: { type: new GraphQLNonNull(GraphQLString) },
            limit: { type: GraphQLInt }
          },
          async resolve(_: unknown, args: { query: string; limit?: number }) {
            const store = getProjectVectorStore()
            return store.search(args.query, args.limit ?? 10)
          }
        }
      }
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        clearDocuments: {
          type: new GraphQLNonNull(ClearResponseType),
          async resolve() {
            await vectorStore.clearVectorStore()
            return { success: true }
          }
        }
      }
    })
  })
}
