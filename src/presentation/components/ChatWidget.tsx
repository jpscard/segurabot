import { useState, useEffect, useRef } from 'react';
import { cn } from '../../utils/utils';
import { ProcessUserMessageUseCase } from '../../application/ProcessUserMessageUseCase';
import { MemoryChatRepository } from '../../infrastructure/MemoryChatRepository';
import { GeminiAssistantService } from '../../infrastructure/GeminiAssistantService';
import { FirebaseKnowledgeBaseRepository } from '../../infrastructure/FirebaseKnowledgeBaseRepository';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { Message, Role } from '../../domain/Chat';
import { speakWithElevenLabs } from '../../infrastructure/ElevenLabsService';
import { speakWithPuter } from '../../infrastructure/PuterService';
import { Phone, Mic, SendHorizontal, Trash2, Check } from 'lucide-react';

// Instantiate repositories and services
const chatRepo = new MemoryChatRepository();
const kbRepo = new FirebaseKnowledgeBaseRepository();
const customerRepo = new FirebaseCustomerRepository();
const aiService = new GeminiAssistantService(); // Default to Gemini for the widget

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

  // Initialize session on mount
  useEffect(() => {
    chatRepo.updateSession('visitor', {
      id: sessionId,
      userId: 'visitor',
      title: 'Conversa do Visitante',
      lastMessage: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      status: 'ia',
      operatorName: ''
    });
    // Add a welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      role: Role.MODEL,
      content: 'Olá! Sou o assistente virtual da SeguraBot. Como posso ajudar você hoje?',
      timestamp: new Date().toISOString()
    };
    setMessages([welcomeMessage]);
    chatRepo.saveMessage('visitor', sessionId, welcomeMessage);
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('openChatWidget', handleOpenChat);
    return () => window.removeEventListener('openChatWidget', handleOpenChat);
  }, []);

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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

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

    try {
      const useCase = new ProcessUserMessageUseCase(chatRepo, aiService, kbRepo, customerRepo);
      
      let chunkCount = 0;
      await useCase.execute('visitor', sessionId, userMessageContent, (chunk) => {
        chunkCount++;
        setStreamingText(prev => prev + chunk);
      });

      // After execution, the message should be in the repository
      const session = await chatRepo.getSession('visitor', sessionId);
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
        <div className="mb-4 w-80 md:w-96 h-[450px] bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="px-4 py-3 bg-[#5E81F4] dark:bg-slate-800 text-white flex justify-between items-center transition-colors duration-300">
            <div>
              <h3 className="font-bold text-sm">Atendimento SeguraBot</h3>
              <p className="text-xs text-blue-100 dark:text-slate-400">Online</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-white hover:text-blue-100 dark:hover:text-slate-300 transition-colors" title="Ligar">
                <Phone size={18} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-xs uppercase font-bold tracking-wider hover:text-blue-100 dark:hover:text-slate-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 dark:bg-slate-950">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[80%] p-3 rounded-lg text-sm transition-colors",
                  msg.role === Role.USER
                    ? "bg-blue-600 text-white ml-auto"
                    : "bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="flex flex-col gap-1">
                  <div>{msg.content}</div>
                  {msg.role !== Role.USER && (
                    <button
                      onClick={() => speak(msg.content)}
                      className="text-xs text-blue-600 dark:text-blue-400 self-start hover:underline mt-1"
                    >
                      Ouvir
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {/* Streaming Message */}
            {streamingText && (
              <div className="max-w-[80%] p-3 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700">
                {streamingText}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && !streamingText && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Pensando...
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            {isListening ? (
              <div className="flex-1 flex items-center gap-3 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-2xl">
                {/* Trash Icon on the Left */}
                <button 
                  onClick={() => {
                    recognitionRef.current?.stop();
                    setInput('');
                    baseTranscriptRef.current = '';
                  }}
                  className="text-slate-500 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                  title="Cancelar"
                >
                  <Trash2 size={18} />
                </button>

                {/* Timer */}
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                  {formatTime(recordingSeconds)}
                </div>

                {/* Text (Wrapping) */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                    {input || "Gravando..."}
                  </span>
                </div>

                {/* Check/Confirm Icon on the Right */}
                <button 
                  onClick={() => recognitionRef.current?.stop()}
                  className="text-blue-600 hover:text-blue-700 transition-colors p-1 flex-shrink-0"
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
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Digite sua dúvida..."
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  disabled={isLoading}
                />
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-full transition-colors flex items-center justify-center w-9 h-9"
                  title="Falar"
                >
                  <Mic size={18} />
                </button>
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="p-2 bg-slate-900 dark:bg-blue-600 text-white rounded-full hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-9 h-9"
                  title="Enviar"
                >
                  <SendHorizontal size={18} />
                </button>
              </>
            )}
          </div>
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
          "w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform flex items-center justify-center",
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
