import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList
} from 'graphql'
import { VectorStoreService } from '../services/vectorStore.service'

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

export function createSchema(vectorStore: VectorStoreService) {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
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
