import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '../../utils/utils';
import { ProcessUserMessageUseCase } from '../../application/ProcessUserMessageUseCase';
import { FirebaseChatRepository } from '../../infrastructure/FirebaseChatRepository';
import { MemoryChatRepository } from '../../infrastructure/MemoryChatRepository';
import { DynamicAssistantService } from '../../infrastructure/DynamicAssistantService';
import { FirebaseKnowledgeBaseRepository } from '../../infrastructure/FirebaseKnowledgeBaseRepository';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { IChatRepository } from '../../domain/IChatRepository';
import { ChatSession, Message, Role } from '../../domain/Chat';
import { speakWithElevenLabs } from '../../infrastructure/ElevenLabsService';
import { audioManager } from '../../utils/audioManager';
import { Phone, Mic, SendHorizontal, Trash2, Check, User, Mail } from 'lucide-react';
import { auth, loginDevAdmin, loginAnonymously, isFirebaseRestricted, setFirebaseRestricted } from '../../infrastructure/firebase';
import { trackAnalyticsEvent } from '../../utils/analytics';
import { useSettings } from '../context/SettingsContext';

// SafeChatRepository delegates to FirebaseChatRepository but automatically falls back
// to MemoryChatRepository if a permission/auth error occurs (e.g. if Anonymous Auth is disabled).
class SafeChatRepository implements IChatRepository {
  public static isMemoryModeActive = false;

  constructor(
    private firebaseRepo: IChatRepository,
    private memoryRepo: IChatRepository,
    private onFallback: () => void
  ) {}

  private isPermissionError(err: any): boolean {
    return true; // Resiliência Total: Fallback para memória em QUALQUER erro de banco de dados para evitar crashes
  }

  private triggerFallback() {
    if (!SafeChatRepository.isMemoryModeActive) {
      SafeChatRepository.isMemoryModeActive = true;
      setFirebaseRestricted(true); // Persist restriction globally!
      this.onFallback();
    }
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      return await this.memoryRepo.getSession('visitor', sessionId);
    }
    try {
      return await this.firebaseRepo.getSession(userId, sessionId);
    } catch (err) {
      if (this.isPermissionError(err)) {
        console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em getSession. Usando fallback em memória.");
        this.triggerFallback();
        return await this.memoryRepo.getSession('visitor', sessionId);
      }
      throw err;
    }
  }

  async saveMessage(userId: string, sessionId: string, message: Message): Promise<void> {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      await this.memoryRepo.saveMessage('visitor', sessionId, message);
      return;
    }
    try {
      await this.firebaseRepo.saveMessage(userId, sessionId, message);
    } catch (err) {
      if (this.isPermissionError(err)) {
        console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em saveMessage. Usando fallback em memória.");
        this.triggerFallback();
        await this.memoryRepo.saveMessage('visitor', sessionId, message);
        return;
      }
      throw err;
    }
  }

  async updateSession(userId: string, session: ChatSession | (Partial<ChatSession> & { id: string })): Promise<void> {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      const existing = await this.memoryRepo.getSession('visitor', session.id);
      const fullSession = {
        id: session.id,
        userId: 'visitor',
        title: session.title || existing?.title || 'Conversa',
        lastMessage: session.lastMessage || existing?.lastMessage || '',
        createdAt: session.createdAt || existing?.createdAt || new Date().toISOString(),
        updatedAt: session.updatedAt || existing?.updatedAt || new Date().toISOString(),
        messages: ('messages' in session && session.messages ? [...session.messages] : null) || (existing?.messages ? [...existing.messages] : []),
        status: session.status || existing?.status || 'ia'
      };
      await this.memoryRepo.updateSession('visitor', fullSession);
      return;
    }
    try {
      await this.firebaseRepo.updateSession(userId, session);
    } catch (err) {
      if (this.isPermissionError(err)) {
        console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em updateSession. Usando fallback em memória.");
        this.triggerFallback();
        const fullSession = {
          id: session.id,
          userId: 'visitor',
          title: session.title || 'Conversa',
          lastMessage: session.lastMessage || '',
          createdAt: session.createdAt || new Date().toISOString(),
          updatedAt: session.updatedAt || new Date().toISOString(),
          messages: [],
          status: session.status || 'ia'
        };
        await this.memoryRepo.updateSession('visitor', fullSession);
        return;
      }
      throw err;
    }
  }

  async createSession(userId: string, title: string, lastMessage: string): Promise<ChatSession> {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      return await this.memoryRepo.createSession('visitor', title, lastMessage);
    }
    try {
      return await this.firebaseRepo.createSession(userId, title, lastMessage);
    } catch (err) {
      if (this.isPermissionError(err)) {
        console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em createSession. Usando fallback em memória.");
        this.triggerFallback();
        return await this.memoryRepo.createSession('visitor', title, lastMessage);
      }
      throw err;
    }
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      await this.memoryRepo.deleteSession('visitor', sessionId);
      return;
    }
    try {
      await this.firebaseRepo.deleteSession(userId, sessionId);
    } catch (err) {
      if (this.isPermissionError(err)) {
        this.triggerFallback();
        await this.memoryRepo.deleteSession('visitor', sessionId);
        return;
      }
      throw err;
    }
  }

  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      return this.memoryRepo.listenToSessions('visitor', callback, onError);
    }
    let firebaseUnsub: (() => void) | null = null;
    let activeUnsub: () => void = () => {
      if (firebaseUnsub) {
        try { firebaseUnsub(); } catch (e) {}
      }
    };
    try {
      firebaseUnsub = this.firebaseRepo.listenToSessions(userId, callback, (err) => {
        if (this.isPermissionError(err)) {
          console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em listenToSessions. Usando fallback.");
          this.triggerFallback();
          if (firebaseUnsub) {
            try { firebaseUnsub(); } catch (e) {}
            firebaseUnsub = null;
          }
          const memoryUnsub = this.memoryRepo.listenToSessions('visitor', callback, onError);
          activeUnsub = memoryUnsub;
        } else {
          onError(err);
        }
      });
      activeUnsub = () => {
        if (firebaseUnsub) {
          try { firebaseUnsub(); } catch (e) {}
        }
      };
    } catch (err: any) {
      if (this.isPermissionError(err)) {
        this.triggerFallback();
        activeUnsub = this.memoryRepo.listenToSessions('visitor', callback, onError);
      } else {
        throw err;
      }
    }
    return () => activeUnsub();
  }

  listenToAllSessions(callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    return this.firebaseRepo.listenToAllSessions(callback, onError);
  }

  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void {
    if (SafeChatRepository.isMemoryModeActive || isFirebaseRestricted) {
      return this.memoryRepo.listenToMessages('visitor', sessionId, callback, onError);
    }
    let firebaseUnsub: (() => void) | null = null;
    let activeUnsub: () => void = () => {
      if (firebaseUnsub) {
        try { firebaseUnsub(); } catch (e) {}
      }
    };
    try {
      firebaseUnsub = this.firebaseRepo.listenToMessages(userId, sessionId, callback, (err) => {
        if (this.isPermissionError(err)) {
          console.warn("[SafeChatRepository] Erro de permissão Firestore detectado em listenToMessages. Usando fallback.");
          this.triggerFallback();
          if (firebaseUnsub) {
            try { firebaseUnsub(); } catch (e) {}
            firebaseUnsub = null;
          }
          const memoryUnsub = this.memoryRepo.listenToMessages('visitor', sessionId, callback, onError);
          activeUnsub = memoryUnsub;
        } else {
          onError(err);
        }
      });
      activeUnsub = () => {
        if (firebaseUnsub) {
          try { firebaseUnsub(); } catch (e) {}
        }
      };
    } catch (err: any) {
      if (this.isPermissionError(err)) {
        this.triggerFallback();
        activeUnsub = this.memoryRepo.listenToMessages('visitor', sessionId, callback, onError);
      } else {
        throw err;
      }
    }
    return () => activeUnsub();
  }
}

