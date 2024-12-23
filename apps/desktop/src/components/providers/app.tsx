import { STORE_NAME } from '@/lib/constants'
import { downloadManager } from '@/lib/download/manager'
import { usePersistedStore } from '@/lib/store'
import { invoke } from '@tauri-apps/api/core'
import { load, Store } from '@tauri-apps/plugin-store'
import { createContext, useContext, useEffect, useState } from 'react'

type AppProviderProps = {
  children: React.ReactNode
}

type AppProviderState = {
  store: Store | null
}

const initialState: AppProviderState = {
  store: null
}

const AppProviderContext = createContext<AppProviderState>(initialState)

export const AppProvider = ({ children, ...props }: AppProviderProps) => {
  const [store, setStore] = useState<Store | null>(null)
  const [queueInterval, setQueueInterval] = useState<Timer | null>(null)
  const { gamePath, setGamePath } = usePersistedStore()

  useEffect(() => {
    if (!store) {
      load(STORE_NAME, { autoSave: false }).then((store) => setStore(store))
    }
    return () => {
      if (store) store.close()
    }
  }, [store])

  useEffect(() => {
    if (!queueInterval) {
      downloadManager.init().then(() => setQueueInterval(setInterval(() => downloadManager.process(), 100)))
    }
    return () => {
      if (queueInterval) clearInterval(queueInterval)
    }
  }, [queueInterval])

  useEffect(() => {
    if (!gamePath) {
      invoke('find_game_path').then((path) => setGamePath(path as string))
    }
  }, [gamePath, setGamePath])

  return (
    <AppProviderContext.Provider
      {...props}
      value={{
        store
      }}
    >
      {children}
    </AppProviderContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppProviderContext)
  if (context === undefined) throw new Error('useApp must be used within a AppProvider')
  return context
}
