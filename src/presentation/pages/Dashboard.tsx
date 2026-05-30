import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { auth, handleFirestoreError, logout } from '../../infrastructure/firebase';
import { ChatSession, Message, Role, OperationType, CustomerProfile } from '../../domain';
import { cn } from '../../utils/utils';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { uploadRealDataToKnowledgeBase } from '../../utils/seedKnowledgeBase';
import { uploadRealCrmData } from '../../utils/seedCrmData';
import { CrmAdmin } from './CrmAdmin';
import { ProductTour, TourStep } from '../components/ProductTour';
import { 
  MessageSquare, 
  Database, 
  LogOut, 
  Sun, 
  Moon, 
  Plus, 
  Trash2, 
  Send, 
  Cpu, 
  Cloud, 
  User, 
  Activity, 
  FileText,
  Sliders,
  Settings,
  Shield,
  Layers,
  ArrowUp,
  Mic,
  Check
} from 'lucide-react';
import { speakWithElevenLabs } from '../../infrastructure/ElevenLabsService';
import { audioManager } from '../../utils/audioManager';

const chatRepo = new FirebaseChatRepository();
const kbRepo = new FirebaseKnowledgeBaseRepository();
const customerRepo = new FirebaseCustomerRepository();
const geminiService = new GeminiAssistantService();
const ollamaService = new OllamaAssistantService();

// Clean Architecture Imports
import { FirebaseChatRepository } from '../../infrastructure/FirebaseChatRepository';
import { FirebaseKnowledgeBaseRepository } from '../../infrastructure/FirebaseKnowledgeBaseRepository';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { GeminiAssistantService } from '../../infrastructure/GeminiAssistantService';
import { OllamaAssistantService } from '../../infrastructure/OllamaAssistantService';
import { DynamicAssistantService } from '../../infrastructure/DynamicAssistantService';
import { ProcessUserMessageUseCase } from '../../application/ProcessUserMessageUseCase';

