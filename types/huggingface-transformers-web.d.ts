declare module '@huggingface/transformers/dist/transformers.web.js' {
  export const env: {
    allowLocalModels: boolean
  }

  export function pipeline(task: string, model: string): Promise<
    (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>
  >
}
