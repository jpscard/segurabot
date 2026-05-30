import { useState, useEffect, useRef } from 'react';
import { auth, handleFirestoreError, db } from '../../infrastructure/firebase';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { FirebaseChatRepository } from '../../infrastructure/FirebaseChatRepository';
import { useSettings } from '../context/SettingsContext';
import { CustomerProfile, SupportTicket, OperationType, Policy, Claim, DocumentRecord, AnalyticsSummary, AnalyticsEvent } from '../../domain';
import { ChatSession, Message, Role } from '../../domain/Chat';
import { FirebaseAnalyticsRepository } from '../../infrastructure/FirebaseAnalyticsRepository';
import { generateCustomerSummaryWithAI, extractDocumentOcrWithAI } from '../../infrastructure/gemini';
import { onSnapshot, collection, deleteDoc, doc, addDoc, updateDoc, getDocs, collectionGroup } from 'firebase/firestore';
import { DynamicEmbeddingService } from '../../infrastructure/DynamicEmbeddingService';
import { uploadRealDataToKnowledgeBase } from '../../utils/seedKnowledgeBase';
import { speakWithElevenLabs } from '../../infrastructure/ElevenLabsService';
import { audioManager } from '../../utils/audioManager';
import {
  User,
  LifeBuoy,
  MessageSquare,
  Database,
  BarChart3,
  ArrowLeft,
  ChevronLeft,
  Save,
  Check,
  UploadCloud,
  FileUp,
  Sparkles,
  Brain,
  Plus,
  AlertTriangle,
  Trash2,
  Users,
  MousePointerClick,
  TrendingDown,
  Award,
  UserCheck,
  ShieldCheck,
  Activity,
  FileWarning,
  Flame,
  Gauge,
  FileText,
  Table,
  Globe,
  Edit3,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Calendar
} from 'lucide-react';

interface CrmAdminProps {
  activeTab?: 'dados' | 'chamados' | 'chat' | 'rag' | 'analytics' | 'ajustes_ia';
  setActiveTab?: (tab: 'dados' | 'chamados' | 'chat' | 'rag' | 'analytics' | 'ajustes_ia') => void;
  currentRole?: 'cliente' | 'atendente' | 'admin';
  onBack?: () => void;
}

