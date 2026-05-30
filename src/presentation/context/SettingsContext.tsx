import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { db } from '../../infrastructure/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export type AIProviderType = 'gemini' | 'ollama';
export type TTSProviderType = 'native' | 'elevenlabs';

interface SettingsContextType {
  provider: AIProviderType;
  setProvider: (provider: AIProviderType) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  geminiModel: string;
  setGeminiModel: (model: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  
  // TTS Settings
  ttsProvider: TTSProviderType;
  setTtsProvider: (provider: TTSProviderType) => void;
  elevenLabsApiKey: string;
  setElevenLabsApiKey: (key: string) => void;
  elevenLabsVoiceId: string;
  setElevenLabsVoiceId: (id: string) => void;
  ttsVoiceKeyword: string;
  setTtsVoiceKeyword: (keyword: string) => void;
  ttsRate: number;
  setTtsRate: (rate: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [provider, setProviderState] = useState<AIProviderType>(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('ai_provider') as AIProviderType) || 'gemini' : 'gemini';
  });
  const [ollamaModel, setOllamaModelState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('ollama_model') || 'llama3' : 'llama3';
  });
  const [ollamaBaseUrl, setOllamaBaseUrlState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('ollama_base_url') || 'http://localhost:11434' : 'http://localhost:11434';
  });
  const [geminiModel, setGeminiModelState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('gemini_model') || 'gemini-2.5-flash' : 'gemini-2.5-flash';
  });
  const [geminiApiKey, setGeminiApiKeyState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') || '' : '';
  });

  // TTS states
  const [ttsProvider, setTtsProviderState] = useState<TTSProviderType>(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('tts_provider') as TTSProviderType) || 'native' : 'native';
  });
  const [elevenLabsApiKey, setElevenLabsApiKeyState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_api_key') || import.meta.env.VITE_ELEVENLABS_API_KEY || '' : '';
  });
  const [elevenLabsVoiceId, setElevenLabsVoiceIdState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_voice_id') || import.meta.env.VITE_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' : '21m00Tcm4TlvDq8ikWAM';
  });
  const [ttsVoiceKeyword, setTtsVoiceKeywordState] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('tts_voice_keyword') || 'google' : 'google';
  });
  const [ttsRate, setTtsRateState] = useState<number>(() => {
    return typeof window !== 'undefined' ? parseFloat(localStorage.getItem('tts_rate') || '1.05') : 1.05;
  });

  // Escuta as configurações de IA no Firestore em tempo real
  useEffect(() => {
    const configRef = doc(db, 'settings', 'ia_config');
    const unsubscribe = onSnapshot(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.provider) setProviderState(data.provider as AIProviderType);
        if (data.ollamaModel) setOllamaModelState(data.ollamaModel);
        if (data.ollamaBaseUrl) setOllamaBaseUrlState(data.ollamaBaseUrl);
        if (data.geminiModel) setGeminiModelState(data.geminiModel);
        if (data.geminiApiKey !== undefined) setGeminiApiKeyState(data.geminiApiKey || '');

        // TTS settings
        if (data.ttsProvider) setTtsProviderState(data.ttsProvider as TTSProviderType);
        if (data.elevenLabsApiKey !== undefined) setElevenLabsApiKeyState(data.elevenLabsApiKey || '');
        if (data.elevenLabsVoiceId) setElevenLabsVoiceIdState(data.elevenLabsVoiceId);
        if (data.ttsVoiceKeyword) setTtsVoiceKeywordState(data.ttsVoiceKeyword);
        if (data.ttsRate !== undefined) setTtsRateState(typeof data.ttsRate === 'number' ? data.ttsRate : parseFloat(data.ttsRate || '1.05'));

        // Atualizar localStorage local como cache de redundância
        if (typeof window !== 'undefined') {
          if (data.provider) localStorage.setItem('ai_provider', data.provider);
          if (data.ollamaModel) localStorage.setItem('ollama_model', data.ollamaModel);
          if (data.ollamaBaseUrl) localStorage.setItem('ollama_base_url', data.ollamaBaseUrl);
          if (data.geminiModel) localStorage.setItem('gemini_model', data.geminiModel);
          if (data.geminiApiKey) {
            localStorage.setItem('gemini_api_key', data.geminiApiKey);
          } else {
            localStorage.removeItem('gemini_api_key');
          }

          if (data.ttsProvider) localStorage.setItem('tts_provider', data.ttsProvider);
          if (data.elevenLabsApiKey) {
            localStorage.setItem('elevenlabs_api_key', data.elevenLabsApiKey);
          } else {
            localStorage.removeItem('elevenlabs_api_key');
          }
          if (data.elevenLabsVoiceId) localStorage.setItem('elevenlabs_voice_id', data.elevenLabsVoiceId);
          if (data.ttsVoiceKeyword) localStorage.setItem('tts_voice_keyword', data.ttsVoiceKeyword);
          if (data.ttsRate !== undefined) localStorage.setItem('tts_rate', String(data.ttsRate));
        }
      }
    }, (error) => {
      console.warn("Firestore onSnapshot ia_config error (esperado se não inicializado):", error);
    });

    return () => unsubscribe();
  }, []);

  // Helper assíncrono para atualizar o Firestore
  const syncToFirestore = async (updates: Partial<{
    provider: AIProviderType;
    ollamaModel: string;
    ollamaBaseUrl: string;
    geminiModel: string;
    geminiApiKey: string;
    
    // TTS Updates
    ttsProvider: TTSProviderType;
    elevenLabsApiKey: string;
    elevenLabsVoiceId: string;
    ttsVoiceKeyword: string;
    ttsRate: number;
  }>) => {
    try {
      const configRef = doc(db, 'settings', 'ia_config');
      await setDoc(configRef, updates, { merge: true });
    } catch (error) {
      console.error("Erro ao sincronizar configurações no Firestore:", error);
    }
  };

  const setProvider = (p: AIProviderType) => {
    setProviderState(p);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_provider', p);
    }
    syncToFirestore({ provider: p });
  };

  const setOllamaModel = (model: string) => {
    setOllamaModelState(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ollama_model', model);
    }
    syncToFirestore({ ollamaModel: model });
  };

  const setOllamaBaseUrl = (url: string) => {
    setOllamaBaseUrlState(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ollama_base_url', url);
    }
    syncToFirestore({ ollamaBaseUrl: url });
  };

  const setGeminiModel = (model: string) => {
    setGeminiModelState(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gemini_model', model);
    }
    syncToFirestore({ geminiModel: model });
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
    syncToFirestore({ geminiApiKey: key });
  };

  // TTS actions
  const setTtsProvider = (p: TTSProviderType) => {
    setTtsProviderState(p);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tts_provider', p);
    }
    syncToFirestore({ ttsProvider: p });
  };

  const setElevenLabsApiKey = (key: string) => {
    setElevenLabsApiKeyState(key);
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('elevenlabs_api_key', key);
      } else {
        localStorage.removeItem('elevenlabs_api_key');
      }
    }
    syncToFirestore({ elevenLabsApiKey: key });
  };

  const setElevenLabsVoiceId = (id: string) => {
    setElevenLabsVoiceIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('elevenlabs_voice_id', id);
    }
    syncToFirestore({ elevenLabsVoiceId: id });
  };

  const setTtsVoiceKeyword = (keyword: string) => {
    setTtsVoiceKeywordState(keyword);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tts_voice_keyword', keyword);
    }
    syncToFirestore({ ttsVoiceKeyword: keyword });
  };

  const setTtsRate = (rate: number) => {
    setTtsRateState(rate);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tts_rate', String(rate));
    }
    syncToFirestore({ ttsRate: rate });
  };

  return (
    <SettingsContext.Provider value={{ 
      provider, 
      setProvider, 
      ollamaModel, 
      setOllamaModel, 
      ollamaBaseUrl,
      setOllamaBaseUrl,
      geminiModel, 
      setGeminiModel, 
      geminiApiKey, 
      setGeminiApiKey,
      
      // TTS Settings
      ttsProvider,
      setTtsProvider,
      elevenLabsApiKey,
      setElevenLabsApiKey,
      elevenLabsVoiceId,
      setElevenLabsVoiceId,
      ttsVoiceKeyword,
      setTtsVoiceKeyword,
      ttsRate,
      setTtsRate
    }}>
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
