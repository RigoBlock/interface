declare global {
  namespace NodeJS {
    // All process.env values used by this package should be listed here
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test'
      BUILD_ENV?: string
      CI?: string
      VERSION?: string
      WDYR?: string
    }
  }
}

export {}
