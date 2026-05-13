import React, { createContext, useContext, useState, ReactNode } from 'react';

export type AIProviderType = 'gemini' | 'ollama';

interface SettingsContextType {
  provider: AIProviderType;
  setProvider: (provider: AIProviderType) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<AIProviderType>('gemini');
  const [ollamaModel, setOllamaModel] = useState<string>('llama3');

  return (
    <SettingsContext.Provider value={{ provider, setProvider, ollamaModel, setOllamaModel }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