export function Dashboard() {
  const [currentView, setCurrentView] = useState<'chat' | 'crm'>('chat');
  const [crmTab, setCrmTab] = useState<'dados' | 'chamados' | 'chat' | 'rag' | 'analytics' | 'ajustes_ia'>('dados');
  const [tourActive, setTourActive] = useState(false);

  const getTourSteps = (): TourStep[] => {
    if (currentRole === 'admin') {
      return [
        {
          targetId: 'crm-sidebar-sessions',
          title: 'Fila de Atendimento Geral',
          content: 'Monitore toda a operação ativa de atendimentos por IA e humanos do SeguraBot.',
          position: 'right'
        },
        {
          targetId: 'crm-menu-ajustes_ia',
          title: 'Configurações de IA & Voz',
          content: 'Troque o cérebro da IA (Gemini ou local Ollama), configure chaves da ElevenLabs e ajuste a central de áudio/voz.',
          position: 'right'
        },
        {
          targetId: 'crm-menu-rag',
          title: 'Treinamento & Ingestão RAG',
          content: 'Carregue novos datasets, FAQs em JSON/CSV e apólices em PDF para treinar a IA sem alucinar.',
          position: 'right'
        },
        {
          targetId: 'crm-menu-analytics',
          title: 'Métricas Operacionais',
          content: 'Monitore a taxa de conversão, NPS, tempo médio de atendimento e performance do time em tempo real.',
          position: 'right'
        }
      ];
    } else if (currentRole === 'atendente') {
      return [
        {
          targetId: 'crm-sidebar-sessions',
          title: 'Fila de Atendimento',
          content: 'Aqui você acompanha todos os atendimentos ativos. Filtre entre chats da IA, aguardando humana ou concluídos.',
          position: 'right'
        },
        {
          targetId: 'crm-chat-history',
          title: 'Histórico Central',
          content: 'Leia o histórico completo do bot e clique em "Assumir" para iniciar o bate-papo humano em tempo real.',
          position: 'left'
        },
        {
          targetId: 'crm-customer-profile',
          title: 'Dossiê do Cliente',
          content: 'Visualize o perfil do segurado, chamados abertos e o resumo preditivo de risco gerado pela IA do Gemini.',
          position: 'left'
        },
        {
          targetId: 'crm-menu-chamados',
          title: 'Gestão de Tickets',
          content: 'Gerencie chamados, altere os status na fila e preencha as resoluções técnicas oficiais de forma simples.',
          position: 'right'
        }
      ];
    } else {
      // Cliente/Segurado
      return [
        {
          targetId: 'crm-menu-dados',
          title: 'Dados do Segurado',
          content: 'Acesse e gerencie seus dados cadastrais, CPF, e-mail e apólices contratadas de forma segura.',
          position: 'right'
        },
        {
          targetId: 'crm-menu-chamados',
          title: 'Meus Chamados de Suporte',
          content: 'Abra um novo chamado técnico ou acompanhe o status e a resolução dos seus tickets pendentes em tempo real.',
          position: 'right'
        },
        {
          targetId: 'crm-menu-chat',
          title: 'Fale com o Atendimento',
          content: 'Inicie um bate-papo em tempo real com nossa IA ou solicite transferência direta para um atendente humano.',
          position: 'right'
        }
      ];
    }
  };
  const [clientSubView, setClientSubView] = useState<'chat' | 'seguros'>('chat');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileActiveSubView, setMobileActiveSubView] = useState<'list' | 'content'>('list');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  // Voice & Speech Synthesis States
  const [isListening, setIsListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const baseTranscriptRef = useRef('');
  
  const { 
    provider, 
    setProvider, 
    geminiApiKey, 
    setGeminiApiKey, 
    ollamaModel, 
    setOllamaModel, 
    ollamaBaseUrl,
    ttsProvider,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    ttsVoiceKeyword
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const user = auth.currentUser;

  // Estados para simulação de fila de atendimento humano
  const [queuePosition, setQueuePosition] = useState(3);
  const [queueTime, setQueueTime] = useState(4);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'aguardando_humano') {
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
            if (user && activeSession) {
              try {
                const updatedSession = {
                  ...activeSession,
                  status: 'humano' as const,
                  operatorName: 'Leonardo Alves Pereira'
                };
                await chatRepo.updateSession(user.uid, updatedSession);
                setActiveSession(updatedSession);
                
                const systemMsg: Message = {
                  id: `sys-${Date.now()}`,
                  role: Role.MODEL,
                  content: `O operador Leonardo Alves Pereira entrou na conversa. Como posso te ajudar em detalhes hoje?`,
                  timestamp: new Date().toISOString()
                };
                await chatRepo.saveMessage(user.uid, activeSession.id, systemMsg);
                setMessages(prev => [...prev, systemMsg]);
                
                // Helper de voz se existir speak no escopo
                if (typeof speak === 'function') {
                  speak(systemMsg.content);
                } else {
                  speechSynthesis.speak(new SpeechSynthesisUtterance(systemMsg.content));
                }
              } catch (err) {
                console.error("Error simulating operator handoff acceptance in dashboard:", err);
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
  }, [activeSession, user]);

  // Estados para modelos do Ollama
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);

  // Lógica Real de Roles
  const isRealAdmin = (user?.email?.endsWith('@segurabot.com.br') && user?.email !== 'atendente@segurabot.com.br') || user?.email === 'admin@segurabot.com.br' || profile?.role === 'admin';
  const isRealAtendente = user?.email === 'atendente@segurabot.com.br' || profile?.role === 'atendente';
  
  // Role Atual baseada no perfil real do banco de dados (Firestore)
  const currentRole = isRealAdmin ? 'admin' : (isRealAtendente ? 'atendente' : 'cliente');

  const fetchOllamaModels = async () => {
    try {
      const headers: Record<string, string> = {};
      if (ollamaBaseUrl && ollamaBaseUrl.includes('.loca.lt')) {
        headers['bypass-tunnel-reminder'] = 'true';
      }
      const response = await fetch(`${ollamaBaseUrl}/api/tags`, { headers });
      if (!response.ok) {
        throw new Error('Erro ao buscar tags do Ollama');
      }
      const data = await response.json();
      if (data && Array.isArray(data.models)) {
        const names = data.models.map((m: any) => m.name);
        setAvailableModels(names);
        setOllamaOnline(names.length > 0);
        
        // Se o modelo atual não está na lista e a lista não for vazia, atualiza para o primeiro
        if (names.length > 0 && !names.includes(ollamaModel)) {
          setOllamaModel(names[0]);
        }
      } else {
        setOllamaOnline(false);
      }
    } catch (error) {
      console.warn("Ollama is not running or not accessible:", error);
      setOllamaOnline(false);
    }
  };

  // Buscar modelos do Ollama se o provedor for local
  useEffect(() => {
    if (provider === 'ollama') {
      fetchOllamaModels();
    }
  }, [provider, ollamaBaseUrl]);

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
    if (document.visibilityState !== 'visible') {
      console.log('Aba não visível, silenciando áudio.');
      return;
    }

    audioManager.stopActiveAudio();
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
      utterance.rate = 1.05; // Ajuste suave de velocidade
      
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

  // Load Customer Profile
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const unsubscribe = customerRepo.subscribeToCustomerProfile(user.uid, (data) => {
      setProfile(data);

      if (!data) {
        if (user.email === 'admin@segurabot.com.br') {
          customerRepo.saveCustomerProfile(user.uid, {
            userId: user.uid,
            email: user.email,
            name: 'Administrador SeguraBot',
            phone: '',
            activePolicies: [],
            policies: [],
            claims: [],
            documents: [],
            loyaltyTier: 'Padrão',
            lifeStage: '',
            riskScore: 0,
            aiSummary: 'Administrador do sistema SeguraBot.',
            role: 'admin'
          }).catch(err => console.error("Erro ao criar perfil admin inicial:", err));
        } else if (user.email === 'atendente@segurabot.com.br') {
          customerRepo.saveCustomerProfile(user.uid, {
            userId: user.uid,
            email: user.email,
            name: 'Atendente SeguraBot',
            phone: '',
            activePolicies: [],
            policies: [],
            claims: [],
            documents: [],
            loyaltyTier: 'Padrão',
            lifeStage: '',
            riskScore: 0,
            aiSummary: 'Operador de suporte e atendente da SeguraBot.',
            role: 'atendente'
          }).catch(err => console.error("Erro ao criar perfil atendente inicial:", err));
        }
      } else {
        if (user.email === 'admin@segurabot.com.br' && data.role !== 'admin') {
          customerRepo.saveCustomerProfile(user.uid, {
            ...data,
            role: 'admin',
            name: 'Administrador SeguraBot'
          }).catch(err => console.error("Erro ao sincronizar papel de admin:", err));
        } else if (user.email === 'atendente@segurabot.com.br' && data.role !== 'atendente') {
          customerRepo.saveCustomerProfile(user.uid, {
            ...data,
            role: 'atendente',
            name: 'Atendente SeguraBot'
          }).catch(err => console.error("Erro ao sincronizar papel de atendente:", err));
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Redirect 'cliente' away from 'crm' view if selected
  useEffect(() => {
    if (currentRole === 'cliente' && currentView === 'crm') {
      setCurrentView('chat');
    }
  }, [currentRole, currentView]);

  // Reset mobile sub-view when global view changes
  useEffect(() => {
    setMobileActiveSubView('list');
  }, [currentView]);

  // Load Sessions
  useEffect(() => {
    if (!user) return;

    const unsubscribe = chatRepo.listenToSessions(user.uid, (docs) => {
      setSessions(docs);
    }, (error) => {
      handleFirestoreError(error as Error, OperationType.LIST, `users/${user.uid}/chat_sessions`);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Messages for active session
  useEffect(() => {
    if (!user || !activeSession) {
      setMessages([]);
      return;
    }

    const unsubscribe = chatRepo.listenToMessages(user.uid, activeSession.id, (msgs) => {
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error as Error, OperationType.LIST, `users/${user.uid}/chat_sessions/${activeSession.id}/messages`);
    });

    return () => unsubscribe();
  }, [user, activeSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const createNewSession = async () => {
    if (!user) return;
    try {
      const session = await chatRepo.createSession(user.uid, 'Nova Conversa', '');
      setActiveSession(session);
      setMobileActiveSubView('content');
    } catch (error) {
      handleFirestoreError(error as Error, OperationType.CREATE, `users/${user.uid}/chat_sessions`);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await chatRepo.deleteSession(user.uid, id);
      if (activeSession?.id === id) setActiveSession(null);
    } catch (error) {
      handleFirestoreError(error as Error, OperationType.DELETE, `users/${user.uid}/chat_sessions/${id}`);
    }
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
      const isUser = msg.role === Role.USER;
      const senderName = isUser 
        ? (profile?.name || 'Cliente Autenticado') 
        : (activeSession?.status === 'humano' ? (activeSession.operatorName || 'Atendente Humano') : 'SeguraBot IA');
        
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
        <title>SeguraBot_Relatorio_${(profile?.name || 'Cliente').replace(/\s+/g, '_')}</title>
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
            <p><strong>Segurado:</strong> ${profile?.name || 'Cliente Autenticado'}</p>
            <p><strong>E-mail:</strong> ${profile?.email || '-'}</p>
            <p><strong>Plano Contratado:</strong> ${profile?.loyaltyTier || 'Demonstração (Sem Contrato)'}</p>
            <p><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        
        <div class="chat-title">Registro Oficial de Atendimento - Área do Cliente</div>
        
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

  const handleTrainBotClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTraining(true);
    try {
      const count = await uploadRealDataToKnowledgeBase(file);
      alert(`Treinamento concluído com sucesso! ${count} registros reais foram injetados no banco.`);
    } catch (error: any) {
      alert(`Erro ao fazer upload dos dados: ${error.message}`);
    } finally {
      setIsTraining(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    let targetSession = activeSession;
    
    if (!targetSession) {
      try {
        const title = input.slice(0, 30) + '...';
        targetSession = await chatRepo.createSession(user.uid, title, input);
        setActiveSession(targetSession);
      } catch (error) {
        handleFirestoreError(error as Error, OperationType.CREATE, `users/${user.uid}/chat_sessions`);
        return;
      }
    }

    const userMessageContent = input;
    setInput('');
    setIsLoading(true);

    try {
      const aiService = new DynamicAssistantService();
      const useCase = new ProcessUserMessageUseCase(chatRepo, aiService, kbRepo, customerRepo);

      await useCase.execute(user.uid, targetSession.id, userMessageContent, (chunk) => {
        setStreamingText(prev => prev + chunk);
      });

      setStreamingText('');
      setIsLoading(false);

      // Speak the last assistant message
      const session = await chatRepo.getSession(user.uid, targetSession.id);
      if (session && session.messages) {
        const lastMessage = session.messages[session.messages.length - 1];
        if (lastMessage && (lastMessage.role as string) === 'model') {
          speak(lastMessage.content);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
    }
  };

  const renderMeusSegurosView = () => {
    return (
      <div className="flex-grow flex-1 flex flex-col bg-[#F6F6F6]/80 dark:bg-slate-950/20 overflow-y-auto p-6 md:p-8 space-y-8 select-none scrollbar-thin">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#ECECF2] dark:border-slate-800/60 shrink-0">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Meus Seguros e Coberturas
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Consulte suas apólices ativas, limites de cobertura e acompanhe seus sinistros.
            </p>
          </div>
          
          <span className={cn(
            "self-start md:self-center px-4 py-2 text-[10px] font-bold rounded-xl uppercase tracking-widest border",
            profile?.loyaltyTier === 'Silver' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/50 dark:border-slate-700' :
            profile?.loyaltyTier === 'Gold' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-400 dark:border-transparent' :
            profile?.loyaltyTier === 'Black' ? 'bg-slate-950 text-white border-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800' :
            'bg-blue-500/10 text-[#5E81F4] border-[#5E81F4]/20'
          )}>
            Status {profile?.loyaltyTier || 'Padrão'}
          </span>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Col 1: Customer Profile Overview Card */}
          <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800/80 rounded-2xl p-6 space-y-6 shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Segurado</p>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 truncate">{profile?.name || 'Cliente Segura'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-1 truncate">{profile?.email || user?.email}</p>
              {profile?.phone && <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5 truncate">Tel: {profile.phone}</p>}
            </div>

            <div className="border-t border-[#ECECF2] dark:border-slate-850 pt-4 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Momento de Vida</p>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-350">{profile?.lifeStage || 'Não especificado'}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Score de Risco</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        (profile?.riskScore || 0) > 60 ? 'bg-rose-500' :
                        (profile?.riskScore || 0) > 30 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      )}
                      style={{ width: `${profile?.riskScore || 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{profile?.riskScore || 0}%</span>
                </div>
              </div>

              {profile?.aiSummary && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Insights de IA</p>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 italic font-medium bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                    {profile.aiSummary}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Active Policies List */}
          <div className="xl:col-span-8 space-y-6">
            
            {/* Apólices Card */}
            <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Apólices e Coberturas Ativas
              </h3>
              
              <div className="space-y-4">
                {profile?.policies && profile.policies.length > 0 ? (
                  profile.policies.map((policy) => (
                    <div 
                      key={policy.id} 
                      className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-[#ECECF2]/60 dark:border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="space-y-1">
                        <span className="inline-block px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-[#5E81F4] rounded-md">
                          Seguro {policy.type}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-255 mt-1.5">
                          {policy.assetDescription || 'Descrição não informada'}
                        </h4>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
                          Apólice: #{policy.id}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-right">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cobertura</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300">{policy.coverageLimits}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Prêmio Mensal</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300">R$ {policy.premiumValue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vigência até</p>
                          <p className="font-bold text-slate-700 dark:text-slate-350">{policy.expirationDate}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-[#ECECF2] dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-500 font-medium">Você ainda não tem apólices cadastradas.</p>
                    <button 
                      onClick={() => setClientSubView('chat')}
                      className="mt-3 px-4 py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Simular Seguro
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sinistros Card */}
            <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Sinistros e Reclamações
              </h3>

              <div className="space-y-3.5">
                {profile?.claims && profile.claims.length > 0 ? (
                  profile.claims.map((claim) => (
                    <div 
                      key={claim.id} 
                      className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-[#ECECF2]/60 dark:border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-250 truncate max-w-md">
                          {claim.description}
                        </h4>
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
                          Código Sinistro: #{claim.id} | Aberto em: {claim.openedAt}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 sm:text-right shrink-0">
                        <span className={cn(
                          "px-2.5 py-1 text-[9px] font-bold rounded uppercase tracking-wider border",
                          claim.status === 'pago' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                          claim.status === 'recusado' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                          claim.status === 'em_analise' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                          'bg-blue-500/10 text-[#5E81F4] border-[#5E81F4]/20'
                        )}>
                          {claim.status === 'pago' ? 'Pago' :
                           claim.status === 'recusado' ? 'Recusado' :
                           claim.status === 'em_analise' ? 'Em Análise' :
                           'Aberto'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-[#ECECF2] dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-500 font-medium">Nenhum sinistro em andamento ou registrado.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    );
  };

  // Listen to openMobileMenu events from sub-components
  useEffect(() => {
    const openMenu = () => setIsMobileMenuOpen(true);
    window.addEventListener('openMobileMenu', openMenu);
    return () => window.removeEventListener('openMobileMenu', openMenu);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F6F6F6] dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 font-sans">
      
      {/* COLUNA 1: Slim Navigation Sidebar (Figma Dashboard 02) */}
      <aside className="hidden lg:flex w-[76px] bg-white dark:bg-slate-950 flex-col items-center justify-between py-6 border-r border-[#ECECF2] dark:border-slate-800/30 z-20 shrink-0 select-none">
        
        {/* Brand Circle Logo */}
        <div className="flex flex-col items-center gap-6 w-full">
          <img 
            src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} 
            alt="SeguraBot Logo" 
            className="w-16 h-16 object-contain" 
          />
          
          <div className="w-8 h-[1px] bg-slate-200 dark:bg-slate-800/30" />
          
          {/* Main Navigation Views */}
          <nav className="flex flex-col gap-4 w-full px-2">
            
            {/* Chat View Button */}
            <div className="relative group flex justify-center w-full">
              {currentView === 'chat' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-[#5E81F4] rounded-r-lg" />
              )}
              <button 
                onClick={() => setCurrentView('chat')}
                className={cn(
                  "p-3 rounded-xl transition-all duration-200 outline-none cursor-pointer",
                  currentView === 'chat' 
                    ? "bg-slate-100 dark:bg-slate-900 text-[#5E81F4]" 
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                )}
                title="Assistente Virtual"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>

            {/* CRM View Button (Somente para Administradores e Atendentes) */}
            {(currentRole === 'admin' || currentRole === 'atendente') && (
              <div className="relative group flex justify-center w-full">
                {currentView === 'crm' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-[#5E81F4] rounded-r-lg" />
                )}
                <button 
                  onClick={() => setCurrentView('crm')}
                  className={cn(
                    "p-3 rounded-xl transition-all duration-200 outline-none cursor-pointer",
                    currentView === 'crm' 
                      ? "bg-slate-100 dark:bg-slate-900 text-[#5E81F4]" 
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                  )}
                  title="Gestão CRM"
                >
                  <Database className="w-5 h-5" />
                </button>
              </div>
            )}
            
          </nav>
        </div>

        {/* Global System Settings */}
        <div className="flex flex-col items-center gap-5 w-full px-2">
          
          {/* Theme Toggle Button */}
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-3 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/40 rounded-xl transition-all cursor-pointer"
            title={theme === 'dark' ? "Modo Claro" : "Modo Escuro"}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Cloud/Local Provider Toggle Button */}
          {(currentRole === 'admin' || currentRole === 'atendente') && (
            <>
              <button 
                onClick={() => setProvider(provider === 'gemini' ? 'ollama' : 'gemini')}
                className={cn(
                  "p-3 rounded-xl transition-all duration-200 cursor-pointer",
                  provider === 'gemini' 
                    ? "text-[#5E81F4] hover:text-[#5E81F4]/80" 
                    : "text-[#F4BE5E] hover:text-[#F4BE5E]/80 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                )}
                title={provider === 'gemini' ? "Usando Nuvem (Gemini)" : "Usando Local (Ollama)"}
              >
                {provider === 'gemini' ? <Cloud className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </button>

              <div className="w-8 h-[1px] bg-slate-200 dark:bg-slate-800/30" />
            </>
          )}

          {/* LogOut Button */}
          <button 
            onClick={logout}
            className="p-3 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all cursor-pointer"
            title="Sair da Conta"
          >
            <LogOut className="w-5 h-5" />
          </button>

        </div>
      </aside>

      {/* COLUNA 2: Context Sidebar / List & Config Panel */}
      <aside className={cn(
        "bg-white dark:bg-slate-900 border-r border-[#ECECF2] dark:border-slate-800/60 flex flex-col shrink-0 z-10 select-none transition-all duration-300",
        mobileActiveSubView === 'list' ? "w-full flex lg:w-80" : "hidden lg:flex lg:w-80"
      )}>
        
        {/* Mobile Sticky Top Navigation Bar inside Sidebar */}
        <div className="lg:hidden h-14 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-5 select-none z-10 shrink-0">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="text-xs font-bold text-[#5E81F4] uppercase tracking-wider cursor-pointer"
          >
            Menu
          </button>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            {currentView === 'chat' ? 'Atendimentos' : 'Painel CRM'}
          </span>
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
            {(profile?.name || user?.displayName || 'U').slice(0, 1).toUpperCase()}
          </div>
        </div>
        
        {/* User Info Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800" />
            ) : (
              <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center font-bold text-sm border border-blue-100 dark:border-blue-900/20">
                {(profile?.name || user?.displayName || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{profile?.name || user?.displayName || 'Cliente Segura'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7CE7AC] animate-pulse" />
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                  {currentRole === 'admin' ? 'Administrador' : currentRole === 'atendente' ? 'Atendente' : 'Cliente'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Quick Guide Tour Trigger */}
          <button
            onClick={() => setTourActive(true)}
            className="px-2.5 py-1.5 border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6] dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg transition-all cursor-pointer shadow-sm uppercase tracking-wider"
          >
            Tour
          </button>
        </div>

        {/* View Specific Sidebar Controls */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentView === 'chat' ? (
            <>
              {/* Chat Session Initial Action */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800/60">
                <button 
                  onClick={createNewSession}
                  className="w-full py-3 px-4 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-xl transition-all duration-200 shadow-sm shadow-[#5E81F4]/15 flex items-center justify-center gap-2 font-semibold text-sm outline-none cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Atendimento</span>
                </button>
              </div>

              {currentRole === 'cliente' && (
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/60 flex gap-2 shrink-0 select-none">
                  <button
                    onClick={() => setClientSubView('chat')}
                    className={cn(
                      "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all duration-200 uppercase tracking-wider cursor-pointer border",
                      clientSubView === 'chat'
                        ? "bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/40 text-slate-655 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Conversas
                  </button>
                  <button
                    onClick={() => setClientSubView('seguros')}
                    className={cn(
                      "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all duration-200 uppercase tracking-wider cursor-pointer border",
                      clientSubView === 'seguros'
                        ? "bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/40 text-slate-655 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Meus Seguros
                  </button>
                </div>
              )}

              {/* Chat History List */}
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-thin">
                <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">CONVERSAS RECENTES</p>
                
                {sessions.map((session) => (
                  <div 
                    key={session.id}
                    onClick={() => { setActiveSession(session); setMobileActiveSubView('content'); }}
                    className={cn(
                      "p-3 rounded-xl cursor-pointer transition-all border group relative select-none",
                      activeSession?.id === session.id 
                        ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800" 
                        : "border-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors shrink-0",
                        activeSession?.id === session.id 
                          ? "bg-[#5E81F4]/10 dark:bg-[#5E81F4]/10 text-[#5E81F4]" 
                          : "bg-slate-100 dark:bg-slate-800 text-[#8181A5]"
                      )}>
                        CH
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <p className={cn("text-xs font-semibold truncate transition-colors", activeSession?.id === session.id ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300")}>{session.title}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{session.lastMessage || 'Conversa sem histórico'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => deleteSession(e, session.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Excluir Chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {sessions.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-xs text-slate-400 dark:text-slate-600 font-semibold tracking-wider">SEM HISTÓRICOS</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  Menu de Gestão (CRM)
                </p>
                <div className="space-y-1.5">
                  {(() => {
                    const allTabs = [
                      { id: 'dados', label: 'Dados do Segurado', icon: User },
                      { id: 'chamados', label: 'Chamados de Suporte', icon: Sliders },
                      { id: 'chat', label: 'Chat em Tempo Real', icon: MessageSquare },
                      { id: 'rag', label: 'Base de Conhecimento', icon: Database },
                      { id: 'analytics', label: 'Web Analytics', icon: Activity },
                      { id: 'ajustes_ia', label: 'Ajustes IA', icon: Settings }
                    ];
                    return allTabs.filter(tab => {
                      if (currentRole === 'atendente') {
                        // Atendente não possui acesso à Base RAG e Ajustes de IA
                        return tab.id !== 'rag' && tab.id !== 'ajustes_ia';
                      }
                      return true;
                    });
                  })().map((tab) => {
                    const IconComponent = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        id={`crm-menu-${tab.id}`}
                        onClick={() => { setCrmTab(tab.id as any); setMobileActiveSubView('content'); }}
                        className={cn(
                          "w-full text-left py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 uppercase tracking-wider cursor-pointer border border-transparent flex items-center gap-2.5",
                          crmTab === tab.id
                            ? "bg-[#5E81F4] text-white shadow-sm shadow-[#5E81F4]/10"
                            : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        <IconComponent className="w-4 h-4 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Render dynamic info cards based on active CRM tab to make it look premium */}
              {crmTab === 'dados' && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 animate-fadeIn">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Resumo do Cliente</p>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500 font-semibold">Apólices Ativas</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {profile?.policies?.length === 1 
                        ? '1 Cobertura' 
                        : `${profile?.policies?.length ?? 0} Coberturas`}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500 font-semibold">Sinistros Reportados</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {(() => {
                        const count = profile?.claims?.filter(c => c.status !== 'pago' && c.status !== 'recusado').length ?? 0;
                        return count === 1 ? '1 Em Análise' : `${count} Em Análise`;
                      })()}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500 font-semibold">Categoria de Fidelidade</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">
                      Status {profile?.loyaltyTier || 'Padrão'}
                    </p>
                  </div>
                </div>
              )}

              {/* Botão de Treinamento RAG - Apenas para Admin no menu RAG */}
              {crmTab === 'rag' && currentRole === 'admin' && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 animate-fadeIn">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ações Rápidas (RAG)</p>
                  <button 
                    onClick={handleTrainBotClick}
                    disabled={isTraining}
                    className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isTraining ? 'Processando...' : 'Treinar Base de Conhecimento'}</span>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".csv,.json,.pdf" 
                    className="hidden" 
                  />
                </div>
              )}
            </div>
          )}
        </div>



      </aside>

      {/* COLUNA 3: Main Display / Working Workspace */}
      <main className={cn(
        "flex-grow flex-1 flex flex-col bg-[#F6F6F6]/80 dark:bg-slate-950/20 overflow-hidden relative transition-all duration-300",
        mobileActiveSubView === 'content' ? "w-full flex" : "hidden lg:flex"
      )}>
        
        {currentView === 'crm' ? (
          <CrmAdmin 
            activeTab={crmTab} 
            setActiveTab={setCrmTab} 
            currentRole={currentRole} 
            onBack={() => setMobileActiveSubView('list')} 
          />
        ) : clientSubView === 'seguros' && currentRole === 'cliente' ? (
          renderMeusSegurosView()
        ) : (
          <>
            {/* Active Session Title Header */}
            <div className="h-16 px-6 border-b border-[#ECECF2] dark:border-slate-800/60 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 select-none z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setMobileActiveSubView('list')}
                  className="lg:hidden p-2 -ml-2 text-[#5E81F4] hover:text-[#5E81F4]/80 font-bold text-xs uppercase tracking-wider cursor-pointer shrink-0"
                >
                  Voltar
                </button>
                <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#5E81F4]/10 dark:bg-[#5E81F4]/10 flex items-center justify-center text-[#5E81F4] shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {activeSession ? activeSession.title : 'Novo Atendimento'}
                  </h1>
                </div>
              </div>
              
              {/* Provider Badge Status */}
              <div className="flex items-center gap-2">
                {activeSession && messages.length > 0 && (
                  <button
                    onClick={exportChatAsPDF}
                    className="px-3 py-1.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                    title="Exportar PDF do Atendimento"
                  >
                    Exportar PDF
                  </button>
                )}
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-1.5 border border-slate-200/40 dark:border-transparent">
                  <span className={cn("w-1.5 h-1.5 rounded-full", provider === 'gemini' ? "bg-[#5E81F4]" : "bg-[#F4BE5E]")} />
                  <span>{provider === 'gemini' ? 'Gemini Pro Cloud' : 'Ollama Local'}</span>
                </span>
              </div>
            </div>

            {/* Handoff Status Banners */}
            {activeSession && activeSession.status === 'aguardando_humano' && (
              <div className="bg-amber-50 dark:bg-amber-950/20 px-6 py-3 border-b border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-xs flex justify-between items-center transition-all select-none shrink-0">
                <span className="font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Fila de suporte: <strong>{queuePosition}º lugar</strong> (Tempo estimado: ~{queueTime} min)</span>
                </span>
                <button 
                  onClick={async () => {
                    const updated = { ...activeSession, status: 'ia' as const, operatorName: '' };
                    try {
                      await chatRepo.updateSession(user!.uid, updated);
                      setActiveSession(updated);
                    } catch (e) {
                      console.error("Erro ao retornar para IA:", e);
                    }
                  }}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] uppercase font-bold tracking-wider transition-colors cursor-pointer"
                >
                  Voltar para Assistente Virtual
                </button>
              </div>
            )}

            {activeSession && activeSession.status === 'humano' && (
              <div className="bg-indigo-50 dark:bg-indigo-950/20 px-6 py-3 border-b border-indigo-100 dark:border-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-xs flex justify-between items-center transition-all select-none shrink-0">
                <span className="font-medium">
                  Você está em atendimento com o corretor: {activeSession.operatorName || 'Leonardo Alves Pereira'}
                </span>
                <button 
                  onClick={async () => {
                    const updated = { ...activeSession, status: 'ia' as const, operatorName: '' };
                    try {
                      await chatRepo.updateSession(user!.uid, updated);
                      setActiveSession(updated);
                    } catch (e) {
                      console.error("Erro ao retornar para IA:", e);
                    }
                  }}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] uppercase font-bold tracking-wider transition-colors cursor-pointer"
                >
                  Devolver para IA
                </button>
              </div>
            )}

            {/* Conversation Flow Display */}
            {!activeSession && messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 overflow-y-auto">
                <div className="w-20 h-20 bg-blue-500/10 dark:bg-blue-400/5 rounded-[28px] flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm border border-blue-500/10 shrink-0">
                  <Shield className="w-10 h-10" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white transition-colors">Olá! Como posso ajudar hoje?</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Sou o assistente inteligente da SeguraBot. Posso analisar apólices, processar sinistros ou responder dúvidas sobre franquias e coberturas.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full pt-4">
                   {[
                     "Quais coberturas tenho no plano básico?",
                     "Como faço para acionar o seguro?",
                     "Posso parcelar meu pagamento?",
                     "Quero cancelar minha apólice."
                   ].map(q => (
                     <button 
                      key={q}
                      onClick={() => {
                        setInput(q);
                      }}
                      className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 hover:border-blue-500/40 dark:hover:border-blue-500/30 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:shadow-sm text-left transition-all duration-200"
                     >
                      {q}
                     </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 space-y-6 scrollbar-thin">
                {messages.map((msg, i) => (
                  <div 
                    key={msg.id || i}
                    className={cn(
                      "flex gap-4 max-w-3xl",
                      msg.role === Role.USER ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-xs shadow-sm transition-colors",
                      msg.role === Role.USER 
                        ? "bg-slate-900 dark:bg-slate-800 text-white" 
                        : msg.senderName 
                          ? "bg-indigo-600 text-white"
                          : "bg-[#5E81F4] text-white"
                    )}>
                      {msg.role === Role.USER ? "U" : msg.senderName ? "A" : "B"}
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-xs leading-relaxed shadow-sm transition-colors flex flex-col gap-2",
                      msg.role === Role.USER 
                        ? "bg-slate-800 text-white rounded-tr-none" 
                        : "bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-none prose prose-slate dark:prose-invert prose-xs max-w-none"
                    )}>
                      {msg.senderName && msg.role !== Role.USER && (
                        <div className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          Corretor: {msg.senderName}
                        </div>
                      )}
                      <div className="flex-1">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                      {msg.role !== Role.USER && (
                        <button
                          onClick={() => speak(msg.content)}
                          className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline mt-1 self-start cursor-pointer select-none"
                        >
                          Ouvir resposta
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {streamingText && (
                  <div className="flex gap-4 max-w-3xl mr-auto">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 bg-blue-600 text-white flex items-center justify-center shadow-sm font-bold text-xs">
                      B
                    </div>
                    <div className="p-4 rounded-2xl text-xs leading-relaxed shadow-sm bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-none prose prose-slate dark:prose-invert prose-xs max-w-none">
                      <Markdown>{streamingText}</Markdown>
                      <span className="inline-block w-1 h-3.5 bg-blue-500 ml-1 animate-pulse" />
                    </div>
                  </div>
                )}
                
                {isLoading && !streamingText && (
                  <div className="flex gap-4 max-w-3xl mr-auto">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 bg-blue-600 text-white flex items-center justify-center shadow-sm font-bold text-xs">
                      B
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 p-4 rounded-2xl flex items-center gap-2.5">
                      <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold">Analisando apólices...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Pinned Bottom Chat Input Bar */}
            <div className="p-4 border-t border-[#ECECF2] dark:border-slate-800/60 bg-white dark:bg-slate-900 sticky bottom-0 shrink-0">
              <div className="max-w-3xl mx-auto">
                {isListening ? (
                  <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 px-3 py-2 rounded-2xl transition-all">
                    {/* Trash Icon on the Left */}
                    <button 
                      type="button"
                      onClick={() => {
                        recognitionRef.current?.stop();
                        setInput('');
                        baseTranscriptRef.current = '';
                      }}
                      className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 flex-shrink-0 cursor-pointer"
                      title="Cancelar gravação"
                    >
                      <Trash2 size={16} />
                    </button>

                    {/* Timer */}
                    <div className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 flex-shrink-0 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      {formatTime(recordingSeconds)}
                    </div>

                    {/* Text (Wrapping) */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                        {input || "Gravando voz..."}
                      </span>
                    </div>

                    {/* Check/Confirm Icon on the Right */}
                    <button 
                      type="button"
                      onClick={() => recognitionRef.current?.stop()}
                      className="text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors p-1.5 flex-shrink-0 cursor-pointer"
                      title="Confirmar texto gravado"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <form 
                    onSubmit={sendMessage}
                    className="flex gap-2 items-center bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 focus-within:border-blue-500/80 dark:focus-within:border-blue-500/60 transition-all duration-200"
                  >
                    <input 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Escreva sua mensagem..."
                      className="flex-1 bg-transparent px-4 py-2 outline-none text-slate-700 dark:text-slate-200 text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isLoading}
                      className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-xl transition-colors flex items-center justify-center w-10 h-10 cursor-pointer"
                      title="Falar por voz"
                    >
                      <Mic size={16} />
                    </button>
                    <button 
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="w-10 h-10 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-md shadow-[#5E81F4]/15"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </form>
                )}
                <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 mt-2 uppercase font-mono tracking-widest font-semibold select-none">
                  SeguraBot utiliza inteligência artificial. Valide informações críticas.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Mobile Responsive Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden animate-fade-in">
          {/* Backdrop Blur overlay */}
          <div 
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Slide-over Content Container */}
          <div className="absolute inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-[#ECECF2] dark:border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-out transform translate-x-0">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <img 
                  src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} 
                  alt="SeguraBot Logo" 
                  className="w-11 h-11 object-contain" 
                />
                <span className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  SeguraBot
                </span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-xs font-bold text-[#8181A5] hover:text-slate-800 dark:hover:text-slate-200 uppercase tracking-wider cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Navigation Options */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="space-y-2">
                <p className="text-[9px] font-bold text-[#8181A5] uppercase tracking-widest">Navegação Principal</p>
                <button
                  onClick={() => { setCurrentView('chat'); setIsMobileMenuOpen(false); }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all duration-200 uppercase tracking-wider cursor-pointer border border-transparent flex items-center gap-3",
                    currentView === 'chat'
                      ? "bg-[#5E81F4] text-white shadow-sm shadow-[#5E81F4]/10"
                      : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Assistente Virtual</span>
                </button>

                {(currentRole === 'admin' || currentRole === 'atendente') && (
                  <button
                    onClick={() => { setCurrentView('crm'); setIsMobileMenuOpen(false); }}
                    className={cn(
                      "w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all duration-200 uppercase tracking-wider cursor-pointer border border-transparent flex items-center gap-3",
                      currentView === 'crm'
                        ? "bg-[#5E81F4] text-white shadow-sm shadow-[#5E81F4]/10"
                        : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <Database className="w-4 h-4" />
                  <span>Gestão CRM</span>
                </button>
              )}
            </div>

            <div className="w-full h-[1px] bg-slate-100 dark:bg-slate-800/60" />

            {/* Settings */}
            <div className="space-y-3">
              <p className="text-[9px] font-bold text-[#8181A5] uppercase tracking-widest">Ajustes Rápidos</p>
              
              {/* Theme button in drawer */}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full text-left py-3 px-4 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-wider cursor-pointer flex items-center gap-3"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[#F4BE5E]" /> : <Moon className="w-4 h-4 text-[#5E81F4]" />}
                <span>Tema: {theme === 'dark' ? 'Claro' : 'Escuro'}</span>
              </button>

              {/* Provider button in drawer */}
              {(currentRole === 'admin' || currentRole === 'atendente') && (
                <button
                  onClick={() => setProvider(provider === 'gemini' ? 'ollama' : 'gemini')}
                  className="w-full text-left py-3 px-4 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-wider cursor-pointer flex items-center gap-3"
                >
                  {provider === 'gemini' ? <Cloud className="w-4 h-4 text-[#5E81F4]" /> : <Cpu className="w-4 h-4 text-[#F4BE5E]" />}
                  <span>Provedor: {provider === 'gemini' ? 'Gemini Pro' : 'Ollama Local'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-5 border-t border-slate-100 dark:border-slate-800/60 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                {(profile?.name || user?.displayName || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{profile?.name || user?.displayName || 'Cliente Segura'}</p>
                <p className="text-[9px] uppercase tracking-wider font-mono text-slate-400 font-semibold mt-0.5">{currentRole}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Product Onboarding Tour */}
    <ProductTour
      steps={getTourSteps()}
      active={tourActive}
      onComplete={() => setTourActive(false)}
    />
  </div>
);
}
