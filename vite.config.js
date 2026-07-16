import { defineConfig } from 'vite'

export default defineConfig({
    root: 'web',
    clearScreen: false,
    server: {
        strictPort: true,
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        target: 'es2022',
    },
})

