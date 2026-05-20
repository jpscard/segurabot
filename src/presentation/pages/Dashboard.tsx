import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { auth, handleFirestoreError, logout } from '../../infrastructure/firebase';
import { ChatSession, Message, Role, OperationType } from '../../domain';
import { cn } from '../../utils/utils';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { uploadRealDataToKnowledgeBase } from '../../utils/seedKnowledgeBase';
import { uploadRealCrmData } from '../../utils/seedCrmData';
import { CrmAdmin } from './CrmAdmin';
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
  ArrowUp
} from 'lucide-react';

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
import { ProcessUserMessageUseCase } from '../../application/ProcessUserMessageUseCase';

export function Dashboard() {
  const [currentView, setCurrentView] = useState<'chat' | 'crm'>('chat');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { provider, setProvider } = useSettings();
  const { theme, setTheme } = useTheme();
  const user = auth.currentUser;

  // Estados para Modo Demo e Roles
  const [demoMode, setDemoMode] = useState(false);
  const [demoRole, setDemoRole] = useState<'cliente' | 'atendente' | 'admin'>('cliente');

  // Lógica Real de Roles
  const isRealAdmin = user?.email?.endsWith('@segurabot.com.br') || user?.email === 'admin@segurabot.com.br';
  const isRealAtendente = user?.email === 'atendente@segurabot.com.br';
  
  // Role Atual (usa demo se ativo, senão usa a real)
  const currentRole = demoMode ? demoRole : (isRealAdmin ? 'admin' : (isRealAtendente ? 'atendente' : 'cliente'));

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
      const aiService = provider === 'ollama' ? ollamaService : geminiService;
      const useCase = new ProcessUserMessageUseCase(chatRepo, aiService, kbRepo, customerRepo);

      await useCase.execute(user.uid, targetSession.id, userMessageContent, (chunk) => {
        setStreamingText(prev => prev + chunk);
      });

      setStreamingText('');
      setIsLoading(false);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F6F6F6] dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 font-sans">
      
      {/* COLUNA 1: Slim Navigation Sidebar (Figma Dashboard 02) */}
      <aside className="w-[76px] bg-slate-900 dark:bg-slate-950 flex flex-col items-center justify-between py-6 border-r border-slate-800/30 z-20 shrink-0 select-none">
        
        {/* Brand Circle Logo */}
        <div className="flex flex-col items-center gap-6 w-full">
          <div className="w-12 h-12 rounded-2xl bg-[#5E81F4] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#5E81F4]/20 tracking-tight">
            S
          </div>
          
          <div className="w-8 h-[1px] bg-slate-800/60 dark:bg-slate-800/30" />
          
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
                  "p-3 rounded-xl transition-all duration-200 outline-none",
                  currentView === 'chat' 
                    ? "bg-slate-800 dark:bg-slate-900 text-[#5E81F4]" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                )}
                title="Assistente Virtual"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>

            {/* CRM View Button */}
            <div className="relative group flex justify-center w-full">
              {currentView === 'crm' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-[#5E81F4] rounded-r-lg" />
              )}
              <button 
                onClick={() => setCurrentView('crm')}
                className={cn(
                  "p-3 rounded-xl transition-all duration-200 outline-none",
                  currentView === 'crm' 
                    ? "bg-slate-800 dark:bg-slate-900 text-[#5E81F4]" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                )}
                title="Gestão CRM"
              >
                <Database className="w-5 h-5" />
              </button>
            </div>
            
          </nav>
        </div>

        {/* Global System Settings */}
        <div className="flex flex-col items-center gap-5 w-full px-2">
          
          {/* Theme Toggle Button */}
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-xl transition-all"
            title={theme === 'dark' ? "Modo Claro" : "Modo Escuro"}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Cloud/Local Provider Toggle Button */}
          <button 
            onClick={() => setProvider(provider === 'gemini' ? 'ollama' : 'gemini')}
            className={cn(
              "p-3 rounded-xl transition-all duration-200",
              provider === 'gemini' 
                ? "text-[#5E81F4] hover:text-[#5E81F4]/80" 
                : "text-[#F4BE5E] hover:text-[#F4BE5E]/80 hover:bg-slate-800/40"
            )}
            title={provider === 'gemini' ? "Usando Nuvem (Gemini)" : "Usando Local (Ollama)"}
          >
            {provider === 'gemini' ? <Cloud className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
          </button>

          <div className="w-8 h-[1px] bg-slate-800/60 dark:bg-slate-800/30" />

          {/* LogOut Button */}
          <button 
            onClick={logout}
            className="p-3 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl transition-all"
            title="Sair da Conta"
          >
            <LogOut className="w-5 h-5" />
          </button>

        </div>
      </aside>

      {/* COLUNA 2: Context Sidebar / List & Config Panel */}
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-[#ECECF2] dark:border-slate-800/60 flex flex-col shrink-0 z-10 select-none">
        
        {/* User Info Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800" />
            ) : (
              <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center font-bold text-sm border border-blue-100 dark:border-blue-900/20">
                {user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : 'U'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.displayName || 'Cliente Segura'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7CE7AC] animate-pulse" />
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-500 font-semibold">{currentRole}</span>
              </div>
            </div>
          </div>
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

              {/* Chat History List */}
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-thin">
                <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">CONVERSAS RECENTES</p>
                
                {sessions.map((session) => (
                  <div 
                    key={session.id}
                    onClick={() => { setActiveSession(session); }}
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
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">CRM DASHBOARD</p>
                <div className="space-y-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500">Apólices Ativas</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">2 Coberturas</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500">Sinistros Reportados</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">1 Em Análise</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                    <p className="text-[10px] uppercase font-mono font-semibold text-slate-400 dark:text-slate-500">Categoria de Fidelidade</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">Status Gold</p>
                  </div>
                </div>
              </div>

              {/* Botão de Upload - Apenas para Admin */}
              {currentRole === 'admin' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">AÇÕES DE ADMIN</p>
                  <button 
                    onClick={handleTrainBotClick}
                    disabled={isTraining}
                    className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2"
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

        {/* Dynamic Demo Mode Controller at the Bottom */}
        <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/30">
          <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-xl space-y-2 text-xs shadow-sm">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px]">Modo Demo</span>
              <button 
                onClick={() => setDemoMode(!demoMode)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                  demoMode 
                    ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                )}
              >
                {demoMode ? 'Ativo' : 'Inativo'}
              </button>
            </div>
            
            {demoMode && (
              <div className="flex gap-1 pt-1">
                <button 
                  onClick={() => setDemoRole('cliente')}
                  className={cn(
                    "flex-1 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider", 
                    demoRole === 'cliente' 
                      ? "bg-blue-600 text-white" 
                      : "bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  Cli
                </button>
                <button 
                  onClick={() => setDemoRole('atendente')}
                  className={cn(
                    "flex-1 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider", 
                    demoRole === 'atendente' 
                      ? "bg-blue-600 text-white" 
                      : "bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  Ate
                </button>
                <button 
                  onClick={() => setDemoRole('admin')}
                  className={cn(
                    "flex-1 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider", 
                    demoRole === 'admin' 
                      ? "bg-blue-600 text-white" 
                      : "bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  Adm
                </button>
              </div>
            )}
          </div>
        </div>

      </aside>

      {/* COLUNA 3: Main Display / Working Workspace */}
      <main className="flex-1 flex flex-col bg-[#F6F6F6]/80 dark:bg-slate-950/20 overflow-hidden relative">
        
        {currentView === 'crm' ? (
          <CrmAdmin />
        ) : (
          <>
            {/* Active Session Title Header */}
            <div className="h-16 px-6 border-b border-[#ECECF2] dark:border-slate-800/60 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 select-none z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#5E81F4]/10 dark:bg-[#5E81F4]/10 flex items-center justify-center text-[#5E81F4] shrink-0">
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
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-1.5 border border-slate-200/40 dark:border-transparent">
                  <span className={cn("w-1.5 h-1.5 rounded-full", provider === 'gemini' ? "bg-[#5E81F4]" : "bg-[#F4BE5E]")} />
                  <span>{provider === 'gemini' ? 'Gemini Pro Cloud' : 'Ollama Local'}</span>
                </span>
              </div>
            </div>

            {/* Handoff Status Banners */}
            {activeSession && activeSession.status === 'aguardando_humano' && (
              <div className="bg-amber-50 dark:bg-amber-950/20 px-6 py-3 border-b border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-xs flex justify-between items-center transition-all select-none shrink-0">
                <span className="font-medium">
                  Aguardando um atendente humano iniciar o atendimento...
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
                      "p-4 rounded-2xl text-xs leading-relaxed shadow-sm transition-colors",
                      msg.role === Role.USER 
                        ? "bg-slate-800 text-white rounded-tr-none" 
                        : "bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-none prose prose-slate dark:prose-invert prose-xs max-w-none"
                    )}>
                      {msg.senderName && msg.role !== Role.USER && (
                        <div className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 mb-1 font-mono">
                          Corretor: {msg.senderName}
                        </div>
                      )}
                      <Markdown>{msg.content}</Markdown>
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
              <form 
                onSubmit={sendMessage}
                className="max-w-3xl mx-auto flex gap-2 items-center bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 focus-within:border-blue-500/80 dark:focus-within:border-blue-500/60 transition-all duration-200"
              >
                <input 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escreva sua mensagem..."
                  className="flex-1 bg-transparent px-4 py-2 outline-none text-slate-700 dark:text-slate-200 text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  disabled={isLoading}
                />
                <button 
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="w-10 h-10 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-md shadow-[#5E81F4]/15"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </form>
              <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 mt-2 uppercase font-mono tracking-widest font-semibold select-none">
                SeguraBot utiliza inteligência artificial. Valide informações críticas.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
