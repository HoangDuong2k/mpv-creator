import type { PvmApi } from '../shared/api'

declare global {
  interface Window {
    api: PvmApi
  }
}

export {}
