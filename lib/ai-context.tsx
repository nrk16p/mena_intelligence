"use client"

import { createContext, useCallback, useContext, useState } from "react"

interface AiContextValue {
  pageContext: string
  pageLabel: string
  setAiContext: (context: string, label?: string) => void
  clearAiContext: () => void
  triggerQuestion: string
  fireTriggerQuestion: (q: string) => void
  clearTriggerQuestion: () => void
}

const AiContext = createContext<AiContextValue>({
  pageContext: "",
  pageLabel: "",
  setAiContext: () => {},
  clearAiContext: () => {},
  triggerQuestion: "",
  fireTriggerQuestion: () => {},
  clearTriggerQuestion: () => {},
})

export function AiContextProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContext]       = useState("")
  const [pageLabel, setPageLabel]           = useState("")
  const [triggerQuestion, setTriggerQuestion] = useState("")

  const setAiContext = useCallback((context: string, label = "") => {
    setPageContext(context)
    setPageLabel(label)
  }, [])

  const clearAiContext = useCallback(() => {
    setPageContext("")
    setPageLabel("")
  }, [])

  const fireTriggerQuestion = useCallback((q: string) => {
    setTriggerQuestion(q)
  }, [])

  const clearTriggerQuestion = useCallback(() => {
    setTriggerQuestion("")
  }, [])

  return (
    <AiContext.Provider value={{
      pageContext, pageLabel, setAiContext, clearAiContext,
      triggerQuestion, fireTriggerQuestion, clearTriggerQuestion,
    }}>
      {children}
    </AiContext.Provider>
  )
}

export function useAiContext() {
  return useContext(AiContext)
}

export function useSetAiContext() {
  const { setAiContext } = useContext(AiContext)
  return setAiContext
}