export function CrmAdmin({ activeTab: propActiveTab, setActiveTab: propSetActiveTab, currentRole = 'cliente', onBack }: CrmAdminProps = {}) {
  const user = auth.currentUser;
  const { 
    provider, 
    setProvider, 
    geminiApiKey, 
    setGeminiApiKey, 
    ollamaModel, 
    setOllamaModel, 
    geminiModel, 
    setGeminiModel, 
    ollamaBaseUrl, 
    setOllamaBaseUrl,
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
  } = useSettings();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);

  const testVoice = async () => {
    audioManager.stopActiveAudio();
    const sampleText = "Olá, esta é uma demonstração da voz configurada no SeguraBot. A voz que você está ouvindo agora é exatamente a mesma que o cliente final e você ouvirão no chat.";

    if (ttsProvider === 'elevenlabs') {
      const success = await speakWithElevenLabs(sampleText, elevenLabsApiKey, elevenLabsVoiceId);
      if (success) return;
    }

    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = 'pt-BR';
    utterance.rate = ttsRate;

    const voices = speechSynthesis.getVoices();
    const ptVoices = voices.filter(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));

    const filterKeyword = ttsVoiceKeyword || 'google';
    const premiumVoice = ptVoices.find(v => {
      const nameLower = v.name.toLowerCase();
      if (filterKeyword === 'all') return false;
      return nameLower.includes(filterKeyword.toLowerCase()) || nameLower.includes('online') || nameLower.includes('natural');
    });

    if (premiumVoice) {
      utterance.voice = premiumVoice;
    } else if (ptVoices.length > 0) {
      utterance.voice = ptVoices[0];
    }

    speechSynthesis.speak(utterance);
  };

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

  useEffect(() => {
    if (provider === 'ollama') {
      fetchOllamaModels();
    }
  }, [provider, ollamaBaseUrl]);

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<CustomerProfile | null>(null);
  const [selectedCustomerTickets, setSelectedCustomerTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Navegação por abas
  const [localActiveTab, setLocalActiveTab] = useState<'dados' | 'chamados' | 'chat' | 'rag' | 'analytics' | 'ajustes_ia'>('dados');
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setLocalActiveTab;

  // Estados da Base de Conhecimento (RAG)
  const [kbEntries, setKbEntries] = useState<any[]>([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbSources, setKbSources] = useState<any[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  // Estados de Analytics
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsDateFilter, setAnalyticsDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const analyticsRepo = useRef(new FirebaseAnalyticsRepository());

  useEffect(() => {
    if (activeTab === 'analytics') {
      const loadAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
          const summary = await analyticsRepo.current.getSummary();
          setAnalyticsSummary(summary);
        } catch (err) {
          console.error("Error loading analytics:", err);
        } finally {
          setAnalyticsLoading(false);
        }
      };
      loadAnalytics();
    }
  }, [activeTab]);
  const [newCategory, setNewCategory] = useState('Geral');
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newSource, setNewSource] = useState('');
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [kbCurrentPage, setKbCurrentPage] = useState(1);
  const kbItemsPerPage = 10;
  const kbFileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Web Scraping RAG
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);

  // Estados para Modal de Confirmação de Limpeza RAG
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  // Estado para Janela de Alerta / Confirmação Customizada
  const [customConfirm, setCustomConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    danger: boolean;
  }>({ show: false, title: '', message: '', onConfirm: () => {}, danger: false });

  // Formulário Perfil
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newPolicy, setNewPolicy] = useState('');
  const [policies, setPolicies] = useState<string[]>([]);
  const [detailedPolicies, setDetailedPolicies] = useState<Policy[]>([]);
  const [claimsList, setClaimsList] = useState<Claim[]>([]);
  const [documentsList, setDocumentsList] = useState<DocumentRecord[]>([]);
  const [tier, setTier] = useState('Padrão');
  const [lifeStage, setLifeStage] = useState('');
  const [riskScore, setRiskScore] = useState(0);
  const [aiSummary, setAiSummary] = useState('');

  // Formulário Ticket
  const [newSubject, setNewSubject] = useState('');

  // Estados do Chat em Tempo Real
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatFilter, setChatFilter] = useState<'todos' | 'aguardando' | 'ia' | 'comigo' | 'arquivados'>('todos');
  const operatorTypingTimeoutRef = useRef<any>(null);
  const isOperatorTypingRef = useRef(false);

  // Estados do Painel Lateral do Atendente
  const [sidebarNewTicketSubject, setSidebarNewTicketSubject] = useState('');
  const [resolvingTicketId, setResolvingTicketId] = useState<string | null>(null);
  const [sidebarResolutionText, setSidebarResolutionText] = useState('');
  const [role, setRole] = useState<'cliente' | 'atendente' | 'admin'>('cliente');

  // Notificações Toast Premium Customizadas
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ show: false, message: '', type: 'success' });

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => {
        if (prev.message === message) {
          return { ...prev, show: false };
        }
        return prev;
      });
    }, 5000);
  };

  const customerRepo = new FirebaseCustomerRepository();
  const chatRepo = new FirebaseChatRepository();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedSessionsRef = useRef<Record<string, string>>({});
  const [documentsBase64, setDocumentsBase64] = useState<Record<string, string>>({});
  const [isExtractingOcr, setIsExtractingOcr] = useState<Record<string, boolean>>({});
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    if (!user) return;

    const profileUnsub = customerRepo.subscribeToCustomerProfile(user.uid, (data) => {
      if (data) {
        setProfile(data);
        setName(data.name);
        setPhone(data.phone || '');
        setPolicies(data.activePolicies || []);
        setDetailedPolicies(data.policies || []);
        setClaimsList(data.claims || []);
        setDocumentsList(data.documents || []);
        setTier(data.loyaltyTier || 'Padrão');
        setLifeStage(data.lifeStage || '');
        setRiskScore(data.riskScore || 0);
        setAiSummary(data.aiSummary || '');
        setRole(data.role || 'cliente');

        // Garante que o perfil do admin@segurabot.com.br tenha o papel 'admin' persistido no banco
        if (user.email === 'admin@segurabot.com.br' && data.role !== 'admin') {
          customerRepo.saveCustomerProfile(user.uid, {
            userId: user.uid,
            email: user.email,
            name: 'Administrador SeguraBot',
            phone: data.phone || '',
            activePolicies: data.activePolicies || [],
            policies: data.policies || [],
            claims: data.claims || [],
            documents: data.documents || [],
            loyaltyTier: data.loyaltyTier || 'Padrão',
            lifeStage: data.lifeStage || '',
            riskScore: data.riskScore || 0,
            aiSummary: data.aiSummary || 'Administrador do sistema.',
            role: 'admin'
          }).catch(err => console.error("Erro ao sincronizar papel de admin:", err));
        }
      } else {
        setProfile(null);
        setName(user.displayName || 'Cliente Segura');
        setPolicies([]);
        setDetailedPolicies([]);
        setClaimsList([]);
        setDocumentsList([]);
        setLifeStage('');
        setRiskScore(0);
        setAiSummary('');
        setRole('cliente');

        // Cria automaticamente o perfil do admin@segurabot.com.br caso não exista no Firestore
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
        }
      }
      setLoading(false);
    });

    const ticketsUnsub = currentRole === 'cliente'
      ? customerRepo.subscribeToSupportTickets(user.uid, (t) => {
          setTickets(t);
        })
      : customerRepo.subscribeToAllSupportTickets((t) => {
          setTickets(t);
        });

    const sessionsUnsub = chatRepo.listenToAllSessions((data) => {
      // Verificar se alguma sessão mudou para 'aguardando_humano' e ainda não foi notificada
      data.forEach(s => {
        const previousStatus = notifiedSessionsRef.current[s.id];
        if (s.status === 'aguardando_humano' && previousStatus !== 'aguardando_humano') {
          // Disparar notificação Toast Premium
          showNotification(`Fila Prioritária: Cliente "${s.title}" solicita atendimento humano!`, 'info');
          
          // Emitir sinal sonoro elegante de alerta utilizando a API de Áudio do navegador (sem arquivos externos)
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
            
            setTimeout(() => {
              const osc2 = audioCtx.createOscillator();
              const gain2 = audioCtx.createGain();
              osc2.connect(gain2);
              gain2.connect(audioCtx.destination);
              osc2.type = 'sine';
              osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
              gain2.gain.setValueAtTime(0.05, audioCtx.currentTime);
              osc2.start();
              osc2.stop(audioCtx.currentTime + 0.25);
            }, 150);
          } catch (soundErr) {
            console.warn("Som de notificação bloqueado pelo navegador", soundErr);
          }
        }
        // Atualizar o histórico de status da sessão
        notifiedSessionsRef.current[s.id] = s.status || 'ia';
      });

      setSessions(data);
    }, (error) => {
      console.error("Erro ao escutar sessões no CRM:", error);
    });

    return () => {
      profileUnsub();
      ticketsUnsub();
      sessionsUnsub();
    };
  }, [user, currentRole]);

  // Escuta mensagens do chat em tempo real selecionado
  useEffect(() => {
    if (!user || !selectedSession) {
      setSessionMessages([]);
      return;
    }

    const msgsUnsub = chatRepo.listenToMessages(selectedSession.userId, selectedSession.id, (data) => {
      setSessionMessages(data);
    }, (error) => {
      console.error("Erro ao escutar mensagens no CRM:", error);
    });

    return () => {
      msgsUnsub();
    };
  }, [user, selectedSession]);

  // Escuta perfil e chamados do cliente selecionado no chat em tempo real
  useEffect(() => {
    if (!selectedSession) {
      setSelectedCustomerProfile(null);
      setSelectedCustomerTickets([]);
      return;
    }

    const unsubProfile = customerRepo.subscribeToCustomerProfile(selectedSession.userId, (data) => {
      setSelectedCustomerProfile(data);
    });

    const unsubTickets = customerRepo.subscribeToSupportTickets(selectedSession.userId, (data) => {
      setSelectedCustomerTickets(data);
    });

    return () => {
      unsubProfile();
      unsubTickets();
    };
  }, [selectedSession]);

  // Escuta a base de conhecimento (RAG) do Firestore em tempo real
  useEffect(() => {
    const kbRef = collection(db, 'knowledge_base');
    const unsubscribe = onSnapshot(kbRef, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setKbEntries(entries);
      setKbLoading(false);
    }, (error) => {
      console.error("Erro ao escutar base de conhecimento RAG:", error);
      setKbLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Escuta as fontes de conhecimento do Firestore em tempo real
  useEffect(() => {
    const sourcesRef = collection(db, 'knowledge_sources');
    const unsubscribe = onSnapshot(sourcesRef, (snapshot) => {
      const sources = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Ordena por data de criação decrescente
      sources.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setKbSources(sources);
      setSourcesLoading(false);
    }, (error) => {
      console.error("Erro ao escutar fontes de conhecimento RAG:", error);
      setSourcesLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteSource = async (id: string) => {
    setCustomConfirm({
      show: true,
      title: "Excluir Fonte de Dados?",
      message: "Tem certeza que deseja excluir esta fonte de dados e todos os chunks de texto associados a ela? Isso desindexará essas informações do RAG permanentemente de forma irreversível.",
      danger: true,
      onConfirm: async () => {
        try {
          // 1. Encontrar todos os chunks associados a esta fonte
          const chunksToDelete = kbEntries.filter(entry => entry.sourceId === id);
          
          // 2. Deletar os chunks um a um
          let deletedChunksCount = 0;
          for (const chunk of chunksToDelete) {
            if (chunk.id) {
              await deleteDoc(doc(db, 'knowledge_base', chunk.id));
              deletedChunksCount++;
            }
          }
          
          // 3. Deletar o documento da fonte
          await deleteDoc(doc(db, 'knowledge_sources', id));
          
          showNotification(`Fonte de dados e seus ${deletedChunksCount} blocos de conhecimento associados foram excluídos com sucesso.`, "success");
        } catch (err: any) {
          console.error("Erro na exclusão em cascata da fonte RAG:", err);
          showNotification(`Erro ao deletar fonte em cascata: ${err.message || err}`, "error");
        }
      }
    });
  };

  const handleDeleteKbEntry = async (id: string) => {
    setCustomConfirm({
      show: true,
      title: "Excluir Entrada da Base?",
      message: "Tem certeza que deseja excluir permanentemente esta entrada da base de conhecimento RAG?",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'knowledge_base', id));
          showNotification("Entrada da base de conhecimento excluída com sucesso!", "success");
        } catch (error) {
          console.error("Erro ao deletar entrada do RAG:", error);
          showNotification("Erro ao deletar entrada da base de conhecimento.", "error");
        }
      }
    });
  };

  const handleWipeKnowledgeBase = async () => {
    if (currentRole !== 'admin') {
      showNotification("Apenas administradores podem zerar toda a base de conhecimento.", "error");
      return;
    }
    
    setKbLoading(true);
    setSourcesLoading(true);
    try {
      // 1. Deletar todos os chunks da coleção knowledge_base
      const kbRef = collection(db, 'knowledge_base');
      const kbSnap = await getDocs(kbRef);
      let chunksCount = 0;
      for (const d of kbSnap.docs) {
        await deleteDoc(doc(db, 'knowledge_base', d.id));
        chunksCount++;
      }
      
      // 2. Deletar todas as fontes da coleção knowledge_sources
      const sourcesRef = collection(db, 'knowledge_sources');
      const sourcesSnap = await getDocs(sourcesRef);
      let sourcesCount = 0;
      for (const d of sourcesSnap.docs) {
        await deleteDoc(doc(db, 'knowledge_sources', d.id));
        sourcesCount++;
      }
      
      showNotification(`A base de conhecimento foi completamente zerada! Foram excluídos ${chunksCount} blocos de texto e ${sourcesCount} fontes de dados.`, "success");
      setKbCurrentPage(1);
    } catch (err: any) {
      console.error("Erro ao zerar base de conhecimento:", err);
      showNotification(`Erro ao zerar base de conhecimento: ${err.message || err}`, "error");
    } finally {
      setKbLoading(false);
      setSourcesLoading(false);
    }
  };

  const resetAllInteractions = async () => {
    try {
      showNotification("Limpando interações e dados...", "info");
      
      // 1. Limpar Chamados de Suporte
      const ticketsSnap = await getDocs(collection(db, 'support_tickets'));
      for (const ticketDoc of ticketsSnap.docs) {
        await deleteDoc(ticketDoc.ref);
      }
      
      // 2. Limpar Históricos de Chats e suas subcoleções de mensagens
      const sessionsSnap = await getDocs(collectionGroup(db, 'chat_sessions'));
      for (const sessionDoc of sessionsSnap.docs) {
        const messagesRef = collection(db, `${sessionDoc.ref.path}/messages`);
        const messagesSnap = await getDocs(messagesRef);
        for (const msgDoc of messagesSnap.docs) {
          await deleteDoc(msgDoc.ref);
        }
        await deleteDoc(sessionDoc.ref);
      }
      
      // 3. Limpar Eventos de Analytics
      const analyticsSnap = await getDocs(collection(db, 'analytics'));
      for (const eventDoc of analyticsSnap.docs) {
        await deleteDoc(eventDoc.ref);
      }
      
      showNotification("Todas as interações, chats, chamados e estatísticas foram apagados com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao resetar banco:", err);
      showNotification(`Erro ao resetar: ${err.message || err}`, "error");
    }
  };

  const handleResetConfirm = () => {
    setCustomConfirm({
      show: true,
      title: "Confirmar Reset Total",
      message: "ATENÇÃO! Esta ação é irreversível. Todos os chamados de suporte, históricos de bate-papo, mensagens e estatísticas de analytics serão apagados permanentemente de toda a base de dados. Deseja continuar?",
      danger: true,
      onConfirm: async () => {
        setCustomConfirm(prev => ({ ...prev, show: false }));
        await resetAllInteractions();
      }
    });
  };

  const handleAddManualKbEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) {
      showNotification("A Pergunta e a Resposta são campos obrigatórios.", "error");
      return;
    }
    setKbUploading(true);
    try {
      const embeddingService = new DynamicEmbeddingService();
      let embedding: number[] | null = null;
      try {
        embedding = await embeddingService.generateEmbedding(newQuestion.trim());
      } catch (err) {
        console.warn("Erro ao gerar embedding, salvando sem vetor (fallback ativado):", err);
      }

      const kbRef = collection(db, 'knowledge_base');
      await addDoc(kbRef, {
        category: newCategory.trim() || 'Geral',
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        source: newSource.trim() || 'Inserção Manual',
        embedding
      });

      setNewCategory('Geral');
      setNewQuestion('');
      setNewAnswer('');
      setNewSource('');
      setKbCurrentPage(1);
      showNotification("Entrada cadastrada e indexada na base de conhecimento com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao cadastrar entrada RAG manual:", error);
      showNotification("Erro ao cadastrar entrada na base de conhecimento.", "error");
    } finally {
      setKbUploading(false);
    }
  };

  const handleKbFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKbUploading(true);
    try {
      const count = await uploadRealDataToKnowledgeBase(file);
      showNotification(`Sucesso! ${count} registros extraídos, vetorizados por IA e importados para o RAG com sucesso.`, "success");
      setKbCurrentPage(1);
    } catch (error: any) {
      console.error("Erro na importação de arquivos para o RAG:", error);
      showNotification(`Erro no processamento do arquivo: ${error.message || error}`, "error");
    } finally {
      setKbUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const triggerKbFileSelect = () => {
    kbFileInputRef.current?.click();
  };

  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) {
      showNotification("Por favor, insira uma URL válida.", "error");
      return;
    }
    
    // Bloqueio de SSRF (Rede local/IPs Privados)
    const urlLower = scrapeUrl.trim().toLowerCase();
    const isInternal = [
      'localhost', '127.0.0.1', '192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
      '172.28.', '172.29.', '172.30.', '172.31.', '0.0.0.0'
    ].some(ip => urlLower.includes(ip));
    
    if (isInternal) {
      showNotification("Acesso a rede local ou privada negado por política de segurança contra SSRF.", "error");
      return;
    }
    
    setIsScraping(true);
    let sourceId: string | null = null;
    try {
      // 1. Registrar a fonte de conhecimento no Firestore antes do processamento
      const sourceRef = collection(db, 'knowledge_sources');
      const sourceDoc = await addDoc(sourceRef, {
        name: scrapeUrl.trim(),
        type: 'web',
        status: 'processing',
        chunkCount: 0,
        createdAt: new Date().toISOString()
      });
      sourceId = sourceDoc.id;

      // 2. Fetch HTML usando proxy de CORS
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(scrapeUrl.trim())}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error("Falha ao acessar o proxy de CORS.");
      }
      
      const data = await response.json();
      const htmlContent = data.contents;
      if (!htmlContent) {
        throw new Error("Não foi possível obter o conteúdo da página.");
      }
      
      // 3. Limpar o HTML e pegar texto limpo
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(htmlContent, 'text/html');
      
      const tagsToRemove = ['script', 'style', 'header', 'footer', 'nav', 'noscript', 'iframe'];
      tagsToRemove.forEach(tag => {
        parsedDoc.querySelectorAll(tag).forEach(el => el.remove());
      });
      
      const cleanText = parsedDoc.body.innerText
        .replace(/\s+/g, ' ')
        .trim();
        
      if (cleanText.length < 100) {
        throw new Error("O texto extraído da página é muito curto ou vazio. Tente outro link.");
      }
      
      // 4. Chamar a IA para extrair as FAQs estruturadas
      const { extractFAQsFromWebpage } = await import('../../infrastructure/gemini');
      const faqs = await extractFAQsFromWebpage(cleanText, scrapeUrl.trim());
      
      if (!Array.isArray(faqs) || faqs.length === 0) {
        throw new Error("A IA não conseguiu identificar regras de seguro ou FAQs nesta página.");
      }
      
      // 5. Inserir e Vetorizar no Firestore em lote contendo sourceId
      const embeddingService = new DynamicEmbeddingService();
      const kbRef = collection(db, 'knowledge_base');
      
      let importedCount = 0;
      for (const faq of faqs) {
        let embedding: number[] | null = null;
        try {
          embedding = await embeddingService.generateEmbedding(faq.question);
        } catch (err) {
          console.warn("Erro ao gerar embedding para FAQ raspada, usando fallback:", err);
        }
        
        await addDoc(kbRef, {
          category: faq.category || 'WebScraping',
          question: faq.question,
          answer: faq.answer,
          source: faq.source || scrapeUrl.trim(),
          sourceId: sourceId, // Vínculo com a fonte de conhecimento
          embedding
        });
        importedCount++;
      }
      
      // 6. Atualizar o status da fonte de conhecimento para 'completed'
      if (sourceId) {
        const sourceDocRef = doc(db, 'knowledge_sources', sourceId);
        await updateDoc(sourceDocRef, {
          status: 'completed',
          chunkCount: importedCount
        });
      }

      setScrapeUrl('');
      showNotification(`Sucesso! ${importedCount} registros extraídos do link, vetorizados por IA e indexados ao RAG com sucesso.`, "success");
    } catch (err: any) {
      console.error("Erro no Web Scraping RAG:", err);
      
      // 7. Atualizar o status da fonte para 'error' em caso de falha
      if (sourceId) {
        try {
          const sourceDocRef = doc(db, 'knowledge_sources', sourceId);
          await updateDoc(sourceDocRef, {
            status: 'error'
          });
        } catch (e) {
          console.error("Erro ao atualizar status de erro da fonte raspada:", e);
        }
      }

      showNotification(`Erro no processamento do link: ${err.message || err}`, "error");
    } finally {
      setIsScraping(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    try {
      await customerRepo.saveCustomerProfile(user.uid, {
        userId: user.uid,
        email: user.email || '',
        name,
        phone,
        activePolicies: policies,
        policies: detailedPolicies,
        claims: claimsList,
        documents: documentsList,
        loyaltyTier: tier,
        lifeStage,
        riskScore,
        aiSummary,
        role: role
      });
      showNotification('Perfil CRM salvo com sucesso!', "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'customers');
    }
  };

  const addPolicy = () => {
    if (newPolicy.trim() && !policies.includes(newPolicy.trim())) {
      setPolicies([...policies, newPolicy.trim()]);
      setNewPolicy('');
    }
  };

  const removePolicy = (pol: string) => {
    setPolicies(policies.filter(p => p !== pol));
  };

  const addDetailedPolicy = () => {
    setDetailedPolicies([...detailedPolicies, {
      id: Date.now().toString(),
      type: 'Auto',
      assetDescription: '',
      coverageLimits: '',
      expirationDate: '',
      premiumValue: 0
    }]);
  };

  const removeDetailedPolicy = (id: string) => {
    setDetailedPolicies(detailedPolicies.filter(p => p.id !== id));
  };

  const addClaim = () => {
    setClaimsList([...claimsList, {
      id: Date.now().toString(),
      policyId: detailedPolicies[0]?.id || 'sem-apolice',
      description: '',
      status: 'aberto',
      openedAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    }]);
  };

  const removeClaim = (id: string) => {
    setClaimsList(claimsList.filter(c => c.id !== id));
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      
      let inferredType = 'Outro';
      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.includes('cnh') || fileNameLower.includes('motorista') || fileNameLower.includes('carteira')) inferredType = 'CNH';
      else if (fileNameLower.includes('crlv') || fileNameLower.includes('veiculo') || fileNameLower.includes('carro')) inferredType = 'CRLV';
      else if (fileNameLower.includes('rg') || fileNameLower.includes('identidade') || fileNameLower.includes('cpf')) inferredType = 'RG';
      else if (fileNameLower.includes('comprovante') || fileNameLower.includes('residencia') || fileNameLower.includes('luz') || fileNameLower.includes('agua')) inferredType = 'Comprovante';
      else if (fileNameLower.includes('laudo') || fileNameLower.includes('medico') || fileNameLower.includes('exame')) inferredType = 'Laudo';

      const docId = Date.now().toString();

      // Salva o base64 em memória para uso opcional em OCR por IA
      setDocumentsBase64(prev => ({ ...prev, [docId]: base64 }));

      setDocumentsList([...documentsList, {
        id: docId,
        type: inferredType,
        url: file.name,
        uploadedAt: new Date().toISOString().split('T')[0],
        extractedData: ''
      }]);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (id: string) => {
    setDocumentsList(documentsList.filter(d => d.id !== id));
    setDocumentsBase64(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const generateAiSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const profileData = {
        name,
        loyaltyTier: tier,
        lifeStage,
        riskScore,
        policies: detailedPolicies,
        claims: claimsList
      };
      const summary = await generateCustomerSummaryWithAI(profileData, tickets);
      setAiSummary(summary);
    } catch (err: any) {
      showNotification(`Erro ao consolidar resumo com IA: ${err.message || err}`, "error");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const extractDataFromDoc = async (id: string) => {
    const docItem = documentsList.find(d => d.id === id);
    if (!docItem) return;

    setIsExtractingOcr(prev => ({ ...prev, [id]: true }));
    try {
      const base64 = documentsBase64[id];
      if (base64) {
        const extracted = await extractDocumentOcrWithAI(base64, docItem.type);
        const newDocs = [...documentsList];
        const idx = newDocs.findIndex(d => d.id === id);
        if (idx > -1) {
          newDocs[idx].extractedData = extracted;
          setDocumentsList(newDocs);
        }
      } else {
        const newDocs = [...documentsList];
        const idx = newDocs.findIndex(d => d.id === id);
        if (idx > -1) {
          newDocs[idx].extractedData = `Metadados do documento:\n- Tipo: ${docItem.type}\n- Nome: ${docItem.url}\n- Upload: ${docItem.uploadedAt}\n\n(Para OCR inteligente via IA, por favor carregue o arquivo novamente nesta sessão de administração).`;
          setDocumentsList(newDocs);
        }
      }
    } catch (err: any) {
      showNotification(`Erro ao extrair dados por IA: ${err.message || err}`, "error");
    } finally {
      setIsExtractingOcr(prev => ({ ...prev, [id]: false }));
    }
  };

  const createTicket = async () => {
    if (!user || !newSubject.trim()) return;
    try {
      await customerRepo.createSupportTicket({
        userId: user.uid,
        subject: newSubject.trim(),
        status: 'aberto',
        resolution: '',
        createdAt: new Date().toISOString()
      });
      setNewSubject('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'support_tickets');
    }
  };

  const updateTicketStatus = async (id: string, status: string, resolution?: string) => {
    try {
      const ticketRef = doc(db, 'support_tickets', id);
      const updates: any = { status };
      if (resolution !== undefined) {
        updates.resolution = resolution;
      }
      await updateDoc(ticketRef, updates);

      // Envia uma notificação automatizada no chat ativo se houver
      const ticket = tickets.find(t => t.id === id) || selectedCustomerTickets.find(t => t.id === id);
      if (ticket && user) {
        const activeSessionForUser = sessions.find(s => s.userId === ticket.userId);
        if (activeSessionForUser) {
          const statusMap: Record<string, string> = {
            aberto: 'Aberto',
            em_andamento: 'Em Fila',
            fechado: 'Resolvido'
          };
          let messageContent = `[Sistema] O chamado "${ticket.subject}" foi atualizado para: ${statusMap[status] || status}.`;
          if (status === 'fechado' && resolution) {
            messageContent += ` Resolução Oficial: ${resolution}`;
          }
          
          const sysMsg: Message = {
            role: Role.MODEL,
            content: messageContent,
            timestamp: new Date().toISOString(),
            senderName: "Sistema"
          };
          await chatRepo.saveMessage(activeSessionForUser.userId, activeSessionForUser.id, sysMsg);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'support_tickets');
    }
  };

  const createTicketOnBehalf = async (subjectText: string, targetUserId: string) => {
    if (!user || !subjectText.trim()) return;
    try {
      await customerRepo.createSupportTicket({
        userId: targetUserId,
        subject: subjectText.trim(),
        status: 'aberto',
        resolution: '',
        createdAt: new Date().toISOString()
      });
      
      // Envia notificação automatizada no chat ativo se houver
      const activeSessionForUser = sessions.find(s => s.userId === targetUserId);
      if (activeSessionForUser) {
        const sysMsg: Message = {
          role: Role.MODEL,
          content: `[Sistema] Um novo chamado de suporte foi aberto pelo atendente: "${subjectText.trim()}".`,
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(activeSessionForUser.userId, activeSessionForUser.id, sysMsg);
      }
      
      setSidebarNewTicketSubject('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'support_tickets');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F6F6] dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#5E81F4] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold tracking-widest text-[#8181A5] uppercase font-sans">Carregando CRM...</span>
        </div>
      </div>
    );
  }

  const loyaltyTiers = ['Padrão', 'Silver', 'Gold', 'Black'];
  const lifeStages = ['Solteiro', 'Casado', 'Com filhos', 'Aposentado'];
  const claimStatuses: { value: Claim['status']; label: string }[] = [
    { value: 'aberto', label: 'Aberto' },
    { value: 'em_analise', label: 'Em Análise' },
    { value: 'vistoria', label: 'Vistoria' },
    { value: 'aprovado', label: 'Aprovado' },
    { value: 'pago', label: 'Pago' },
    { value: 'recusado', label: 'Recusado' }
  ];

  // Helper stats
  const activeDetailedPoliciesCount = detailedPolicies.length;
  const openClaimsCount = claimsList.filter(c => c.status !== 'pago' && c.status !== 'recusado').length;
  const openTicketsCount = tickets.filter(t => t.status !== 'fechado').length;

  const handleOperatorTyping = () => {
    if (!selectedSession || !user) return;
    
    if (!isOperatorTypingRef.current) {
      isOperatorTypingRef.current = true;
      chatRepo.updateSession(selectedSession.userId, {
        id: selectedSession.id,
        operatorTyping: true
      });
    }

    if (operatorTypingTimeoutRef.current) {
      clearTimeout(operatorTypingTimeoutRef.current);
    }

    operatorTypingTimeoutRef.current = setTimeout(() => {
      isOperatorTypingRef.current = false;
      chatRepo.updateSession(selectedSession.userId, {
        id: selectedSession.id,
        operatorTyping: false
      });
    }, 2000);
  };

  // Render do painel de chat em tempo real
  const renderLiveChatTab = () => {
    const handleTakeover = async (session: ChatSession) => {
      const updated: ChatSession = {
        ...session,
        status: 'humano',
        operatorName: 'Leonardo Alves Pereira'
      };
      try {
        await chatRepo.updateSession(session.userId, updated);
        const sysMsg: Message = {
          role: Role.MODEL,
          content: "O atendente Leonardo Alves Pereira assumiu o atendimento.",
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(session.userId, session.id, sysMsg);
        setSelectedSession(updated);
      } catch (err) {
        console.error("Erro ao assumir atendimento:", err);
      }
    };

    const handleRelease = async (session: ChatSession) => {
      const updated: ChatSession = {
        ...session,
        status: 'ia',
        operatorName: ''
      };
      try {
        await chatRepo.updateSession(session.userId, updated);
        const sysMsg: Message = {
          role: Role.MODEL,
          content: "O atendimento foi devolvido para o assistente virtual de IA.",
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(session.userId, session.id, sysMsg);
        setSelectedSession(updated);
      } catch (err) {
        console.error("Erro ao devolver atendimento para IA:", err);
      }
    };

    const handleResolveSession = async (session: ChatSession) => {
      const updated: ChatSession = {
        ...session,
        status: 'concluido',
        operatorName: ''
      };
      try {
        await chatRepo.updateSession(session.userId, updated);
        const sysMsg: Message = {
          role: Role.MODEL,
          content: "O atendimento foi concluído e arquivado pelo operador.",
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(session.userId, session.id, sysMsg);
        setSelectedSession(null); // Fecha o chat ativo e limpa a tela de trabalho
        showNotification("Atendimento concluído e arquivado com sucesso!", "success");
      } catch (err) {
        console.error("Erro ao concluir atendimento:", err);
        showNotification("Falha ao concluir atendimento.", "error");
      }
    };

    const handleSendLiveMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !selectedSession || !user) return;

      const operatorMsg: Message = {
        role: Role.MODEL,
        content: chatInput,
        timestamp: new Date().toISOString(),
        senderName: "Leonardo Alves Pereira"
      };

      try {
        await chatRepo.saveMessage(selectedSession.userId, selectedSession.id, operatorMsg);
        const updatedSession = {
          ...selectedSession,
          lastMessage: chatInput,
          updatedAt: new Date().toISOString()
        };
        await chatRepo.updateSession(selectedSession.userId, updatedSession);
        setChatInput('');
      } catch (err) {
        console.error("Erro ao enviar mensagem no CRM:", err);
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow flex-1 h-full min-h-0 bg-white dark:bg-slate-900 rounded-2xl border border-[#ECECF2] dark:border-slate-800 overflow-hidden shadow-sm animate-fadeIn">
        {/* Painel Esquerdo: Lista de Conversas (col-span-4) */}
        <div id="crm-sidebar-sessions" className="lg:col-span-4 border-r border-[#ECECF2] dark:border-slate-800 flex flex-col h-full min-h-0 bg-slate-50/50 dark:bg-slate-950/20 select-none">
          <div className="p-4 border-b border-[#ECECF2] dark:border-slate-800 space-y-3 shrink-0">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Conversas Ativas
              </h3>
              <p className="text-[10px] text-[#8181A5] mt-1">
                Monitore os chats e assuma o controle quando necessário.
              </p>
            </div>
            
            {/* Sleek, typographic button filters (No icons/emojis, button groups instead of radios) */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'aguardando', label: 'Aguardando' },
                { id: 'ia', label: 'Em IA' },
                { id: 'comigo', label: 'Comigo' },
                { id: 'arquivados', label: 'Concluídos' }
              ].map((f) => (
                <button
                   type="button"
                   key={f.id}
                   onClick={() => setChatFilter(f.id as any)}
                   className={`px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                    chatFilter === f.id
                      ? 'bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/40 text-slate-655 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-[#ECECF2] dark:divide-slate-800/60 scrollbar-thin">
            {(() => {
              const filteredSessions = sessions.filter(s => {
                // Se o filtro for de concluídos/arquivados, mostra apenas eles
                if (chatFilter === 'arquivados') {
                  return s.status === 'concluido';
                }

                // Ocultar sessões concluídas da fila ativa de outras abas
                if (s.status === 'concluido') return false;

                if (chatFilter === 'aguardando') {
                  return s.status === 'aguardando_humano';
                }
                if (chatFilter === 'ia') {
                  return s.status === 'ia' || !s.status;
                }
                if (chatFilter === 'comigo') {
                  return s.status === 'humano' && s.operatorName === 'Leonardo Alves Pereira';
                }
                return true;
              });

              return (
                <>
                  {filteredSessions.map(s => {
                    const isSelected = selectedSession?.id === s.id;
                    
                    let statusLabel = 'IA';
                    let statusClass = 'bg-[#5E81F4]/10 dark:bg-[#5E81F4]/20 text-[#5E81F4] border border-[#5E81F4]/20 dark:border-transparent';
                    
                    if (s.status === 'aguardando_humano') {
                      statusLabel = 'Aguardando';
                      statusClass = 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-transparent';
                    } else if (s.status === 'humano') {
                      statusLabel = 'Operador';
                      statusClass = 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100/30 dark:border-transparent';
                    }

                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSession(s)}
                        className={`w-full text-left p-4 transition-all duration-200 focus:outline-none flex flex-col gap-2 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer ${
                          isSelected ? 'bg-white dark:bg-slate-800 shadow-inner border-l-2 border-[#5E81F4]' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-2 max-w-[150px]">
                            {s.title}
                          </span>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate w-full font-normal">
                          {s.clientTyping ? (
                            <span className="text-[#5E81F4] font-bold animate-pulse">Digitando...</span>
                          ) : (
                            s.lastMessage || 'Nenhuma mensagem ainda...'
                          )}
                        </p>
                        
                        <span className="text-[8px] font-mono text-slate-400 self-end font-semibold">
                          {s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                        </span>
                      </button>
                    );
                  })}
                  
                  {filteredSessions.length === 0 && (
                    <div className="p-8 text-center text-xs text-[#8181A5] italic">
                      Nenhuma conversa encontrada neste filtro.
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Painel Direito: Chat Selecionado (col-span-8 se não selecionado, senão col-span-5 para o chat + col-span-3 para o CRM do cliente) */}
        {selectedSession ? (
          <>
            {/* Coluna Central: Chat (col-span-5) */}
            <div id="crm-chat-history" className="lg:col-span-5 flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 border-r border-[#ECECF2] dark:border-slate-800">
              {/* Header do Chat Selecionado */}
              <div className="p-4 border-b border-[#ECECF2] dark:border-slate-800 flex justify-between items-center bg-slate-50/20 shrink-0">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {selectedSession.title}
                  </h4>
                  <p className="text-[9px] text-[#8181A5] mt-0.5 font-mono font-semibold">
                    Sessão: {selectedSession.id}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 select-none">
                  {selectedSession.status === 'humano' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRelease(selectedSession)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border border-slate-200/50 dark:border-slate-700"
                      >
                        Devolver para IA
                      </button>
                      <button
                        onClick={() => handleResolveSession(selectedSession)}
                        className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                      >
                        Concluir Atendimento
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleTakeover(selectedSession)}
                      className="px-4 py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm animate-pulse"
                    >
                      Assumir Conversa
                    </button>
                  )}
                </div>
              </div>

              {/* Histórico de Mensagens */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/10 dark:bg-transparent scrollbar-thin">
                {sessionMessages.map((msg, i) => {
                  const isUser = msg.role === Role.USER;
                  const isSystem = msg.senderName === "Sistema";
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id || i} className="flex justify-center my-2 select-none">
                        <span className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[9px] font-mono uppercase tracking-wider text-center max-w-md border border-slate-300/20 dark:border-transparent">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id || i}
                      className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-[10px] shadow-sm select-none ${
                        isUser 
                          ? 'bg-slate-900 dark:bg-slate-800 text-white' 
                          : msg.senderName 
                            ? 'bg-indigo-600 text-white border border-transparent' 
                            : 'bg-[#5E81F4] text-white border border-[#5E81F4]/20'
                      }`}>
                        {isUser ? 'U' : msg.senderName ? 'A' : 'B'}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        {!isUser && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-[#8181A5] font-mono">
                            {msg.senderName ? `Corretor: ${msg.senderName}` : 'Assistente IA'}
                          </span>
                        )}
                        <div className={`p-3.5 rounded-2xl text-[11px] leading-relaxed shadow-sm font-normal ${
                          isUser 
                            ? 'bg-slate-800 text-white rounded-tr-none' 
                            : 'bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        {msg.timestamp && (
                          <span className={`text-[8px] font-mono text-slate-400 dark:text-slate-500 font-semibold px-1 mt-0.5 ${isUser ? 'self-end' : 'self-start'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {selectedSession?.clientTyping && (
                  <div className="flex gap-3 max-w-[85%] mr-auto animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold text-[10px] select-none">
                      U
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="p-3.5 bg-white dark:bg-slate-800 border border-[#ECECF2] dark:border-slate-800 text-slate-500 rounded-2xl rounded-tl-none text-[11px] italic">
                        Digitando...
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Caixa de Digitação Direta */}
              <div className="p-4 border-t border-[#ECECF2] dark:border-slate-800 shrink-0">
                <form onSubmit={handleSendLiveMessage} className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={e => {
                      setChatInput(e.target.value);
                      handleOperatorTyping();
                    }}
                    disabled={selectedSession.status !== 'humano'}
                    placeholder={
                      selectedSession.status === 'humano'
                        ? "Digite sua resposta em tempo real..."
                        : selectedSession.status === 'concluido'
                          ? "Este atendimento foi concluído e está arquivado."
                          : "Você precisa 'Assumir Conversa' para responder a este cliente."
                    }
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 disabled:opacity-60 transition-all placeholder:text-[#8181A5]/50"
                  />
                  <button
                    type="submit"
                    disabled={selectedSession.status !== 'humano' || !chatInput.trim()}
                    className="px-5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent font-bold rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-sm"
                  >
                    Enviar
                  </button>
                </form>
              </div>
            </div>

            {/* Coluna da Direita: CRM & Tickets do Cliente (col-span-3) */}
            <div id="crm-customer-profile" className="lg:col-span-3 flex flex-col h-full min-h-0 bg-[#F6F6F6]/30 dark:bg-slate-950/10 overflow-y-auto select-none p-4 divide-y divide-[#ECECF2]/60 dark:divide-slate-800/60 scrollbar-thin space-y-5">
              
              {/* Seção 1: Perfil do Cliente */}
              <div className="pb-4 space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Perfil do Cliente
                </h4>
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedCustomerProfile?.name || 'Cliente Segura'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                    {selectedCustomerProfile?.email || 'cliente@segura.com'}
                  </p>
                  {selectedCustomerProfile?.phone && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                      Tel: {selectedCustomerProfile.phone}
                    </p>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {/* Loyalty Tier Badge */}
                  {selectedCustomerProfile?.loyaltyTier && (
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      selectedCustomerProfile.loyaltyTier === 'Silver' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                      selectedCustomerProfile.loyaltyTier === 'Gold' || selectedCustomerProfile.loyaltyTier === 'Ouro' ? 'bg-amber-100/70 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-500/20' :
                      selectedCustomerProfile.loyaltyTier === 'Black' || selectedCustomerProfile.loyaltyTier === 'Platina' ? 'bg-blue-100 text-[#5E81F4] dark:bg-blue-950/40 dark:text-blue-400 border border-blue-500/20 shadow-sm' :
                      selectedCustomerProfile.loyaltyTier === 'Bronze' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-500/10' :
                      'bg-blue-100 text-[#5E81F4] dark:bg-blue-950/40 dark:text-[#5E81F4]'
                    }`}>
                      {selectedCustomerProfile.loyaltyTier}
                    </span>
                  )}
                  {/* Risk Score Badge */}
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    (selectedCustomerProfile?.riskScore || 0) > 60 ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400' :
                    (selectedCustomerProfile?.riskScore || 0) > 30 ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' :
                    'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    Risco: {selectedCustomerProfile?.riskScore || 0}%
                  </span>
                  
                  {selectedCustomerProfile?.lifeStage && (
                    <span className="text-[8px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      {selectedCustomerProfile.lifeStage}
                    </span>
                  )}
                </div>
              </div>

              {/* Seção 2: Resumo da IA (Insights) */}
              <div className="py-4 space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Resumo de IA
                </h4>
                <div className="p-3 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-xl max-h-[110px] overflow-y-auto scrollbar-thin">
                  <p className="text-[9px] leading-relaxed italic text-slate-600 dark:text-slate-400 font-medium">
                    {selectedCustomerProfile?.aiSummary || "Nenhum resumo gerado ainda. Use a aba 'Dados e Contratos' para compilar o resumo."}
                  </p>
                </div>
              </div>

              {/* Seção 3: Tickets de Suporte */}
              <div className="py-4 flex-1 flex flex-col min-h-0 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Chamados ({selectedCustomerTickets.length})
                  </h4>
                </div>

                {/* Lista de Tickets do Usuário */}
                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[180px] scrollbar-thin pr-1">
                  {selectedCustomerTickets.map(t => {
                    const isResolving = resolvingTicketId === t.id;
                    return (
                      <div key={t.id} className="p-2.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-xl space-y-2 text-[10px] font-normal">
                        <div className="flex justify-between items-start gap-1">
                          <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight flex-1">
                            {t.subject}
                          </p>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            t.status === 'fechado' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' :
                            t.status === 'em_andamento' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' :
                            'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400'
                          }`}>
                            {t.status === 'fechado' ? 'Fch' : t.status === 'em_andamento' ? 'Fila' : 'Abt'}
                          </span>
                        </div>

                        {t.resolution && (
                          <p className="p-1.5 bg-[#F6F6F6] dark:bg-slate-950 rounded text-[9px] italic text-slate-500 dark:text-slate-400 font-medium">
                            Rsl: {t.resolution}
                          </p>
                        )}

                        {/* Controles de Status do Chamado */}
                        {t.status !== 'fechado' && (
                          <div className="flex gap-1.5 pt-1 justify-end">
                            {t.status === 'aberto' && (
                              <button
                                onClick={() => updateTicketStatus(t.id!, 'em_andamento')}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-transparent rounded-lg font-bold uppercase tracking-wider text-[8px] cursor-pointer"
                              >
                                Fila
                              </button>
                            )}
                            
                            {!isResolving ? (
                              <button
                                onClick={() => {
                                  setResolvingTicketId(t.id!);
                                  setSidebarResolutionText('');
                                }}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-transparent rounded-lg font-bold uppercase tracking-wider text-[8px] cursor-pointer"
                              >
                                Resolver
                              </button>
                            ) : (
                              <div className="w-full flex flex-col gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <input
                                  value={sidebarResolutionText}
                                  onChange={e => setSidebarResolutionText(e.target.value)}
                                  placeholder="Descreva a solução..."
                                  className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-[9px] outline-none focus:border-[#5E81F4]"
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => setResolvingTicketId(null)}
                                    className="px-2 py-1 text-slate-500 hover:text-slate-700 text-[8px] font-bold uppercase tracking-wider cursor-pointer"
                                  >
                                    Canc
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateTicketStatus(t.id!, 'fechado', sidebarResolutionText.trim());
                                      setResolvingTicketId(null);
                                    }}
                                    disabled={!sidebarResolutionText.trim()}
                                    className="px-2 py-1 bg-[#5E81F4] text-white rounded-lg text-[8px] font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                                  >
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {selectedCustomerTickets.length === 0 && (
                    <p className="text-[9px] text-[#8181A5] dark:text-slate-500 italic py-2 text-center">Nenhum chamado aberto.</p>
                  )}
                </div>

                {/* Abertura de Chamado inline */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-2">
                  <input
                    value={sidebarNewTicketSubject}
                    onChange={e => setSidebarNewTicketSubject(e.target.value)}
                    placeholder="Novo chamado..."
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-[10px] outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 placeholder:text-[#8181A5]/50 transition-all font-normal"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (sidebarNewTicketSubject.trim()) {
                          createTicketOnBehalf(sidebarNewTicketSubject, selectedSession.userId);
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => createTicketOnBehalf(sidebarNewTicketSubject, selectedSession.userId)}
                    disabled={!sidebarNewTicketSubject.trim()}
                    className="w-full py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 disabled:opacity-50 text-white rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm text-center"
                  >
                    Abrir Chamado
                  </button>
                </div>

              </div>

            </div>
          </>
        ) : (
          <div className="lg:col-span-8 flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 justify-center items-center p-8 text-center select-none">
            <div className="w-16 h-16 bg-[#5E81F4]/10 text-[#5E81F4] border border-[#5E81F4]/20 rounded-2xl flex items-center justify-center shrink-0 font-bold text-lg">
              C
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 uppercase tracking-wider">
              Nenhum Chat Selecionado
            </h3>
            <p className="text-[11px] text-[#8181A5] dark:text-slate-400 mt-2 max-w-xs leading-relaxed font-normal">
              Selecione uma das conversas ativas no painel esquerdo para ler o histórico completo e interagir.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderRagTab = () => {
    // Filtrar entradas com base na query de busca
    const filteredEntries = kbEntries.filter(entry => {
      const q = kbSearchQuery.toLowerCase();
      return (
        entry.category?.toLowerCase().includes(q) ||
        entry.question?.toLowerCase().includes(q) ||
        entry.answer?.toLowerCase().includes(q) ||
        entry.source?.toLowerCase().includes(q)
      );
    });

    // Paginação
    const totalItems = filteredEntries.length;
    const totalPages = Math.ceil(totalItems / kbItemsPerPage) || 1;
    const startIndex = (kbCurrentPage - 1) * kbItemsPerPage;
    const paginatedEntries = filteredEntries.slice(startIndex, startIndex + kbItemsPerPage);

    // Ajustar a página atual se os filtros esvaziarem a lista
    if (kbCurrentPage > totalPages) {
      setKbCurrentPage(totalPages);
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
        {/* Coluna Esquerda: Ingestão de Conhecimento (col-span-5) */}
        <div className="lg:col-span-5 space-y-8 select-none">
          {/* Formulário de Cadastro Manual */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5">
            <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Cadastrar FAQ Manual
              </h3>
              <p className="text-[10px] text-[#8181A5] mt-1 font-normal leading-relaxed">
                Adicione regras manuais diretamente no cérebro do assistente.
              </p>
            </div>

            <form onSubmit={handleAddManualKbEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Categoria / Operadora</label>
                  <input
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="Ex: Saúde, Amil, Bradesco"
                    className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Fonte / Origem</label>
                  <input
                    value={newSource}
                    onChange={e => setNewSource(e.target.value)}
                    placeholder="Ex: Manual 2026, Regra RH"
                    className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block font-sans">Pergunta / Tópico de Entrada</label>
                <input
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  placeholder="Ex: Qual a carência de parto no plano Amil?"
                  className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Resposta / Instrução Oficial</label>
                <textarea
                  value={newAnswer}
                  onChange={e => setNewAnswer(e.target.value)}
                  placeholder="Ex: Conforme condições gerais, a carência é de 10 meses (300 dias)..."
                  rows={4}
                  className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all resize-none scrollbar-thin"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={kbUploading}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {kbUploading ? 'Indexando com IA...' : 'Cadastrar na Base'}
              </button>
            </form>
          </section>

          {/* Importação Automática por Arquivo */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5">
            <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Importação Automatizada por IA
              </h3>
              <p className="text-[10px] text-[#8181A5] mt-1 font-normal leading-relaxed">
                Carregue um PDF de manual, tabela JSON ou planilha CSV. O SeguraBot usará Inteligência Artificial para ler, fatiar (chunking) e gerar embeddings semânticos de forma autônoma.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="file"
                ref={kbFileInputRef}
                onChange={handleKbFileUpload}
                accept=".pdf,.csv,.json"
                className="hidden"
                disabled={kbUploading}
              />
              
              <button
                type="button"
                onClick={triggerKbFileSelect}
                disabled={kbUploading}
                className="w-full py-5 border-2 border-dashed border-[#ECECF2] dark:border-slate-800 hover:border-[#5E81F4] dark:hover:border-[#5E81F4] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/30 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all duration-200 disabled:opacity-50"
              >
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {kbUploading ? 'Processando Documento...' : 'Selecionar Documento'}
                </span>
                <span className="text-[9px] text-[#8181A5] tracking-wide">
                  Suporta arquivos .pdf, .csv ou .json
                </span>
              </button>

              {kbUploading && (
                <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-[#5E81F4] dark:text-[#5E81F4] uppercase tracking-wider animate-pulse">
                  <div className="w-2.5 h-2.5 border border-t-transparent border-[#5E81F4] rounded-full animate-spin" />
                  Extraindo e indexando embeddings por IA...
                </div>
              )}
            </div>
          </section>

          {/* Importação via Link (Web Scraping) */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5 animate-fadeIn">
            <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Importação via Link (Web Scraping)
              </h3>
              <p className="text-[10px] text-[#8181A5] mt-1 font-normal leading-relaxed">
                Insira o link de uma página da web (FAQ, manual online ou artigo de suporte). O SeguraBot extrairá o conteúdo de texto da página de forma inteligente, gerando FAQs estruturadas e indexando-as no RAG.
              </p>
            </div>

            <form onSubmit={handleScrapeUrl} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">
                  Endereço da Página Web (URL)
                </label>
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={e => setScrapeUrl(e.target.value)}
                  placeholder="Ex: https://exemplo.com/faq-seguros"
                  className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all"
                  required
                  disabled={isScraping}
                />
              </div>

              <button
                type="submit"
                disabled={isScraping}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isScraping ? 'Analisando e Extraindo...' : 'Importar Conteúdo do Link'}
              </button>

              {isScraping && (
                <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-[#5E81F4] dark:text-[#5E81F4] uppercase tracking-wider animate-pulse">
                  <div className="w-2.5 h-2.5 border border-t-transparent border-[#5E81F4] rounded-full animate-spin" />
                  Bypassando CORS e extraindo FAQs por IA...
                </div>
              )}
            </form>
          </section>

          {/* Manutenção da Base (Apenas Admin) */}
          {currentRole === 'admin' && (
            <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-rose-100 dark:border-rose-950/30 space-y-5 animate-fadeIn">
              <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Limpeza da Base de Conhecimento
                </h3>
                <p className="text-[10px] text-[#8181A5] mt-1 font-normal leading-relaxed">
                  Remova permanentemente todas as perguntas cadastradas, blocos de texto (chunks) e fontes de dados associadas do Firestore. Esta ação não poderá ser desfeita.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowWipeModal(true)}
                disabled={kbLoading || sourcesLoading}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer shadow-sm text-center"
              >
                {kbLoading || sourcesLoading ? 'Processando Limpeza...' : 'Zerar Toda a Base'}
              </button>
            </section>
          )}
        </div>

        {/* Coluna Direita: Central de Chunks e Visualização (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Painel: Fontes de Conhecimento Indexadas (RAG) */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5 select-none">
            <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Fontes de Conhecimento Indexadas
              </h3>
              <p className="text-[10px] text-[#8181A5] mt-1 font-normal leading-relaxed">
                Lista de arquivos e links raspados que geraram os blocos semânticos da base do SeguraBot. Excluir uma fonte apagará em cascata todos os seus chunks associados.
              </p>
            </div>

            {sourcesLoading ? (
              <div className="text-xs font-bold text-[#8181A5] uppercase tracking-wider animate-pulse text-center py-4">
                Carregando fontes de dados...
              </div>
            ) : kbSources.length === 0 ? (
              <p className="text-xs text-[#8181A5] dark:text-slate-500 italic text-center py-4">
                Nenhum arquivo ou link registrado como fonte ativa.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#ECECF2] dark:border-slate-800 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider pb-2">
                      <th className="py-2 font-bold">Fonte / Origem</th>
                      <th className="py-2 font-bold px-2">Tipo</th>
                      <th className="py-2 font-bold px-2">Data</th>
                      <th className="py-2 font-bold px-2 text-center">Tamanho</th>
                      <th className="py-2 font-bold px-2">Status</th>
                      <th className="py-2 font-bold text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECECF2] dark:divide-slate-800">
                    {kbSources.map((source: any) => {
                      const dateStr = new Date(source.createdAt).toLocaleDateString('pt-BR');
                      const typeLabel = source.type?.toUpperCase() || 'MANUAL';
                      
                      // Match type icon
                      let TypeIcon = FileText;
                      if (source.type === 'csv' || source.type === 'json') {
                        TypeIcon = Table;
                      } else if (source.type === 'web') {
                        TypeIcon = Globe;
                      } else if (source.type === 'manual') {
                        TypeIcon = Edit3;
                      }

                      let statusColor = 'text-[#5E81F4]';
                      let statusText = 'INDEXADO';
                      let StatusIcon = CheckCircle2;
                      
                      if (source.status === 'processing') {
                        statusColor = 'text-[#F4BE5E] animate-pulse font-bold';
                        statusText = 'PROCESSANDO';
                        StatusIcon = Loader2;
                      } else if (source.status === 'error') {
                        statusColor = 'text-[#FF808B] font-bold';
                        statusText = 'FALHA';
                        StatusIcon = XCircle;
                      }

                      return (
                        <tr key={source.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                          <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200 max-w-[150px] truncate" title={source.name}>
                            <div className="flex items-center gap-1.5 max-w-full">
                              <TypeIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                              <span className="truncate">{source.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="px-1.5 py-0.5 bg-[#F6F6F6] dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-[#ECECF2] dark:border-slate-800 rounded font-bold text-[9px]">
                              {typeLabel}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[#8181A5] font-normal">{dateStr}</td>
                          <td className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-300 font-bold">
                            {source.status === 'processing' ? '-' : `${source.chunkCount || 0} chunks`}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className={`flex items-center gap-1 font-bold text-[9px] uppercase tracking-wider ${statusColor}`}>
                              <StatusIcon className={`w-3 h-3 shrink-0 ${source.status === 'processing' ? 'animate-spin' : ''}`} />
                              <span>{statusText}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteSource(source.id)}
                              className="text-[9px] font-bold uppercase tracking-wider text-[#FF808B] hover:text-[#ff4d5a] hover:bg-rose-500/5 dark:hover:bg-rose-500/10 px-2 py-1 border border-[#ECECF2] dark:border-slate-800 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Excluir</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 flex flex-col min-h-[500px]">
            {/* Header da Coluna */}
            <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Base de Conhecimento Ativa ({totalItems})
                </h3>
                <p className="text-[10px] text-[#8181A5] mt-1 font-normal">
                  Visualize e gerencie os blocos semânticos armazenados no Firestore.
                </p>
              </div>

              {/* Input de Pesquisa Responsivo */}
              <input
                value={kbSearchQuery}
                onChange={e => {
                  setKbSearchQuery(e.target.value);
                  setKbCurrentPage(1); // Reseta para a primeira página ao buscar
                }}
                placeholder="Pesquisar na base..."
                className="px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 font-normal transition-all w-full sm:w-48"
              />
            </div>

            {/* Listagem de Chunks */}
            <div className="flex-1 space-y-4 py-4">
              {kbLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-4 h-4 border border-t-transparent border-[#5E81F4] rounded-full animate-spin" />
                  <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Carregando base...</span>
                </div>
              ) : paginatedEntries.length > 0 ? (
                <div className="space-y-4">
                  {paginatedEntries.map(entry => (
                    <div
                      key={entry.id}
                      className="p-4 bg-slate-50/50 dark:bg-slate-950/20 border border-[#ECECF2] dark:border-slate-800 rounded-lg flex flex-col gap-2 hover:shadow-sm transition-shadow duration-200"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 select-none">
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded uppercase tracking-wider">
                            {entry.category || 'Geral'}
                          </span>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono ${
                            entry.embedding 
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}>
                            {entry.embedding ? 'Vetorizado por IA' : 'Somente Texto'}
                          </span>
                        </div>

                        {/* Botão de Excluir */}
                        <button
                          onClick={() => handleDeleteKbEntry(entry.id)}
                          className="text-[9px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-700 transition-colors py-1 px-2.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-transparent hover:border-rose-100 dark:hover:border-transparent cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                          {entry.question}
                        </h4>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed break-words">
                          {entry.answer}
                        </p>
                      </div>

                      <div className="flex justify-between items-center text-[8px] font-mono text-slate-400 select-none font-semibold pt-1 border-t border-slate-200/40 dark:border-slate-800/40 mt-1">
                        <span>Fonte: {entry.source || 'Não especificada'}</span>
                        <span>ID: {entry.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center select-none">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Nenhum registro encontrado
                  </span>
                  <p className="text-[10px] text-[#8181A5] max-w-xs mt-1.5 leading-relaxed font-normal">
                    Não existem informações cadastradas ou nenhum chunk atende à sua busca atual.
                  </p>
                </div>
              )}
            </div>

            {/* Controles de Paginação */}
            {totalPages > 1 && (
              <div className="border-t border-[#ECECF2] dark:border-slate-800 pt-4 flex items-center justify-between select-none">
                <button
                  type="button"
                  disabled={kbCurrentPage === 1}
                  onClick={() => setKbCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer border border-slate-200/50 dark:border-slate-700"
                >
                  Anterior
                </button>

                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  Página {kbCurrentPage} de {totalPages}
                </span>

                <button
                  type="button"
                  disabled={kbCurrentPage === totalPages}
                  onClick={() => setKbCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer border border-slate-200/50 dark:border-slate-700"
                >
                  Próximo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getHeaderContent = () => {
    switch (activeTab) {
      case 'dados':
        return {
          title: 'Dados & Contratos de Seguro',
          description: 'Gerencie as informações de perfil, contratos de apólices ativas e histórico de sinistros em tempo real.'
        };
      case 'chamados':
        return {
          title: 'Central de Atendimento e Suporte',
          description: 'Acompanhe chamados de suporte técnico, reabra tickets ou altere seus estados na fila de atendimento.'
        };
      case 'chat':
        return {
          title: 'Painel do Operador (Omnichannel)',
          description: 'Atenda chamados de clientes em tempo real, intermedeie sessões ativas e controle o fluxo de transição entre IA e Humano.'
        };
      case 'rag':
        return {
          title: 'Base de Conhecimento e RAG',
          description: 'Envie novos documentos, configure regras de IA e consulte a base de dados do RAG em tempo real.'
        };
      case 'analytics':
        return {
          title: 'Analytics & Funil de Conversão',
          description: 'Monitore métricas de visitantes, taxa de rejeição, cliques no atendimento e conversão de leads da IA em tempo real.'
        };
      default:
        return {
          title: 'Simulador de CRM Omnichannel',
          description: 'Gerencie seus próprios dados cadastrais, contratos de seguro e sinistros para moldar as respostas de inteligência artificial do SeguraBot em tempo real.'
        };
    }
  };

  const renderStatsBar = () => {
    switch (activeTab) {
      case 'dados':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Fidelidade</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#9698D6]">{tier}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Tier</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Apólices Ativas</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#5E81F4]">{activeDetailedPoliciesCount}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Contratos</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Sinistros Abertos</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#F4BE5E]">{openClaimsCount}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Em Trâmite</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Nível de Risco</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#FF808B]">{riskScore}%</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Pontuação</span>
              </div>
            </div>
          </div>
        );
      case 'chamados':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Total de Chamados</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#9698D6]">{tickets.length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Registrados</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Chamados Abertos</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#FF808B]">{tickets.filter(t => t.status === 'aberto').length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Fila Inicial</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Em Andamento</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#F4BE5E]">{tickets.filter(t => t.status === 'em_andamento').length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Fila Operacional</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Resolvidos</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#7CE7AC]">{tickets.filter(t => t.status === 'fechado').length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Fila Encerrada</span>
              </div>
            </div>
          </div>
        );
      case 'chat':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Conversas Recentes</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#9698D6]">{sessions.length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Sessões Totais</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Aguardando Humano</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#FF808B]">{sessions.filter(s => s.status === 'aguardando_humano').length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Fila Prioritária</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Em IA</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#5E81F4]">{sessions.filter(s => s.status === 'ia' || !s.status).length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Assistente Virtual</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Com Operador</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#7CE7AC]">{sessions.filter(s => s.status === 'humano').length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Atendimento Humano</span>
              </div>
            </div>
          </div>
        );
      case 'rag':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Documentos de Apoio</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#5E81F4]">{kbEntries.length}</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Registros na Base</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Status da Base</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#7CE7AC]">Ativo</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Status</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Busca Semântica</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#9698D6]">Ativada</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">IA Embeddings</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm animate-fadeIn">
              <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Versão do RAG</span>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-xl font-bold text-[#F4BE5E]">v1.2</span>
                <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Estável</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderAnalyticsTab = () => {
    if (analyticsLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 border-2 border-[#5E81F4] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-[#8181A5] font-bold uppercase tracking-widest">Carregando Métricas e Funil...</p>
        </div>
      );
    }

    if (!analyticsSummary) {
      return (
        <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-[#ECECF2] dark:border-slate-800 text-center">
          <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhum evento registrado no funil de conversão ainda.</p>
        </div>
      );
    }

    const { eventsList } = analyticsSummary;

    // In-memory filtering by date
    const filteredEvents = eventsList.filter(e => {
      if (!e.timestamp) return true;
      const eventDate = new Date(e.timestamp);
      const now = new Date();
      
      if (analyticsDateFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return eventDate >= today;
      }
      if (analyticsDateFilter === '7days') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return eventDate >= past7;
      }
      if (analyticsDateFilter === '30days') {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return eventDate >= past30;
      }
      if (analyticsDateFilter === 'custom') {
        if (analyticsStartDate) {
          const start = new Date(analyticsStartDate + 'T00:00:00');
          if (eventDate < start) return false;
        }
        if (analyticsEndDate) {
          const end = new Date(analyticsEndDate + 'T23:59:59');
          if (eventDate > end) return false;
        }
      }
      return true;
    });

    // Dynamic Recalculation based on filtered events
    const uniqueSessions = new Set<string>();
    const chatClickSessions = new Set<string>();
    const messageSendSessions = new Set<string>();
    const conversionSessions = new Set<string>();

    const sessionEvents = new Map<string, string[]>();

    filteredEvents.forEach(e => {
      uniqueSessions.add(e.sessionId);
      if (e.eventType === 'chat_click') chatClickSessions.add(e.sessionId);
      if (e.eventType === 'message_send') messageSendSessions.add(e.sessionId);
      if (e.eventType === 'conversion') conversionSessions.add(e.sessionId);

      if (!sessionEvents.has(e.sessionId)) {
        sessionEvents.set(e.sessionId, []);
      }
      sessionEvents.get(e.sessionId)!.push(e.eventType);
    });

    let bounceCount = 0;
    sessionEvents.forEach((types) => {
      const hasInteractions = types.some(t => t === 'chat_click' || t === 'message_send' || t === 'conversion');
      if (!hasInteractions) {
        bounceCount++;
      }
    });

    const totalVisitors = uniqueSessions.size;
    const bounceRate = totalVisitors > 0 ? Math.round((bounceCount / totalVisitors) * 100) : 0;
    const chatClicks = chatClickSessions.size;
    const messageSends = messageSendSessions.size;
    const conversions = conversionSessions.size;

    // Funnel percentages based on totalVisitors
    const engRate = totalVisitors > 0 ? Math.round((chatClicks / totalVisitors) * 100) : 0;
    const msgRate = totalVisitors > 0 ? Math.round((messageSends / totalVisitors) * 100) : 0;
    const convRate = totalVisitors > 0 ? Math.round((conversions / totalVisitors) * 100) : 0;

    return (
      <div className="space-y-10 animate-fadeIn">
        {/* Date Filter Selection Panel */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="space-y-1">
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Período de Análise</h4>
            <p className="text-[10px] text-[#8181A5] dark:text-slate-500 font-semibold">Selecione o intervalo de tempo para atualizar o funil.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'today', label: 'Hoje' },
              { id: '7days', label: '7 Dias' },
              { id: '30days', label: '30 Dias' },
              { id: 'custom', label: 'Personalizado' },
            ].map(f => {
              const isSelected = analyticsDateFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAnalyticsDateFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#5E81F4] text-white shadow-md shadow-[#5E81F4]/20 border border-transparent'
                      : 'bg-[#F6F6F6] dark:bg-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-750 border border-transparent'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {analyticsDateFilter === 'custom' && (
            <div className="flex items-center gap-3 animate-fadeIn">
              <div className="flex flex-col space-y-1">
                <span className="text-[8px] font-bold text-[#8181A5] uppercase tracking-wider">Início</span>
                <input
                  type="date"
                  value={analyticsStartDate}
                  onChange={e => setAnalyticsStartDate(e.target.value)}
                  className="px-2.5 py-1 bg-[#F6F6F6] dark:bg-slate-800 border border-[#ECECF2] dark:border-slate-750 rounded-lg text-[10px] text-slate-700 dark:text-slate-300 outline-none font-bold cursor-pointer"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <span className="text-[8px] font-bold text-[#8181A5] uppercase tracking-wider">Fim</span>
                <input
                  type="date"
                  value={analyticsEndDate}
                  onChange={e => setAnalyticsEndDate(e.target.value)}
                  className="px-2.5 py-1 bg-[#F6F6F6] dark:bg-slate-800 border border-[#ECECF2] dark:border-slate-750 rounded-lg text-[10px] text-slate-700 dark:text-slate-300 outline-none font-bold cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Visitors Card */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Visitantes Únicos</p>
              <Users className="w-4 h-4 text-[#9698D6] shrink-0" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{totalVisitors}</h3>
            <p className="text-[10px] text-[#8181A5] dark:text-slate-500 font-semibold">Total de sessões ativas no navegador</p>
          </div>

          {/* Engagement Card */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Cliques no Atendimento</p>
              <MousePointerClick className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{chatClicks}</h3>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{engRate}% de taxa de clique no chat</p>
          </div>

          {/* Bounce Rate Card */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Taxa de Rejeição (Bounce)</p>
              <TrendingDown className="w-4 h-4 text-[#FF808B] shrink-0" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{bounceRate}%</h3>
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">Saíram do site sem interagir</p>
          </div>

          {/* Conversions Card */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Leads Convertidos</p>
              <Award className="w-4 h-4 text-[#5E81F4] shrink-0" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{conversions}</h3>
            <p className="text-[10px] text-[#5E81F4] dark:text-blue-400 font-bold">{convRate}% de conversão para CRM</p>
          </div>
        </div>

        {/* Funnel & Conversion Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Funnel Card */}
          <div className="lg:col-span-7 p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm space-y-6">
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Funil de Conversão Comercial</h4>
              <p className="text-[11px] text-[#8181A5] dark:text-slate-500 mt-1">Eficácia das etapas desde a visita inicial até o fechamento.</p>
            </div>

            <div className="space-y-6">
              {/* Step 1: Acessos Totais */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-350">
                  <span>1. Visita à Página Inicial</span>
                  <span>100% ({totalVisitors} Acessos)</span>
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-800">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-[#5E81F4] rounded-lg transition-all duration-500 animate-pulse" style={{ width: '100%' }}></div>
                </div>
              </div>

              {/* Step 2: Cliques no Chat */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-350">
                  <span>2. Interesse (Clique no Chat)</span>
                  <span>{engRate}% ({chatClicks} Usuários)</span>
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-800">
                  <div className="h-full bg-gradient-to-r from-[#5E81F4] to-indigo-500 rounded-lg transition-all duration-500" style={{ width: `${Math.max(engRate, 2)}%` }}></div>
                </div>
              </div>

              {/* Step 3: Mensagens Enviadas */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-350">
                  <span>3. Engajamento (Mensagem à IA)</span>
                  <span>{msgRate}% ({messageSends} Conversas)</span>
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-800">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-[#9698D6] rounded-lg transition-all duration-500" style={{ width: `${Math.max(msgRate, 2)}%` }}></div>
                </div>
              </div>

              {/* Step 4: Leads Convertidos */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-350">
                  <span>4. Conversão (Login/Cadastro)</span>
                  <span>{convRate}% ({conversions} Leads no CRM)</span>
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-800">
                  <div className="h-full bg-gradient-to-r from-[#9698D6] to-emerald-500 rounded-lg transition-all duration-500" style={{ width: `${Math.max(convRate, 2)}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Log Card */}
          <div className="lg:col-span-5 p-6 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-sm flex flex-col space-y-4">
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Log de Eventos no Período</h4>
              <p className="text-[11px] text-[#8181A5] dark:text-slate-500 mt-1">Atividades registradas no intervalo selecionado.</p>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 space-y-3 scrollbar-thin">
              {filteredEvents.slice(0, 100).map(e => {
                let label = 'Acesso à Página';
                let colorClass = 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-450';
                if (e.eventType === 'chat_click') {
                  label = 'Clique no Atendimento';
                  colorClass = 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400';
                } else if (e.eventType === 'message_send') {
                  label = 'Mensagem Enviada';
                  colorClass = 'border-[#9698D6] bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400';
                } else if (e.eventType === 'conversion') {
                  label = 'Lead Convertido (CRM)';
                  colorClass = 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400';
                }

                return (
                  <div key={e.id} className={`p-3 border-l-2 rounded-r-lg ${colorClass} flex items-center justify-between text-[10px] font-bold uppercase tracking-wider`}>
                    <div className="space-y-1">
                      <p className="font-black text-slate-800 dark:text-slate-200">{label}</p>
                      <p className="text-[9px] text-[#8181A5] dark:text-slate-500 font-mono font-normal normal-case">Sessão: {e.sessionId.substring(0, 15)}...</p>
                    </div>
                    <span className="text-[9px] text-[#8181A5] dark:text-slate-500 font-normal">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}

              {filteredEvents.length === 0 && (
                <p className="text-xs text-[#8181A5] dark:text-slate-500 italic text-center py-10">Nenhum evento registrado no período.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAjustesIaTab = () => {
    return (
      <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm space-y-8 animate-fadeIn max-w-2xl mx-auto select-none">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Ajustes do Assistente de IA
          </h3>
          <p className="text-xs text-[#8181A5] mt-1 font-medium">
            Configure as chaves de acesso, modelos locais e provedores de nuvem para o cérebro do SeguraBot.
          </p>
        </div>

        {/* Provedor Selector: Button Group navigation instead of Radios */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Provedor de IA Ativo
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setProvider('gemini')}
              className={`flex-1 py-3.5 px-4 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                provider === 'gemini'
                  ? 'bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm shadow-[#5E81F4]/10'
                  : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Cloud (Gemini Pro)
            </button>
            <button
              type="button"
              onClick={() => setProvider('ollama')}
              className={`flex-1 py-3.5 px-4 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                provider === 'ollama'
                  ? 'bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm shadow-[#5E81F4]/10'
                  : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Local (Ollama Offline)
            </button>
          </div>
        </div>

        {/* Gemini configuration */}
        {provider === 'gemini' && (
          <div className="space-y-4 border-t border-[#ECECF2] dark:border-slate-850 pt-6 animate-fadeIn">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                Chave de API Gemini (Google Cloud)
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Inserir chave do desenvolvedor (AIzaSy...)"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 placeholder:text-[#8181A5]/40 transition-all font-mono"
                />
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-normal">
                  Chave mantida sob criptografia no LocalStorage do seu navegador.
                </span>
                {geminiApiKey && (
                  <button
                    type="button"
                    onClick={() => setGeminiApiKey('')}
                    className="text-[9px] text-rose-500 hover:text-rose-600 font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Limpar Chave
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                Modelo Cloud Padrão
              </label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 font-sans font-bold cursor-pointer transition-all"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Super Rápido, Preciso & Econômico)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Raciocínio & Resolução Complexa)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Alta Precisão Multimodal)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Rápido & Leve - Legado)</option>
              </select>
            </div>
          </div>
        )}

        {/* Ollama Configuration */}
        {provider === 'ollama' && (
          <div className="space-y-4 border-t border-[#ECECF2] dark:border-slate-850 pt-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Status do Servidor Local
              </span>
              <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${
                ollamaOnline
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              }`}>
                {ollamaOnline ? 'Conectado (Online)' : 'Offline (Não Detectado)'}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                Endereço do Servidor Ollama
              </label>
              <input
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 font-sans font-bold cursor-pointer transition-all"
              />
              <p className="text-[9px] text-slate-400 dark:text-slate-500 font-normal leading-relaxed">
                Use `http://localhost:11434` para testes no seu computador. Para atender clientes reais em produção, insira um endereço público (ex: ngrok, Cloudflare ou servidor VPS).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                Modelo Local Selecionado
              </label>
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 font-sans font-bold cursor-pointer transition-all"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                ) : (
                  <>
                    <option value="llama3">llama3 (Recomendado)</option>
                    <option value="gemma">gemma</option>
                    <option value="mistral">mistral</option>
                    <option value="phi3">phi3</option>
                  </>
                )}
              </select>
            </div>

            {!ollamaOnline && (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-850 rounded-xl space-y-2">
                <p className="text-[10px] text-rose-500 leading-tight font-bold uppercase tracking-wider">
                  Nenhum serviço Ollama rodando localmente
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal leading-relaxed">
                  Por favor, certifique-se de que o Ollama esteja ativo na porta padrão 11434 (`http://localhost:11434`) do seu computador e de que tenha baixado algum modelo (ex: `ollama run llama3`).
                </p>
                <button
                  type="button"
                  onClick={fetchOllamaModels}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-[#5E81F4] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Tentar Conectar
                </button>
              </div>
            )}
          </div>
        )}


        {/* Ajustes de Voz (TTS) Section */}
        <div className="border-t border-[#ECECF2] dark:border-slate-850 pt-6 space-y-6">
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Ajustes do Assistente de Voz (TTS)
            </h4>
            <p className="text-[11px] text-[#8181A5] mt-1 font-medium leading-normal">
              Gerencie o provedor de Text-to-Speech e a entonação da voz para as respostas faladas do SeguraBot.
            </p>
          </div>

          {/* TTS Provider Choice using styled pills */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Provedor de Voz Ativo
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTtsProvider('native')}
                className={`flex-1 py-3.5 px-4 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                  ttsProvider === 'native'
                    ? 'bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm shadow-[#5E81F4]/10'
                    : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Voz Nativa do Navegador (Grátis)
              </button>
              <button
                type="button"
                onClick={() => setTtsProvider('elevenlabs')}
                className={`flex-1 py-3.5 px-4 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                  ttsProvider === 'elevenlabs'
                    ? 'bg-[#5E81F4] text-white border-[#5E81F4] shadow-sm shadow-[#5E81F4]/10'
                    : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                ElevenLabs (Premium)
              </button>
            </div>
          </div>

          {/* Native configuration options */}
          {ttsProvider === 'native' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Prioridade de Voz do Navegador
                </label>
                <select
                  value={ttsVoiceKeyword}
                  onChange={(e) => setTtsVoiceKeyword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 font-sans font-bold cursor-pointer transition-all"
                >
                  <option value="google">Voz Google (Mais Suave/Chrome)</option>
                  <option value="online">Vozes Online (Natural/Edge)</option>
                  <option value="natural">Vozes Naturais (Premium)</option>
                  <option value="all">Padrão do Sistema Operacional</option>
                </select>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-relaxed font-normal">
                  Filtro inteligente que busca automaticamente as melhores vozes instaladas no dispositivo do visitante.
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                    Velocidade de Leitura (TTS)
                  </label>
                  <span className="text-[10px] font-bold text-[#5E81F4] bg-[#5E81F4]/10 px-2 py-0.5 rounded-md font-mono">
                    {ttsRate.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={ttsRate}
                  onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5E81F4]"
                />
                <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 font-mono">
                  <span>0.50x (Lento)</span>
                  <span>1.05x (Recomendado)</span>
                  <span>2.00x (Rápido)</span>
                </div>
              </div>
            </div>
          )}

          {/* ElevenLabs configuration options */}
          {ttsProvider === 'elevenlabs' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Chave de API ElevenLabs
                </label>
                <input
                  type="password"
                  value={elevenLabsApiKey}
                  onChange={(e) => setElevenLabsApiKey(e.target.value)}
                  placeholder="Inserir chave ElevenLabs (sk_...)"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 placeholder:text-[#8181A5]/40 transition-all font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Voice ID Selecionado
                </label>
                <input
                  type="text"
                  value={elevenLabsVoiceId}
                  onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                  placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#5E81F4] dark:focus:border-[#5E81F4]/40 text-slate-700 dark:text-slate-200 placeholder:text-[#8181A5]/40 transition-all font-mono"
                />
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-relaxed font-normal">
                  Insira o ID de qualquer voz personalizada ou pré-configurada na sua conta ElevenLabs.
                </span>
              </div>
            </div>
          )}

          {/* Action Button: Salvar Alterações */}
          <div className="pt-4 border-t border-[#ECECF2]/50 dark:border-slate-850/50">
            <button
              type="button"
              onClick={() => {
                showNotification("Configurações de IA salvas com sucesso!", "success");
              }}
              className="w-full py-3.5 px-4 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm shadow-[#5E81F4]/10"
            >
              Salvar Alterações de IA
            </button>
          </div>

          {/* Test Voice Button */}
          <div className="pt-4 border-t border-[#ECECF2]/50 dark:border-slate-850/50">
            <button
              type="button"
              onClick={testVoice}
              className="w-full py-3.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 cursor-pointer"
            >
              Testar Voz Selecionada
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center font-normal leading-normal">
              Esta é exatamente a mesma voz que o visitante ouvirá no chat e a que iniciará a conversação.
            </p>
          </div>

          {/* Danger Zone / Zona de Perigo */}
          <div className="pt-6 border-t border-rose-100 dark:border-rose-950/20 space-y-4">
            <div className="space-y-1 text-left">
              <h3 className="text-xs font-bold text-rose-500 uppercase tracking-widest">
                Zona de Perigo
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-normal">
                Ações críticas de administração do sistema. Apague de forma permanente os históricos de chats, mensagens, chamados de suporte e dados estatísticos.
              </p>
            </div>
            
            <button
              type="button"
              onClick={handleResetConfirm}
              className="w-full py-3.5 px-4 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/10 text-rose-500 border border-rose-200 dark:border-rose-900/40 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm shadow-rose-500/5 hover:border-rose-300"
            >
              Zerar Todas as Interações e Históricos
            </button>
          </div>
        </div>
      </div>
    );
  };

  const isChatTab = activeTab === 'chat';

  return (
    <div className={`flex-grow flex-1 flex flex-col ${isChatTab ? 'h-full overflow-hidden' : 'overflow-y-auto'} bg-[#F6F6F6] dark:bg-slate-950 p-4 md:p-6 py-4 md:py-5 scrollbar-thin font-sans`}>
      <div className={`max-w-6xl mx-auto ${isChatTab ? 'flex-grow flex flex-col h-full w-full min-h-0 space-y-4 md:space-y-6' : 'space-y-8 w-full'}`}>
        
        {/* Mobile Header with Back Button */}
        {onBack && (
          <div className="lg:hidden flex justify-between items-center w-full pb-2 border-b border-[#ECECF2] dark:border-slate-800">
            <button
              onClick={onBack}
              className="text-xs font-bold text-[#5E81F4] uppercase tracking-wider cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar para abas</span>
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('openMobileMenu'));
              }}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-[10px] font-bold text-[#5E81F4] uppercase tracking-wider rounded-lg cursor-pointer shadow-sm"
            >
              Menu
            </button>
          </div>
        )}
        
        {/* Header Section (Ocultada na aba de chat e ajustes para foco e tela útil máxima de suporte) */}
        {activeTab !== 'chat' && activeTab !== 'ajustes_ia' && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-[#ECECF2] dark:border-slate-800 pb-6 select-none animate-fadeIn">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
                {getHeaderContent().title}
              </h1>
              <p className="text-sm text-[#8181A5] dark:text-slate-400 leading-relaxed max-w-2xl font-normal">
                {getHeaderContent().description}
              </p>
            </div>
            {activeTab === 'dados' && currentRole !== 'cliente' && (
              <button 
                onClick={saveProfile} 
                className="px-6 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-lg text-sm font-bold tracking-wide transition-all duration-200 shadow-sm hover:shadow-md shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            )}
          </div>
        )}

        {/* Dashboard Quick Stats Bar (Ocultada na aba de chat e ajustes para foco e tela útil máxima de suporte) */}
        {activeTab !== 'chat' && activeTab !== 'ajustes_ia' && renderStatsBar()}

        {/* Main Content Area (Full width as navigation is now in the global Coluna 2 sidebar) */}
        <div className={`flex-1 flex flex-col ${isChatTab ? 'min-h-0 h-full' : 'gap-6'} w-full`}>
            {/* Sticky Customer Header */}
            {(activeTab === 'dados' || activeTab === 'chamados') && (
              <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 px-6 py-4 rounded-2xl border border-[#ECECF2] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none shadow-sm transition-all duration-200 animate-fadeIn">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Cliente Ativo:</span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-white">{name}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Fidelidade:</span>
                  <span className="text-xs font-extrabold text-[#5E81F4]">{tier}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Risco:</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    riskScore < 30 ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' : riskScore < 70 ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {riskScore}%
                  </span>
                </div>
                
                {activeTab === 'dados' && currentRole !== 'cliente' && (
                  <button 
                    onClick={saveProfile} 
                    className="px-5 py-2.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 shrink-0 cursor-pointer shadow-sm hover:shadow-md flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Alterações</span>
                  </button>
                )}
              </div>
            )}

            {/* Active Tab Container */}
            <div className={`flex-1 w-full ${isChatTab ? 'min-h-0 h-full flex flex-col' : ''}`}>
              {/* Tab 1: Dados e Contratos */}
              {activeTab === 'dados' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
                  
                  {/* Column 1: Profile, Coverage & Documents - col-span-7 */}
                  <div className="lg:col-span-7 space-y-8">
                    
                    {/* Dados Básicos */}
                    <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                      <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Dados Básicos do Cliente</h2>
                      </div>
                      
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Nome Completo</label>
                            <input 
                              value={name} 
                              onChange={e => setName(e.target.value)} 
                              disabled={currentRole === 'cliente'}
                              className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50 disabled:opacity-75 disabled:cursor-not-allowed"
                              placeholder="Nome do Segurado"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Telefone de Contato</label>
                            <input 
                              value={phone} 
                              onChange={e => setPhone(e.target.value)} 
                              disabled={currentRole === 'cliente'}
                              className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50 disabled:opacity-75 disabled:cursor-not-allowed"
                              placeholder="(XX) XXXXX-XXXX"
                            />
                          </div>
                        </div>

                        {/* Loyalty Tier Selector (Stylized Buttons) */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Nível de Fidelidade (Loyalty Tier)</label>
                          <div className="flex flex-wrap gap-2">
                            {loyaltyTiers.map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => { if (currentRole !== 'cliente') setTier(t); }}
                                disabled={currentRole === 'cliente'}
                                className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 ${
                                  tier === t 
                                    ? 'bg-[#5E81F4] text-white border border-transparent shadow-sm shadow-[#5E81F4]/10' 
                                    : 'bg-[#F6F6F6] dark:bg-slate-950 text-[#8181A5] hover:bg-[#ECECF2] dark:hover:bg-slate-900 border border-transparent dark:border-slate-800'
                                } ${currentRole === 'cliente' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Life Stage Selector (Stylized Buttons) */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Fase da Vida (Life Stage)</label>
                          <div className="flex flex-wrap gap-2">
                            {lifeStages.map(stage => (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => { if (currentRole !== 'cliente') setLifeStage(stage); }}
                                disabled={currentRole === 'cliente'}
                                className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                                  lifeStage === stage 
                                    ? 'bg-[#5E81F4] text-white border border-transparent shadow-sm shadow-[#5E81F4]/10' 
                                    : 'bg-[#F6F6F6] dark:bg-slate-950 text-[#8181A5] hover:bg-[#ECECF2] dark:hover:bg-slate-900 border border-transparent dark:border-slate-800'
                                } ${currentRole === 'cliente' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {stage}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Risk Score */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Score de Risco Sinistral (Risk Score: {riskScore}%)</label>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono ${
                              riskScore < 30 ? 'bg-[#7CE7AC]/15 text-[#7CE7AC]' : riskScore < 70 ? 'bg-[#F4BE5E]/15 text-[#F4BE5E]' : 'bg-[#FF808B]/15 text-[#FF808B]'
                            }`}>
                              {riskScore < 30 ? 'Baixo' : riskScore < 70 ? 'Médio' : 'Alto Risco'}
                            </span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={riskScore} 
                            onChange={e => setRiskScore(parseInt(e.target.value))} 
                            disabled={currentRole === 'cliente'}
                            className="w-full h-1.5 bg-[#ECECF2] dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5E81F4] disabled:opacity-75 disabled:cursor-not-allowed" 
                          />
                        </div>

                        {/* Nível de Acesso (Cargo) */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Nível de Acesso (Cargo)</label>
                          {currentRole === 'admin' ? (
                            <div className="flex flex-wrap gap-2">
                              {['cliente', 'atendente', 'admin'].map(r => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setRole(r as any)}
                                  className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 cursor-pointer ${
                                    role === r 
                                      ? 'bg-[#5E81F4] text-white border border-transparent shadow-sm shadow-[#5E81F4]/10' 
                                      : 'bg-[#F6F6F6] dark:bg-slate-950 text-[#8181A5] hover:bg-[#ECECF2] dark:hover:bg-slate-900 border border-transparent dark:border-slate-800'
                                  }`}
                                >
                                  {r === 'cliente' ? 'Cliente' : r === 'atendente' ? 'Atendente' : 'Administrador'}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="pt-1">
                              <span className="px-4 py-2.5 bg-[#F6F6F6] dark:bg-slate-950 text-slate-700 dark:text-slate-350 border border-transparent dark:border-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider select-none font-sans inline-block">
                                {role === 'admin' ? 'Administrador' : role === 'atendente' ? 'Atendente' : 'Cliente'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Apólices Ativas Simples (Tags) */}
                    <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5 hover:shadow-md transition-shadow duration-300">
                      <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Apólices Ativas (Tags de Roteamento)</h2>
                      </div>

                      <div className="space-y-4">
                        {currentRole !== 'cliente' && (
                          <div className="flex gap-2">
                            <input 
                              value={newPolicy} 
                              onChange={e => setNewPolicy(e.target.value)} 
                              placeholder="Ex: Vida, Viagem, Residencial..." 
                              className="flex-1 px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPolicy(); } }}
                            />
                            <button 
                              onClick={addPolicy} 
                              className="px-5 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm cursor-pointer"
                            >
                              Adicionar
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {policies.map(p => (
                            <span 
                              key={p} 
                              className="pl-3 pr-2 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 rounded-lg border border-[#ECECF2] dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2 select-none group"
                            >
                              {p}
                              {currentRole !== 'cliente' && (
                                <button 
                                  onClick={() => removePolicy(p)} 
                                  className="text-[#FF808B] hover:text-red-700 transition-colors font-bold text-[10px] cursor-pointer"
                                >
                                  x
                                </button>
                              )}
                            </span>
                          ))}
                          {policies.length === 0 && (
                            <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhuma apólice vinculada ao cliente.</p>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Documentos Digitalizados */}
                    <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                      <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Documentos Digitalizados (OCR)</h2>
                        <button 
                          onClick={triggerFileSelect} 
                          className="text-xs font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>Anexar Documento</span>
                        </button>
                        <input 
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".pdf,image/*"
                          className="hidden"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {documentsList.map((d, idx) => (
                          <div 
                            key={d.id} 
                            className="p-5 bg-[#F6F6F6] dark:bg-slate-800 rounded-lg border border-[#ECECF2] dark:border-slate-800 relative group flex flex-col justify-between gap-4 animate-fadeIn"
                          >
                            <button 
                              onClick={() => removeDocument(d.id)} 
                              className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer flex items-center gap-1"
                              title="Remover Documento"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Excluir</span>
                            </button>

                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Tipo de Documento</label>
                                <select 
                                  value={d.type} 
                                  onChange={e => {
                                    const newDocs = [...documentsList];
                                    newDocs[idx].type = e.target.value;
                                    setDocumentsList(newDocs);
                                  }} 
                                  className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 font-bold outline-none cursor-pointer"
                                >
                                  <option value="CNH">CNH (Motorista)</option>
                                  <option value="CRLV">CRLV (Veículo)</option>
                                  <option value="RG">RG (Identidade)</option>
                                  <option value="Comprovante">Comprovante de Residência</option>
                                  <option value="Laudo">Laudo Médico (Saúde)</option>
                                  <option value="Outro">Outro Documento</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Dados Extraídos (OCR)</label>
                                <textarea 
                                  value={d.extractedData || ''} 
                                  onChange={e => {
                                    const newDocs = [...documentsList];
                                    newDocs[idx].extractedData = e.target.value;
                                    setDocumentsList(newDocs);
                                  }} 
                                  rows={3}
                                  placeholder="Dados extraídos do documento..."
                                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded text-[11px] text-slate-700 dark:text-slate-300 font-semibold outline-none focus:border-[#5E81F4] resize-y"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => extractDataFromDoc(d.id)}
                              disabled={isExtractingOcr[d.id]}
                              className="w-full py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white border border-transparent rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {isExtractingOcr[d.id] ? 'Extraindo dados...' : 'Gerar OCR por IA'}
                            </button>
                          </div>
                        ))}

                        {documentsList.length === 0 && (
                          <div className="col-span-2 text-center py-8 border border-dashed border-[#ECECF2] dark:border-slate-800 rounded-lg bg-[#F6F6F6]/30 dark:bg-transparent">
                            <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhum documento digitalizado. Anexe arquivos acima para realizar a extração OCR.</p>
                          </div>
                        )}
                      </div>
                    </section>

                  </div>

                  {/* Column 2: Advanced Policies, Claims, AI Summary & Support - col-span-5 */}
                  <div className="lg:col-span-5 space-y-8">
                    
                    {/* Resumo Omnichannel (IA) */}
                    {currentRole !== 'cliente' && (
                      <section className="bg-gradient-to-br from-[#5E81F4]/5 to-[#9698D6]/5 dark:from-[#5E81F4]/5 dark:to-[#9698D6]/3 p-6 rounded-lg shadow-sm border border-[#5E81F4]/20 dark:border-[#5E81F4]/10 space-y-5 hover:shadow-md transition-shadow duration-300">
                        <div className="flex items-center justify-between">
                          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider font-semibold">Resumo Omnichannel AI</h2>
                          <button 
                            onClick={generateAiSummary} 
                            disabled={isGeneratingSummary}
                            className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-[#F6F6F6] dark:hover:bg-slate-700 text-[#5E81F4] dark:text-[#5E81F4] rounded-lg text-xs font-bold transition-all border border-[#ECECF2] dark:border-slate-700 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${isGeneratingSummary ? 'animate-pulse' : ''}`} />
                            <span>{isGeneratingSummary ? 'Consolidando...' : 'Consolidar Histórico'}</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                            Este bloco armazena o dossiê do cliente resumido dinamicamente por IA para dar contexto instantâneo ao chatbot em qualquer canal (Chat, WhatsApp, Voz).
                          </p>
                          
                          <textarea 
                            value={aiSummary} 
                            onChange={e => setAiSummary(e.target.value)} 
                            rows={5} 
                            placeholder="Cole ou gere o resumo analítico da IA aqui..." 
                            className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-700 dark:text-slate-300 transition-all leading-relaxed font-bold"
                          />
                        </div>
                      </section>
                    )}

                    {/* Apólices Detalhadas (Advanced Policies) */}
                    <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                      <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Contratos de Seguro (Apólices)</h2>
                        {currentRole !== 'cliente' && (
                          <button 
                            onClick={addDetailedPolicy} 
                            className="text-xs font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Novo Contrato</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-5">
                        {detailedPolicies.map((p, idx) => (
                          <div 
                            key={p.id} 
                            className="p-5 bg-[#F6F6F6] dark:bg-slate-950/20 rounded-lg border border-[#ECECF2] dark:border-slate-800 space-y-4 relative group"
                          >
                            {currentRole !== 'cliente' && (
                              <button 
                                onClick={() => removeDetailedPolicy(p.id)} 
                                className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer"
                                title="Remover Apólice"
                              >
                                Excluir
                              </button>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Ramo de Cobertura</label>
                                <select 
                                  value={p.type} 
                                  onChange={e => {
                                    const newPolicies = [...detailedPolicies];
                                    newPolicies[idx].type = e.target.value;
                                    setDetailedPolicies(newPolicies);
                                  }} 
                                  disabled={currentRole === 'cliente'}
                                  className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 font-bold outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                                >
                                  <option value="Auto">Auto (Automotivo)</option>
                                  <option value="Vida">Vida (Pessoas)</option>
                                  <option value="Residencial">Residencial (Patrimônio)</option>
                                  <option value="Saúde">Saúde (Médico/Hosp)</option>
                                  <option value="Dental">Odontológico (Saúde)</option>
                                  <option value="Viagem">Viagem (Turismo)</option>
                                </select>
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Valor do Prêmio Mensal</label>
                                <input 
                                  type="number" 
                                  value={p.premiumValue} 
                                  onChange={e => {
                                    const newPolicies = [...detailedPolicies];
                                    newPolicies[idx].premiumValue = parseFloat(e.target.value) || 0;
                                    setDetailedPolicies(newPolicies);
                                  }} 
                                  disabled={currentRole === 'cliente'}
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold disabled:opacity-75 disabled:cursor-not-allowed" 
                                  placeholder="R$ 1500" 
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Objeto / Bem Segurado</label>
                              <input 
                                value={p.assetDescription} 
                                onChange={e => {
                                  const newPolicies = [...detailedPolicies];
                                  newPolicies[idx].assetDescription = e.target.value;
                                  setDetailedPolicies(newPolicies);
                                }} 
                                disabled={currentRole === 'cliente'}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold disabled:opacity-75 disabled:cursor-not-allowed" 
                                placeholder="Ex: Corolla XEI 2023 / Placa ABC-1234" 
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Limite de Indenização (LMG)</label>
                                <input 
                                  value={p.coverageLimits} 
                                  onChange={e => {
                                    const newPolicies = [...detailedPolicies];
                                    newPolicies[idx].coverageLimits = e.target.value;
                                    setDetailedPolicies(newPolicies);
                                  }} 
                                  disabled={currentRole === 'cliente'}
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold disabled:opacity-75 disabled:cursor-not-allowed" 
                                  placeholder="Ex: 100k terceiros / FIPE" 
                                />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Data de Expiração</label>
                                <input 
                                  type="date" 
                                  value={p.expirationDate} 
                                  onChange={e => {
                                    const newPolicies = [...detailedPolicies];
                                    newPolicies[idx].expirationDate = e.target.value;
                                    setDetailedPolicies(newPolicies);
                                  }} 
                                  disabled={currentRole === 'cliente'}
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-700 dark:text-slate-300 font-semibold cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed" 
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {detailedPolicies.length === 0 && (
                          <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhum contrato formal de seguro cadastrado.</p>
                        )}
                      </div>
                    </section>

                    {/* Histórico de Sinistros */}
                    <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                      <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Histórico de Sinistros</h2>
                        <button 
                          onClick={addClaim} 
                          className="text-xs font-bold text-[#F4BE5E] hover:text-[#F4BE5E]/80 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span>Reportar Sinistro</span>
                        </button>
                      </div>

                      <div className="space-y-5">
                        {claimsList.map((c, idx) => (
                          <div 
                            key={c.id} 
                            className="p-5 bg-[#F6F6F6] dark:bg-orange-500/[0.02] rounded-lg border border-[#ECECF2] dark:border-orange-900/20 space-y-4 relative group"
                          >
                            {currentRole !== 'cliente' && (
                              <button 
                                onClick={() => removeClaim(c.id)} 
                                className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer"
                                title="Remover Sinistro"
                              >
                                Excluir
                              </button>
                            )}
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Apólice Vinculada</label>
                                {detailedPolicies.length === 0 ? (
                                  <div className="w-full px-3 py-2 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-900/30 rounded-lg text-[10px] text-[#FF808B] font-bold uppercase tracking-wider">
                                    Nenhuma Apólice Cadastrada
                                  </div>
                                ) : (
                                  <select
                                    value={c.policyId}
                                    onChange={e => {
                                      const newClaims = [...claimsList];
                                      newClaims[idx].policyId = e.target.value;
                                      setClaimsList(newClaims);
                                    }}
                                    disabled={currentRole === 'cliente'}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                                  >
                                    <option value="sem-apolice">Sem vínculo específico</option>
                                    {detailedPolicies.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.type} - {p.assetDescription || 'Sem Descrição'} ({p.coverageLimits || 'Sem Limite'})
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Descrição do Evento</label>
                                <input 
                                  value={c.description} 
                                  onChange={e => {
                                    const newClaims = [...claimsList];
                                    newClaims[idx].description = e.target.value;
                                    setClaimsList(newClaims);
                                  }} 
                                  disabled={currentRole === 'cliente'}
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold disabled:opacity-75 disabled:cursor-not-allowed" 
                                  placeholder="Ex: Colisão traseira na rodovia" 
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-2">
                              <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Status de Processamento</label>
                              <div className="flex flex-wrap gap-1.5">
                                {claimStatuses.map(st => {
                                  const isSelected = c.status === st.value;
                                  let activeClass = 'bg-[#ECECF2] text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                                  if (isSelected) {
                                    if (st.value === 'aberto' || st.value === 'em_analise' || st.value === 'vistoria') {
                                      activeClass = 'bg-[#F4BE5E] text-white shadow-sm';
                                    } else if (st.value === 'aprovado' || st.value === 'pago') {
                                      activeClass = 'bg-[#7CE7AC] text-white shadow-sm';
                                    } else if (st.value === 'recusado') {
                                      activeClass = 'bg-[#FF808B] text-white shadow-sm';
                                    }
                                  }

                                  return (
                                    <button
                                      key={st.value}
                                      type="button"
                                      onClick={() => {
                                        if (currentRole !== 'cliente') {
                                          const newClaims = [...claimsList];
                                          newClaims[idx].status = st.value;
                                          setClaimsList(newClaims);
                                        }
                                      }}
                                      disabled={currentRole === 'cliente'}
                                      className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all duration-200 ${
                                        isSelected
                                          ? activeClass
                                          : 'bg-white dark:bg-slate-900 text-[#8181A5] border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6] dark:hover:bg-slate-800'
                                      } ${currentRole === 'cliente' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                      {st.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {claimsList.length === 0 && (
                          <p className="text-xs text-[#8181A5] dark:text-slate-500 italic py-2">Nenhum sinistro em andamento ou registrado.</p>
                        )}
                      </div>
                    </section>

                  </div>

                </div>
              )}

              {/* Tab 2: Chamados de Suporte */}
              {activeTab === 'chamados' && (
                <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
                  {/* Tickets de Suporte */}
                  <section className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                    <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                      <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        {currentRole === 'cliente' ? 'Meus Chamados de Suporte' : 'Atendimentos e Chamados de Suporte'}
                      </h2>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <input 
                          value={newSubject} 
                          onChange={e => setNewSubject(e.target.value)} 
                          placeholder="Assunto do novo ticket..." 
                          className="flex-1 px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTicket(); } }}
                        />
                        <button 
                          onClick={createTicket} 
                          disabled={!newSubject.trim()}
                          className="px-5 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 disabled:opacity-50 text-white border border-transparent rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm cursor-pointer"
                        >
                          Abrir Chamado
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        {tickets.map(t => (
                          <div 
                            key={t.id} 
                            className="p-5 bg-[#F6F6F6] dark:bg-slate-800/20 rounded-lg border border-[#ECECF2] dark:border-slate-800 space-y-3"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed font-bold">{t.subject}</p>
                              
                              {currentRole === 'cliente' ? (
                                <div className="shrink-0 select-none">
                                  {t.status === 'fechado' ? (
                                    <span className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Resolvido
                                    </span>
                                  ) : t.status === 'em_andamento' ? (
                                    <span className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      Em Fila
                                    </span>
                                  ) : (
                                    <span className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      Aberto
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex gap-1 shrink-0 select-none">
                                  {['aberto', 'em_andamento', 'fechado'].map(st => {
                                    const isSelected = t.status === st;
                                    let activeClass = '';
                                    if (isSelected) {
                                      if (st === 'fechado') {
                                        activeClass = 'bg-[#7CE7AC] text-white shadow-sm';
                                      } else if (st === 'em_andamento') {
                                        activeClass = 'bg-[#F4BE5E] text-white shadow-sm';
                                      } else {
                                        activeClass = 'bg-[#FF808B] text-white shadow-sm';
                                      }
                                    }

                                    return (
                                      <button
                                        key={st}
                                        type="button"
                                        onClick={() => updateTicketStatus(t.id!, st)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                          isSelected
                                            ? activeClass
                                            : 'bg-white dark:bg-slate-900 text-[#8181A5] border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6] dark:hover:bg-slate-800'
                                        }`}
                                      >
                                        {st === 'em_andamento' ? 'Fila' : st === 'aberto' ? 'Aberto' : 'Fechado'}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            
                            {t.resolution && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-lg border border-[#ECECF2] dark:border-slate-800 leading-relaxed font-bold">
                                <strong className="text-[#7CE7AC] block mb-0.5 uppercase tracking-wider text-[9px]">Resolução Oficial:</strong> 
                                {t.resolution}
                              </div>
                            )}
                            
                            <p className="text-[10px] text-[#8181A5] font-bold uppercase tracking-wider">
                              Criado: {new Date(t.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                        
                        {tickets.length === 0 && (
                          <p className="text-xs text-[#8181A5] dark:text-slate-500 italic text-center py-6">Sem chamados de suporte abertos.</p>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* Tab 3: Chat em Tempo Real */}
              {activeTab === 'chat' && renderLiveChatTab()}

              {/* Tab 4: Base de Conhecimento (RAG) - Apenas Admin */}
              {activeTab === 'rag' && currentRole === 'admin' && renderRagTab()}

              {/* Tab 5: Analytics & Funil */}
              {activeTab === 'analytics' && renderAnalyticsTab()}

              {/* Tab 6: Ajustes IA - Apenas Admin */}
              {activeTab === 'ajustes_ia' && currentRole === 'admin' && renderAjustesIaTab()}
            </div>
          </div>
        </div>

        {/* Modal de Alerta / Confirmação Customizado Premium (Sem Emojis/Ícones) */}
        {customConfirm.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center select-none animate-fadeIn">
            <div 
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300"
              onClick={() => setCustomConfirm(prev => ({ ...prev, show: false }))}
            />
            <div className="relative bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-md w-full mx-4 space-y-6 transform scale-100 transition-all duration-300">
              <div className="space-y-3">
                <span className={`inline-block px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded ${
                  customConfirm.danger 
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' 
                    : 'bg-[#5E81F4]/10 text-[#5E81F4] border border-[#5E81F4]/20'
                }`}>
                  {customConfirm.danger ? 'Confirmação Crítica' : 'Aviso do Sistema'}
                </span>
                
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide leading-tight">
                  {customConfirm.title}
                </h3>
                
                <p className="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                  {customConfirm.message}
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCustomConfirm(prev => ({ ...prev, show: false }))}
                  className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomConfirm(prev => ({ ...prev, show: false }));
                    customConfirm.onConfirm();
                  }}
                  className={`px-5 py-2.5 text-white border border-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md ${
                    customConfirm.danger 
                      ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800 shadow-rose-500/10' 
                      : 'bg-[#5E81F4] hover:bg-[#5E81F4]/90 shadow-[#5E81F4]/10'
                  }`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Limpeza da Base (Apenas Admin) */}
        {showWipeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center select-none animate-fadeIn">
            {/* Backdrop com blur de alta fidelidade */}
            <div 
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300"
              onClick={() => {
                setShowWipeModal(false);
                setWipeConfirmText('');
              }}
            />
            
            {/* Box do Modal */}
            <div className="relative bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full mx-4 space-y-6 transform scale-100 transition-all duration-300">
              <div className="space-y-3">
                <span className="inline-block px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase tracking-widest rounded">
                  Ação Destrutiva Irreversível
                </span>
                
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide leading-tight">
                  Confirmar Exclusão Total da Base?
                </h3>
                
                <p className="text-xs text-slate-650 dark:text-slate-400 font-normal leading-relaxed">
                  ATENÇÃO: Você tem certeza que deseja EXCLUIR COMPLETAMENTE todas as perguntas, blocos semânticos (chunks) e fontes de conhecimento do RAG? Esta ação é irreversível e desindexará todas as informações permanentemente.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">
                  Para confirmar, digite <span className="font-mono text-rose-600 dark:text-rose-400">EXCLUIR</span> no campo abaixo:
                </label>
                <input
                  type="text"
                  value={wipeConfirmText}
                  onChange={e => setWipeConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                  className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#FF808B] text-slate-800 dark:text-slate-100 font-mono text-center tracking-widest font-bold transition-all"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWipeModal(false);
                    setWipeConfirmText('');
                  }}
                  className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={wipeConfirmText !== 'EXCLUIR'}
                  onClick={async () => {
                    setShowWipeModal(false);
                    setWipeConfirmText('');
                    await handleWipeKnowledgeBase();
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800 disabled:opacity-30 disabled:cursor-not-allowed text-white border border-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sistema de Notificação Customizado Premium (Sem Emojis/Ícones) */}
        {toast.show && (
          <div className={`fixed bottom-6 right-6 z-50 animate-fadeIn min-w-[320px] max-w-md bg-white dark:bg-slate-900 border-l-4 rounded-lg shadow-xl p-4 flex items-center justify-between gap-4 select-none transition-all duration-300 ${
            toast.type === 'success' 
              ? 'border-emerald-500 dark:border-emerald-400' 
              : toast.type === 'error' 
                ? 'border-rose-500 dark:border-rose-400' 
                : 'border-[#5E81F4] dark:border-[#5E81F4]'
          }`}>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">
                {toast.type === 'success' ? 'Sucesso' : toast.type === 'error' ? 'Erro no Sistema' : 'Aviso'}
              </p>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-normal">
                {toast.message}
              </p>
            </div>
            <button 
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="text-[10px] font-bold uppercase tracking-wider text-[#8181A5] hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer py-1 px-2 border border-[#ECECF2] dark:border-slate-800 rounded-md hover:bg-slate-50 dark:hover:bg-slate-950"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
  );
}
