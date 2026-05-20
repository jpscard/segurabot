import React, { createContext, useContext, useState, ReactNode } from 'react';

export type AIProviderType = 'gemini' | 'ollama';

interface SettingsContextType {
  provider: AIProviderType;
  setProvider: (provider: AIProviderType) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [provider, setProviderState] = useState<AIProviderType>(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('ai_provider') as AIProviderType) || 'gemini' : 'gemini';
  });
  const [ollamaModel, setOllamaModelState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('ollama_model') || 'llama3' : 'llama3';
  });
  const [geminiApiKey, setGeminiApiKeyState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') || '' : '';
  });

  const setProvider = (p: AIProviderType) => {
    setProviderState(p);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_provider', p);
    }
  };

  const setOllamaModel = (model: string) => {
    setOllamaModelState(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ollama_model', model);
    }
  };

  const setGeminiApiKey = (key: string) => {
    setGeminiApiKeyState(key);
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('gemini_api_key', key);
      } else {
        localStorage.removeItem('gemini_api_key');
      }
    }
  };

  return (
    <SettingsContext.Provider value={{ provider, setProvider, ollamaModel, setOllamaModel, geminiApiKey, setGeminiApiKey }}>
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