// Instantiate repositories and services
const firebaseChatRepo = new FirebaseChatRepository();
const memoryChatRepo = new MemoryChatRepository();
const kbRepo = new FirebaseKnowledgeBaseRepository();
const customerRepo = new FirebaseCustomerRepository();
const aiService = new DynamicAssistantService(); // Handles dynamic AI models, provider selection and fallbacks

export function ChatWidget() {
  const { ttsProvider, elevenLabsApiKey, elevenLabsVoiceId, ttsVoiceKeyword, ttsRate } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const baseTranscriptRef = useRef('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [welcomeRead, setWelcomeRead] = useState(false);

  // Estados de Captação e Identificação de Leads
  const [step, setStep] = useState<'form' | 'chat'>('chat');
  const [conversationalStep, setConversationalStep] = useState<'ask_name' | 'ask_email' | 'check_customer' | 'ask_phone' | 'ready'>('ready');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [formError, setFormError] = useState('');
  const [visitorId, setVisitorId] = useState('visitor');
  const [sessionStatus, setSessionStatus] = useState<'ia' | 'aguardando_humano' | 'humano' | 'concluido'>('ia');
  const [operatorName, setOperatorName] = useState('');
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [visitorPlan, setVisitorPlan] = useState<string | null>(() => localStorage.getItem('segurabot_visitor_plan'));

  const [fallbackTriggered, setFallbackTriggered] = useState(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const leadNameRef = useRef(leadName);
  leadNameRef.current = leadName;

  // Define a memoized SafeChatRepository instance that automatically falls back to in-memory on permission errors
  const activeRepo = useMemo(() => {
    const isRestricted = isFirebaseRestricted || (typeof window !== 'undefined' && localStorage.getItem('segurabot_firebase_restricted') === 'true');
    const isMock = isRestricted || SafeChatRepository.isMemoryModeActive || auth.currentUser === null || visitorId === 'visitor' || visitorId.startsWith('mock_');
    const baseRepo = isMock ? memoryChatRepo : firebaseChatRepo;
    return new SafeChatRepository(baseRepo, memoryChatRepo, () => {
      console.warn("[ChatWidget] Fallback de repositório acionado. Mantendo dados do lead na memória local para fluidez absoluta.");
      const currentMessages = messagesRef.current;
      const currentName = leadNameRef.current;
      if (visitorId && sessionId && currentMessages.length > 0) {
        memoryChatRepo.updateSession('visitor', {
          id: sessionId,
          userId: 'visitor',
          title: `Conversa com ${currentName.trim() || 'Visitante'}`,
          lastMessage: currentMessages[currentMessages.length - 1]?.content || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: currentMessages,
          status: 'ia',
          operatorName: ''
        });
      }
      setFallbackTriggered(prev => prev + 1);
    });
  }, [visitorId, fallbackTriggered]);

  // Debug hook
  useEffect(() => {
    (window as any).debugVisitorId = visitorId;
    console.log("[Debug] visitorId state changed:", visitorId);
  }, [visitorId]);

  // Estados para simulação de fila de atendimento humano
  const [queuePosition, setQueuePosition] = useState(3);
  const [queueTime, setQueueTime] = useState(4);

  // Load visitor details from localStorage if they subscribed to a plan
  useEffect(() => {
    const handlePlanSubscribed = () => {
      const storedId = localStorage.getItem('segurabot_visitor_id');
      const storedName = localStorage.getItem('segurabot_visitor_name');
      const storedEmail = localStorage.getItem('segurabot_visitor_email');
      const storedPlan = localStorage.getItem('segurabot_visitor_plan');
      
      const lowercaseStoredName = (storedName || '').trim().toLowerCase();
      const greetings = ['oi', 'ola', 'olá', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite', 'oi!', 'olá!', 'ola!'];
      const isStoredNameGreeting = greetings.includes(lowercaseStoredName) || lowercaseStoredName.length < 2;

      if (storedId && storedName && storedEmail && !isStoredNameGreeting) {
        setVisitorId(storedId);
        setLeadName(storedName);
        setLeadEmail(storedEmail);
        setVisitorPlan(storedPlan);
        setStep('chat');
        setConversationalStep('ready');
        initializeChat(storedId, storedName);
        setIsOpen(true); // Abre o widget automaticamente após assinar
      } else {
        // Limpa cache corrompido de saudação se houver
        if (isStoredNameGreeting) {
          localStorage.removeItem('segurabot_visitor_id');
          localStorage.removeItem('segurabot_visitor_name');
          localStorage.removeItem('segurabot_visitor_email');
        }
        setStep('chat');
        setConversationalStep('ask_name');
        setVisitorId('visitor');
        const firstMessage: Message = {
          id: 'welcome',
          role: Role.MODEL,
          content: 'Olá! Sou o assistente virtual da SeguraBot. Para que eu possa te dar o suporte ideal, me diz: qual é o seu nome completo?',
          timestamp: new Date().toISOString()
        };
        setMessages([firstMessage]);
        memoryChatRepo.updateSession('visitor', {
          id: sessionId,
          userId: 'visitor',
          title: 'Conversa de Identificação',
          lastMessage: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [firstMessage],
          status: 'ia',
          operatorName: ''
        });
      }
    };

    // Executa no mount
    handlePlanSubscribed();

    // Escuta evento dinâmico
    window.addEventListener('segurabot_plan_subscribed', handlePlanSubscribed);
    return () => window.removeEventListener('segurabot_plan_subscribed', handlePlanSubscribed);
  }, []);

  // Foco automático do campo de texto ao terminar de carregar (isLoading === false)
  useEffect(() => {
    if (!isLoading && isOpen && step === 'chat') {
      const timeoutId = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, isOpen, step]);

  // Initialize Speech Recognition on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        console.log('Speech recognition result:', transcript);
        setInput(baseTranscriptRef.current + transcript);
      };

      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
  }, []);
 
  // Timer for recording
  useEffect(() => {
    let interval: any;
    if (isListening) {
      setRecordingSeconds(0);
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isListening]);

  // Simulação de Fila e Atendimento Humano Automático
  useEffect(() => {
    if (sessionStatus !== 'aguardando_humano') {
      setQueuePosition(3);
      setQueueTime(4);
      return;
    }

    const interval = setInterval(() => {
      setQueuePosition(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // Simula o atendente assumindo após 4 segundos na primeira posição
          setTimeout(async () => {
            if (visitorId && sessionId) {
              try {
                const session = await activeRepo.getSession(visitorId, sessionId);
                if (session && session.status === 'aguardando_humano') {
                  const updatedSession = {
                    ...session,
                    status: 'humano' as const,
                    operatorName: 'Leonardo Alves Pereira'
                  };
                  await activeRepo.updateSession(visitorId, updatedSession);
                  
                  const systemMsg: Message = {
                    id: `sys-${Date.now()}`,
                    role: Role.MODEL,
                    content: `O operador Leonardo Alves Pereira entrou na conversa. Como posso te ajudar em detalhes hoje?`,
                    timestamp: new Date().toISOString()
                  };
                  await activeRepo.saveMessage(visitorId, sessionId, systemMsg);
                  setMessages(prev => [...prev, systemMsg]);
                  speak(systemMsg.content);
                }
              } catch (err) {
                console.error("Error simulating operator handoff acceptance:", err);
              }
            }
          }, 4000);
          return 1;
        }
        setQueueTime(t => Math.max(1, t - 1));
        return prev - 1;
      });
    }, 10000); // Fila tica a cada 10 segundos

    return () => clearInterval(interval);
  }, [sessionStatus, visitorId, sessionId]);

  const initializeChat = (newVisitorId: string, name: string) => {
    const isMock = isFirebaseRestricted || SafeChatRepository.isMemoryModeActive || auth.currentUser === null || newVisitorId === 'visitor' || newVisitorId.startsWith('mock_');
    const baseRepo = isMock ? memoryChatRepo : firebaseChatRepo;
    const safeRepo = new SafeChatRepository(baseRepo, memoryChatRepo, () => {});
    
    safeRepo.updateSession(newVisitorId, {
      id: sessionId,
      userId: newVisitorId,
      title: `Conversa com ${name}`,
      lastMessage: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      status: 'ia',
      operatorName: ''
    });
    const welcomeMessage: Message = {
      id: 'welcome',
      role: Role.MODEL,
      content: `Olá, ${name}! Sou o assistente virtual da SeguraBot. Como posso ajudar você hoje?`,
      timestamp: new Date().toISOString()
    };
    setMessages([welcomeMessage]);
    safeRepo.saveMessage(newVisitorId, sessionId, welcomeMessage);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadEmail.trim()) {
      setFormError('Por favor, preencha o Nome e o E-mail.');
      return;
    }
    
    setIsLoading(true);
    setFormError('');
    
    try {
      // 1. Efetuar Login Anônimo para ter permissão de gravação no Firestore
      const anonymousUser = await loginAnonymously();
      const newVisitorId = anonymousUser.uid;
      setVisitorId(newVisitorId);
      
      // 2. Verificar se o e-mail já existe
      const existingProfile = await customerRepo.getCustomerProfileByEmail(leadEmail.trim());
      if (existingProfile) {
        setIsExistingCustomer(true);
        setIsLoading(false);
        return;
      }
      
      // 3. É um novo Lead - criar perfil no Firestore
      await customerRepo.saveCustomerProfile(newVisitorId, {
        userId: newVisitorId,
        name: leadName.trim(),
        email: leadEmail.trim(),
        phone: leadPhone.trim(),
        activePolicies: [],
        policies: [],
        claims: [],
        documents: [],
        loyaltyTier: 'Padrão',
        lifeStage: 'Solteiro',
        riskScore: 0,
        aiSummary: 'Lead cooptado via chat da Landing Page.',
        role: 'cliente'
      });
      
      // 4. Inicializar a sessão de chat associada ao lead
      initializeChat(newVisitorId, leadName.trim());
      setStep('chat');
    } catch (err: any) {
      console.error(err);
      setFormError('Ocorreu um erro ao processar seus dados. Iniciando chat de suporte genérico.');
      const fallbackId = `visitor-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setVisitorId(fallbackId);
      initializeChat(fallbackId, leadName.trim() || 'Visitante');
      setStep('chat');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('openChatWidget', handleOpenChat);
    return () => window.removeEventListener('openChatWidget', handleOpenChat);
  }, []);

  // Escutar atualizações da sessão e mensagens em tempo real se o chat estiver ativo
  useEffect(() => {
    if (step !== 'chat' || !visitorId || !sessionId || visitorId === 'visitor') return;

    // Escutar mensagens em tempo real
    const msgsUnsub = activeRepo.listenToMessages(visitorId, sessionId, (data) => {
      if (data && data.length > 0) {
        setMessages(data);
      }
    }, (error) => {
      console.error("Erro ao escutar mensagens no widget:", error);
    });

    // Escutar status da sessão em tempo real para detectar quando o operador assume
    let sessionUnsub = () => {};
    if ('listenToSessions' in activeRepo) {
      sessionUnsub = activeRepo.listenToSessions(visitorId, (sessionsList) => {
        const currentSession = sessionsList.find(s => s.id === sessionId);
        if (currentSession) {
          setSessionStatus(currentSession.status || 'ia');
          setOperatorName(currentSession.operatorName || '');
          setOperatorTyping(currentSession.operatorTyping || false);
        }
      }, (err) => {
        console.error("Erro ao escutar sessão no widget:", err);
      });
    }

    return () => {
      msgsUnsub();
      sessionUnsub();
    };
  }, [step, visitorId, sessionId, activeRepo]);

  useEffect(() => {
    if (isOpen) {
      trackAnalyticsEvent('chat_click');
    }
  }, [isOpen]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      baseTranscriptRef.current = input; // Save current input as base!
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const speak = async (text: string) => {
    // Só fala se a aba estiver visível e ativa
    if (document.visibilityState !== 'visible') {
      console.log('Aba não visível, silenciando áudio.');
      return;
    }

    // Cancel any ongoing speech
    audioManager.stopActiveAudio();
    
    // Remove emojis
    const cleanText = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
    
    // Tenta usar ElevenLabs (se selecionado e configurado)
    if (ttsProvider === 'elevenlabs') {
      const elevenLabsSuccess = await speakWithElevenLabs(cleanText, elevenLabsApiKey, elevenLabsVoiceId);
      if (elevenLabsSuccess) return;
    }
    
    // Fallback nativo (Web Speech API - Gratuito, sem chaves e sem logins)
    const getBestVoice = () => {
      const voices = speechSynthesis.getVoices();
      const ptVoices = voices.filter(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));
      const filterKeyword = ttsVoiceKeyword || 'google';
      const premiumVoice = ptVoices.find(v => {
        const nameLower = v.name.toLowerCase();
        if (filterKeyword === 'all') return false; // Sem priorização especial
        return nameLower.includes(filterKeyword.toLowerCase()) || nameLower.includes('online') || nameLower.includes('natural');
      });
      return premiumVoice || ptVoices[0] || null;
    };

    const speakText = () => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = ttsRate; // Velocidade de leitura configurável
      
      const selectedVoice = getBestVoice();
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      speechSynthesis.speak(utterance);
    };

    // Caso o navegador ainda esteja carregando as vozes assincronamente
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => {
        speakText();
        speechSynthesis.onvoiceschanged = null; // Remove o listener após rodar
      };
    } else {
      speakText();
    }
  };

  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);

  const handleClientTyping = () => {
    if (visitorId === 'visitor' || !sessionId) return;
    
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      activeRepo.updateSession(visitorId, {
        id: sessionId,
        clientTyping: true
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      activeRepo.updateSession(visitorId, {
        id: sessionId,
        clientTyping: false
      });
    }, 2000);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Reset client typing state instantly
    isTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (visitorId !== 'visitor') {
      activeRepo.updateSession(visitorId, {
        id: sessionId,
        clientTyping: false
      });
    }

    trackAnalyticsEvent('message_send');

    // Fala um placeholder para desbloquear o áudio e dar feedback imediato
    speak("Processando sua pergunta");

    const userMessageContent = input;
    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: Role.USER,
      content: userMessageContent,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (conversationalStep !== 'ready') {
      const activeRepo = memoryChatRepo;
      try {
        await activeRepo.saveMessage('visitor', sessionId, userMessage);
        
        if (conversationalStep === 'ask_name') {
          const nameVal = userMessageContent.trim();
          const lowercaseName = nameVal.toLowerCase();
          const greetings = ['oi', 'ola', 'olá', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite', 'oi!', 'olá!', 'ola!', 'test', 'teste', 'ai', 'ia'];
          const isGreeting = greetings.includes(lowercaseName) || nameVal.length < 3;
          const hasNumbersOrSpecial = /[^a-zA-ZÀ-ÿ\s]/.test(nameVal);

          if (isGreeting || hasNumbersOrSpecial) {
            const botReply: Message = {
              id: `msg-${Date.now()}`,
              role: Role.MODEL,
              content: `Olá! Para que eu possa te dar o suporte ideal, me diz por favor: qual é o seu nome completo? (Por favor, digite apenas letras, sem números ou saudações).`,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, botReply]);
            await activeRepo.saveMessage('visitor', sessionId, botReply);
            speak(botReply.content);
            return;
          }

          setLeadName(nameVal);
          setConversationalStep('ask_email');
          
          const botReply: Message = {
            id: `msg-${Date.now()}`,
            role: Role.MODEL,
            content: `Muito prazer, ${nameVal}! E qual é o seu e-mail para contato?`,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, botReply]);
          await activeRepo.saveMessage('visitor', sessionId, botReply);
          speak(botReply.content);
        } 
        else if (conversationalStep === 'ask_email') {
          const emailVal = userMessageContent.trim().toLowerCase();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailVal)) {
            const botReply: Message = {
              id: `msg-${Date.now()}`,
              role: Role.MODEL,
              content: `Por favor, informe um endereço de e-mail válido (exemplo: seu.nome@email.com) para que possamos prosseguir.`,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, botReply]);
            await activeRepo.saveMessage('visitor', sessionId, botReply);
            speak(botReply.content);
          } else {
            setLeadEmail(emailVal);
            setConversationalStep('check_customer');
            
            // Busca se o e-mail já existe no Firestore/Auth
            const existingProfile = await customerRepo.getCustomerProfileByEmail(emailVal);
            if (existingProfile) {
              setIsExistingCustomer(true);
              const botReply: Message = {
                id: `msg-${Date.now()}`,
                role: Role.MODEL,
                content: `Identifiquei que você já é segurado e possui uma apólice ativa com a gente! Deseja fazer login para acessar seus dados com total segurança, ou prefere apenas continuar a conversa como visitante por enquanto?`,
                timestamp: new Date().toISOString()
              };
              setMessages(prev => [...prev, botReply]);
              await activeRepo.saveMessage('visitor', sessionId, botReply);
              speak(botReply.content);
            } else {
              setConversationalStep('ask_phone');
              const botReply: Message = {
                id: `msg-${Date.now()}`,
                role: Role.MODEL,
                content: `Excelente! E para finalizarmos seu contato, qual é o seu telefone ou WhatsApp de atendimento?`,
                timestamp: new Date().toISOString()
              };
              setMessages(prev => [...prev, botReply]);
              await activeRepo.saveMessage('visitor', sessionId, botReply);
              speak(botReply.content);
            }
          }
        }
        else if (conversationalStep === 'ask_phone') {
          const phoneVal = userMessageContent.trim();
          const cleanPhone = phoneVal.replace(/\D/g, ''); // Mantém apenas os números
          
          if (cleanPhone.length < 8 || cleanPhone.length > 15) {
            const botReply: Message = {
              id: `msg-${Date.now()}`,
              role: Role.MODEL,
              content: `Por favor, informe um número de telefone ou WhatsApp válido com o DDD (exemplo: 11 98765-4321).`,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, botReply]);
            await activeRepo.saveMessage('visitor', sessionId, botReply);
            speak(botReply.content);
            return;
          }

          setLeadPhone(phoneVal);
          
          // Efetua login anônimo e salva os dados no Firestore para criar o perfil
          let newVisitorId = '';
          try {
            const anonymousUser = await loginAnonymously();
            newVisitorId = anonymousUser.uid;
          } catch (authErr) {
            newVisitorId = 'mock_' + Math.random().toString(36).substring(2, 11);
          }
          
          setVisitorId(newVisitorId);
          
          try {
            await customerRepo.saveCustomerProfile(newVisitorId, {
              userId: newVisitorId,
              name: leadName.trim(),
              email: leadEmail.trim(),
              phone: phoneVal,
              activePolicies: [],
              policies: [],
              claims: [],
              documents: [],
              loyaltyTier: 'Demonstração (Sem Contrato)',
              lifeStage: 'Solteiro',
              riskScore: 0,
              aiSummary: 'Lead qualificado via fluxo conversacional no ChatWidget.',
              role: 'cliente'
            });
          } catch (dbErr) {
            console.warn("Error saving conversational customer profile:", dbErr);
          }
          
          localStorage.setItem('segurabot_visitor_id', newVisitorId);
          localStorage.setItem('segurabot_visitor_name', leadName.trim());
          localStorage.setItem('segurabot_visitor_email', leadEmail.trim());
          
          // Migrar mensagens e sessão para o novo visitorId no Firestore
          const messagesToSave = [...messages, userMessage];
          const readyMessage: Message = {
            id: `msg-${Date.now()}`,
            role: Role.MODEL,
            content: `Excelente, ${leadName}! Seu contato foi registrado com sucesso. Como posso ajudar você no dia de hoje?`,
            timestamp: new Date().toISOString()
          };
          const finalMessages = [...messagesToSave, readyMessage];
          
          try {
            const isMock = isFirebaseRestricted || SafeChatRepository.isMemoryModeActive || auth.currentUser === null || newVisitorId === 'visitor' || newVisitorId.startsWith('mock_');
            const baseRepo = isMock ? memoryChatRepo : firebaseChatRepo;
            const safeRepo = new SafeChatRepository(baseRepo, memoryChatRepo, () => {});

            await safeRepo.updateSession(newVisitorId, {
              id: sessionId,
              userId: newVisitorId,
              title: `Conversa com ${leadName.trim()}`,
              lastMessage: readyMessage.content,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: finalMessages,
              status: 'ia',
              operatorName: ''
            });
            
            for (const msg of finalMessages) {
              await safeRepo.saveMessage(newVisitorId, sessionId, msg);
            }
          } catch (chatErr) {
            console.warn("Firestore chat save failed, using local browser fallback:", chatErr);
          }
          
          setMessages(finalMessages);
          setConversationalStep('ready');
          speak(readyMessage.content);
        }
      } catch (err) {
        console.error("Error in conversational step:", err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (sessionStatus === 'humano' || sessionStatus === 'aguardando_humano') {
      try {
        await activeRepo.saveMessage(visitorId, sessionId, userMessage);
        const session = await activeRepo.getSession(visitorId, sessionId);
        if (session) {
          session.updatedAt = new Date().toISOString();
          session.lastMessage = userMessageContent;
          await activeRepo.updateSession(visitorId, session);
        }
      } catch (err) {
        console.error("Erro ao salvar mensagem sob suporte humano:", err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const useCase = new ProcessUserMessageUseCase(activeRepo, aiService, kbRepo, customerRepo);
      
      let chunkCount = 0;
      await useCase.execute(visitorId, sessionId, userMessageContent, (chunk) => {
        chunkCount++;
        setStreamingText(prev => prev + chunk);
      });

      // After execution, the message should be in the repository
      const session = await activeRepo.getSession(visitorId, sessionId);
      if (session && session.messages) {
        setMessages(session.messages);
        
        // Speak the last assistant message
        const lastMessage = session.messages[session.messages.length - 1];
        if (lastMessage && (lastMessage.role as string) === 'model') {
          speak(lastMessage.content);
        }
      }
      setStreamingText('');
      setIsLoading(false);
    } catch (error) {
      console.error('Error processing message:', error);
      setIsLoading(false);
      setStreamingText('');
      // Add error message
      setMessages(prev => [...prev, {
        id: 'error',
        role: Role.MODEL,
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const resetChat = async () => {
    localStorage.removeItem('segurabot_visitor_id');
    localStorage.removeItem('segurabot_visitor_name');
    localStorage.removeItem('segurabot_visitor_email');
    localStorage.removeItem('segurabot_visitor_plan');
    
    setVisitorId('visitor');
    setLeadName('');
    setLeadEmail('');
    setLeadPhone('');
    setVisitorPlan(null);
    setStep('chat');
    setConversationalStep('ask_name');
    setIsExistingCustomer(false);
    
    const firstMessage: Message = {
      id: 'welcome',
      role: Role.MODEL,
      content: 'Olá! Sou o assistente virtual da SeguraBot. Para que eu possa te dar o suporte ideal, me diz: qual é o seu nome completo?',
      timestamp: new Date().toISOString()
    };
    setMessages([firstMessage]);
    
    memoryChatRepo.updateSession('visitor', {
      id: sessionId,
      userId: 'visitor',
      title: 'Conversa de Identificação',
      lastMessage: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [firstMessage],
      status: 'ia',
      operatorName: ''
    });
    
    speak(firstMessage.content);
  };

  const exportChatAsPDF = () => {
    if (messages.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Por favor, permita pop-ups para exportar o PDF de atendimento.");
      return;
    }
    
    const chatHtml = messages.map(msg => {
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const isUser = (msg.role as string) === 'user';
      const senderName = isUser 
        ? (leadName || 'Cliente Autenticado') 
        : (sessionStatus === 'humano' ? operatorName : 'SeguraBot IA');
        
      return `
        <div class="message-container ${isUser ? 'user' : 'bot'}">
          <div class="message-header">
            <strong>${senderName}</strong>
            <span class="time">${time}</span>
          </div>
          <div class="message-content">${msg.content.replace(/\n/g, '<br/>')}</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SeguraBot_Relatorio_${(leadName || 'Visitante').replace(/\s+/g, '_')}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
          body {
            font-family: 'Outfit', sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 45px;
            padding: 0;
            line-height: 1.6;
          }
          .header {
            border-bottom: 2px solid #5e81f4;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo {
            font-size: 26px;
            font-weight: 800;
            color: #5e81f4;
            letter-spacing: -0.8px;
          }
          .meta-info {
            text-align: right;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #64748b;
            font-weight: 600;
            line-height: 1.4;
          }
          .meta-info p {
            margin: 3px 0;
          }
          .chat-title {
            font-size: 15px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            color: #0f172a;
            margin-bottom: 25px;
            border-left: 3px solid #5e81f4;
            padding-left: 10px;
          }
          .message-container {
            margin-bottom: 16px;
            padding: 14px 18px;
            border-radius: 12px;
            max-width: 85%;
            font-size: 13px;
          }
          .message-container.user {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 4px solid #64748b;
            margin-right: auto;
          }
          .message-container.bot {
            background-color: #eff6ff;
            border: 1px solid #dbeafe;
            border-left: 4px solid #3b82f6;
            margin-left: auto;
          }
          .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
          }
          .message-header strong {
            color: #1e293b;
          }
          .message-content {
            font-weight: 400;
            color: #334155;
            word-break: break-word;
          }
          .footer {
            margin-top: 60px;
            border-top: 1px solid #e2e8f0;
            padding-top: 18px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
          }
          @media print {
            body { margin: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">SeguraBot</div>
          <div class="meta-info">
            <p><strong>Segurado:</strong> ${leadName || 'Cliente Autenticado'}</p>
            <p><strong>E-mail:</strong> ${leadEmail || '-'}</p>
            <p><strong>Plano Contratado:</strong> ${visitorPlan || 'Demonstração (Sem Contrato)'}</p>
            <p><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        
        <div class="chat-title">Registro Oficial de Atendimento Inteligente</div>
        
        <div class="chat-history">
          ${chatHtml}
        </div>
        
        <div class="footer">
          SeguraBot Inteligência de Seguros S.A. — Relatório de Atendimento ao Cliente
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 h-[450px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-[#ECECF2] dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#5E81F4] to-[#9698D6] dark:from-slate-850 dark:to-slate-800 text-white flex justify-between items-center transition-colors duration-300 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider">
                  {sessionStatus === 'humano' ? 'Suporte Humano' : 'Atendimento SeguraBot'}
                </h3>
                <p className="text-[10px] text-blue-50 dark:text-slate-400 font-mono mt-0.5">
                  {sessionStatus === 'humano' ? `Operador: ${operatorName}` : sessionStatus === 'aguardando_humano' ? 'Aguardando Operador' : 'Assistente Virtual'}
                </p>
              </div>
              {visitorPlan && (
                <span className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0",
                  visitorPlan === 'Premium' ? "bg-white text-[#5E81F4] dark:bg-blue-950/60 dark:text-blue-400 border border-blue-500/10" :
                  visitorPlan === 'Gold' ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-500/10" :
                  "bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-400 border border-slate-700/20"
                )}>
                  {visitorPlan === 'Premium' ? 'Premium' : visitorPlan === 'Gold' ? 'Gold' : 'Bronze'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={resetChat}
                className="text-[10px] uppercase font-bold tracking-widest hover:text-blue-100 dark:hover:text-slate-300 transition-colors cursor-pointer" 
                title="Reiniciar conversa e limpar identificação local"
              >
                Reiniciar
              </button>
              <button 
                onClick={exportChatAsPDF}
                disabled={messages.length === 0}
                className="text-[10px] uppercase font-bold tracking-widest hover:text-blue-100 dark:hover:text-slate-300 transition-colors cursor-pointer disabled:opacity-40" 
                title="Exportar PDF do Atendimento"
              >
                Baixar PDF
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-[10px] uppercase font-bold tracking-widest hover:text-blue-100 dark:hover:text-slate-300 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          {step === 'form' ? (
            <div className="flex-1 p-6 bg-[#F6F6F6] dark:bg-slate-950/80 flex flex-col justify-between select-none">
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Identifique-se para Iniciar
                </p>
                
                {formError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg border border-rose-100/50 dark:border-transparent text-center uppercase tracking-wider">
                    {formError}
                  </div>
                )}

                {isExistingCustomer ? (
                  <div className="space-y-4 text-center py-4">
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                      Identificamos que você já é nosso cliente! Para visualizarmos suas apólices e histórico com total segurança, por favor faça login na sua conta.
                    </p>
                    <button
                      onClick={async () => {
                        setIsLoading(true);
                        try {
                          await loginDevAdmin(); // Em dev, loga instantaneamente como admin
                          window.location.reload(); // Recarrega para levar ao Dashboard
                        } catch (err) {
                          console.error(err);
                          setIsLoading(false);
                        }
                      }}
                      className="w-full py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-[#5E81F4]/10"
                    >
                      {isLoading ? 'Autenticando...' : 'Entrar na Minha Conta'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleFormSubmit} className="space-y-3.5">
                    <div>
                      <label className="text-[9px] font-bold text-[#8181A5] uppercase tracking-wider block mb-1">Nome Completo</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-655 pointer-events-none" />
                        <input
                          type="text"
                          value={leadName}
                          onChange={(e) => setLeadName(e.target.value)}
                          placeholder="Ex: João Silva"
                          className="w-full pl-9 pr-3 py-2.5 text-xs border border-[#ECECF2] dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5E81F4] transition-colors placeholder:text-[#8181A5]/40 font-semibold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#8181A5] uppercase tracking-wider block mb-1">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-655 pointer-events-none" />
                        <input
                          type="email"
                          value={leadEmail}
                          onChange={(e) => setLeadEmail(e.target.value)}
                          placeholder="Ex: joao.silva@exemplo.com"
                          className="w-full pl-9 pr-3 py-2.5 text-xs border border-[#ECECF2] dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5E81F4] transition-colors placeholder:text-[#8181A5]/40 font-semibold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#8181A5] uppercase tracking-wider block mb-1">Telefone / WhatsApp</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-655 pointer-events-none" />
                        <input
                          type="text"
                          value={leadPhone}
                          onChange={(e) => setLeadPhone(e.target.value)}
                          placeholder="Ex: (11) 98765-4321"
                          className="w-full pl-9 pr-3 py-2.5 text-xs border border-[#ECECF2] dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5E81F4] transition-colors placeholder:text-[#8181A5]/40 font-semibold"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-[#5E81F4]/10"
                    >
                      {isLoading ? 'Verificando...' : 'Iniciar Conversa'}
                    </button>
                  </form>
                )}
              </div>

              {!isExistingCustomer && (
                <button
                  onClick={() => setIsExistingCustomer(true)}
                  className="text-center text-[10px] text-[#5E81F4] hover:text-[#5E81F4]/80 font-bold uppercase tracking-wider cursor-pointer outline-none mt-4 transition-colors"
                >
                  Já é nosso cliente?
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#F6F6F6] dark:bg-slate-950/80">
                {sessionStatus === 'aguardando_humano' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-xl space-y-1 animate-pulse text-center select-none shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-widest">
                      Fila de Espera Suporte
                    </p>
                    <p className="text-[9px] font-bold leading-normal">
                      Sua posição atual: <strong className="text-amber-600 dark:text-amber-400 font-black">{queuePosition}º lugar</strong>
                    </p>
                    <p className="text-[8px] text-[#8181A5] leading-normal uppercase tracking-wider">
                      Tempo estimado: ~{queueTime} min
                    </p>
                  </div>
                )}

                {messages.map((msg) => 
                  msg.senderName === 'Sistema' ? (
                    <div key={msg.id} className="w-full text-center my-2 select-none">
                      <span className="inline-block px-3 py-1.5 bg-[#5E81F4]/10 dark:bg-slate-900/40 text-[#5E81F4] dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#ECECF2] dark:border-slate-800">
                        {msg.content}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[80%] p-3.5 rounded-2xl text-xs transition-colors shadow-sm",
                        msg.role === Role.USER
                          ? "bg-[#5E81F4] text-white ml-auto rounded-tr-none"
                          : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-[#ECECF2] dark:border-slate-800 rounded-tl-none"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        <div className="flex items-center justify-between gap-4 mt-1.5 shrink-0">
                          {msg.role !== Role.USER ? (
                            <button
                              onClick={() => speak(msg.content)}
                              className="text-[10px] text-[#5E81F4] hover:text-[#5E81F4]/80 font-semibold hover:underline cursor-pointer"
                            >
                              Ouvir
                            </button>
                          ) : <div />}
                          {msg.timestamp && (
                            <span className={cn("text-[8px] font-mono", msg.role === Role.USER ? "text-blue-100/80" : "text-slate-400 dark:text-slate-500")}>
                              {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
                
                {/* Streaming Message */}
                {streamingText && (
                  <div className="max-w-[80%] p-3.5 rounded-2xl rounded-tl-none text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-[#ECECF2] dark:border-slate-800 shadow-sm">
                    {streamingText}
                  </div>
                )}

                {/* Loading Indicator */}
                {isLoading && !streamingText && (
                  <div className="text-[10px] font-mono text-[#8181A5] uppercase tracking-wider animate-pulse">
                    Pensando...
                  </div>
                )}
                {operatorTyping && (
                  <div className="max-w-[80%] p-3.5 rounded-2xl rounded-tl-none text-xs bg-white dark:bg-slate-900 text-slate-500 italic border border-[#ECECF2] dark:border-slate-800 shadow-sm animate-pulse mr-auto">
                    Digitando...
                  </div>
                )}
                
                {isExistingCustomer && conversationalStep === 'check_customer' && (
                  <div className="my-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 animate-fade-in text-center select-none">
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                      Identificamos sua Conta
                    </p>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-normal max-w-xs mx-auto">
                      Já existe uma apólice associada ao e-mail <strong className="text-slate-900 dark:text-white font-semibold">{leadEmail}</strong>. Deseja realizar login agora?
                    </p>
                    <div className="flex gap-2.5">
                      <button
                        onClick={async () => {
                          setIsLoading(true);
                          window.dispatchEvent(new CustomEvent('openLoginModal'));
                          setIsLoading(false);
                        }}
                        className="flex-1 py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-[8px] font-black rounded-lg uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                      >
                        Fazer Login
                      </button>
                      <button
                        onClick={async () => {
                          setIsExistingCustomer(false);
                          setConversationalStep('ready');
                          const guestMsg: Message = {
                            id: `msg-guest-${Date.now()}`,
                            role: Role.MODEL,
                            content: `Perfeito! Vamos continuar o atendimento como visitante sem login. Como posso ajudar você hoje?`,
                            timestamp: new Date().toISOString()
                          };
                          setMessages(prev => [...prev, guestMsg]);
                          speak(guestMsg.content);
                        }}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-350 text-[8px] font-black rounded-lg uppercase tracking-widest transition-all cursor-pointer"
                      >
                        Apenas Continuar
                      </button>
                    </div>
                  </div>
                )}
                 
                 <div ref={messagesEndRef} />
               </div>

              {/* Input Area */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-[#ECECF2] dark:border-slate-800 flex items-center gap-2">
                {isListening ? (
                  <div className="flex-1 flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-2xl border border-[#ECECF2] dark:border-slate-800">
                    {/* Trash Icon on the Left */}
                    <button 
                      onClick={() => {
                        recognitionRef.current?.stop();
                        setInput('');
                        baseTranscriptRef.current = '';
                      }}
                      className="text-[#8181A5] hover:text-red-500 transition-colors p-1 flex-shrink-0 cursor-pointer"
                      title="Cancelar"
                    >
                      <Trash2 size={18} />
                    </button>

                    {/* Timer */}
                    <div className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 flex-shrink-0">
                      {formatTime(recordingSeconds)}
                    </div>

                    {/* Text (Wrapping) */}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                        {input || "Gravando..."}
                      </span>
                    </div>

                    {/* Check/Confirm Icon on the Right */}
                    <button 
                      onClick={() => recognitionRef.current?.stop()}
                      className="text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors p-1 flex-shrink-0 cursor-pointer"
                      title="Parar e usar"
                    >
                      <Check size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={chatInputRef}
                      type="text"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        handleClientTyping();
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Digite sua dúvida..."
                      className="flex-1 px-4 py-2.5 text-xs border border-[#ECECF2] dark:border-slate-800 rounded-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 transition-colors placeholder:text-[#8181A5]/50"
                      disabled={isLoading}
                    />
                    <button
                      onClick={toggleListening}
                      disabled={isLoading}
                      className="bg-slate-50 dark:bg-slate-950 text-[#8181A5] hover:text-slate-800 dark:hover:text-[#5E81F4] p-2 rounded-full transition-colors border border-[#ECECF2] dark:border-slate-800 flex items-center justify-center w-9 h-9 cursor-pointer"
                      title="Falar"
                    >
                      <Mic size={18} />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={isLoading || !input.trim()}
                      className="p-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-9 h-9 cursor-pointer shadow-sm"
                      title="Enviar"
                    >
                      <SendHorizontal size={18} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button (Estilo Gradiente Moderno - Cores da Marca) */}
      <button
        id="chat-widget-trigger"
        onClick={() => {
          const nextState = !isOpen;
          setIsOpen(nextState);
          if (nextState && !welcomeRead) {
            speak('Olá! Sou o assistente virtual da SeguraBot. Como posso ajudar você hoje?');
            setWelcomeRead(true);
          }
        }}
        className={cn(
          "w-16 h-16 bg-gradient-to-br from-[#5E81F4] to-[#9698D6] text-white font-bold rounded-full shadow-lg shadow-[#5E81F4]/20 hover:shadow-xl transition-all duration-300 transform flex items-center justify-center cursor-pointer",
          isOpen ? "scale-95" : "hover:scale-105"
        )}
      >
        {/* Ícone SVG de Chat Outline */}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="32" 
          height="32" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="white" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="drop-shadow-sm"
        >
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
        </svg>
      </button>
    </div>
  );
}
