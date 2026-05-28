import { useState, useEffect, useRef } from 'react';
import { cn } from '../../utils/utils';
import { ProcessUserMessageUseCase } from '../../application/ProcessUserMessageUseCase';
import { FirebaseChatRepository } from '../../infrastructure/FirebaseChatRepository';
import { MemoryChatRepository } from '../../infrastructure/MemoryChatRepository';
import { DynamicAssistantService } from '../../infrastructure/DynamicAssistantService';
import { FirebaseKnowledgeBaseRepository } from '../../infrastructure/FirebaseKnowledgeBaseRepository';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { Message, Role } from '../../domain/Chat';
import { speakWithElevenLabs } from '../../infrastructure/ElevenLabsService';
import { speakWithPuter } from '../../infrastructure/PuterService';
import { Phone, Mic, SendHorizontal, Trash2, Check, User, Mail } from 'lucide-react';
import { loginDevAdmin, loginAnonymously } from '../../infrastructure/firebase';
import { trackAnalyticsEvent } from '../../utils/analytics';

// Instantiate repositories and services
const firebaseChatRepo = new FirebaseChatRepository();
const memoryChatRepo = new MemoryChatRepository();
const kbRepo = new FirebaseKnowledgeBaseRepository();
const customerRepo = new FirebaseCustomerRepository();
const aiService = new DynamicAssistantService(); // Handles dynamic AI models, provider selection and fallbacks

export function ChatWidget() {
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
  const [welcomeRead, setWelcomeRead] = useState(false);

  // Estados de Captação e Identificação de Leads
  const [step, setStep] = useState<'form' | 'chat'>('form');
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

  // Load visitor details from localStorage if they subscribed to a plan
  useEffect(() => {
    const handlePlanSubscribed = () => {
      const storedId = localStorage.getItem('segurabot_visitor_id');
      const storedName = localStorage.getItem('segurabot_visitor_name');
      const storedEmail = localStorage.getItem('segurabot_visitor_email');
      const storedPlan = localStorage.getItem('segurabot_visitor_plan');
      
      if (storedId && storedName && storedEmail) {
        setVisitorId(storedId);
        setLeadName(storedName);
        setLeadEmail(storedEmail);
        setVisitorPlan(storedPlan);
        setStep('chat');
        initializeChat(storedId, storedName);
        setIsOpen(true); // Abre o widget automaticamente após assinar
      }
    };

    // Executa no mount
    handlePlanSubscribed();

    // Escuta evento dinâmico
    window.addEventListener('segurabot_plan_subscribed', handlePlanSubscribed);
    return () => window.removeEventListener('segurabot_plan_subscribed', handlePlanSubscribed);
  }, []);

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

  const initializeChat = (newVisitorId: string, name: string) => {
    const activeRepo = newVisitorId === 'visitor' ? memoryChatRepo : firebaseChatRepo;
    activeRepo.updateSession(newVisitorId, {
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
    activeRepo.saveMessage(newVisitorId, sessionId, welcomeMessage);
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
    const msgsUnsub = firebaseChatRepo.listenToMessages(visitorId, sessionId, (data) => {
      if (data && data.length > 0) {
        setMessages(data);
      }
    }, (error) => {
      console.error("Erro ao escutar mensagens no widget:", error);
    });

    // Escutar status da sessão em tempo real para detectar quando o operador assume
    let sessionUnsub = () => {};
    if ('listenToSessions' in firebaseChatRepo) {
      sessionUnsub = firebaseChatRepo.listenToSessions(visitorId, (sessionsList) => {
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
  }, [step, visitorId, sessionId]);

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
    speechSynthesis.cancel();
    
    // Remove emojis
    const cleanText = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
    
    // Tenta usar o Puter primeiro (gratuito e ilimitado)
    const puterSuccess = await speakWithPuter(cleanText);
    if (puterSuccess) return;

    // Tenta usar ElevenLabs primeiro
    const elevenLabsSuccess = await speakWithElevenLabs(cleanText);
    if (elevenLabsSuccess) return; // Se funcionou, não faz o fallback
    
    // Fallback nativo
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.1; // Um pouco mais rápido
    
    // Tenta encontrar uma voz em português
    const voices = speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }
    
    speechSynthesis.speak(utterance);
  };

  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);

  const handleClientTyping = () => {
    if (visitorId === 'visitor' || !sessionId) return;
    
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      firebaseChatRepo.updateSession(visitorId, {
        id: sessionId,
        clientTyping: true
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      firebaseChatRepo.updateSession(visitorId, {
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
      firebaseChatRepo.updateSession(visitorId, {
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

    const activeRepo = visitorId === 'visitor' ? memoryChatRepo : firebaseChatRepo;

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
              <button className="text-white hover:text-blue-100 dark:hover:text-slate-300 transition-colors cursor-pointer" title="Ligar">
                <Phone size={16} />
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
                      <label className="text-[9px] font-bold text-[#8181A5] uppercase tracking-wider block mb-1">E-mail Corporativo</label>
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
