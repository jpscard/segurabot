import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { db, auth, handleFirestoreError } from '../api/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { ChatSession, Message, Role, OperationType } from '../types';
import { askSeguraBot } from '../api/gemini';
import { cn } from '../utils/utils';
import { useSettings } from '../context/SettingsContext';
import { uploadRealDataToKnowledgeBase } from '../utils/seedKnowledgeBase';
import { uploadRealCrmData } from '../utils/seedCrmData';
import { CrmAdmin } from './CrmAdmin';

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
  
  const { provider } = useSettings();
  const user = auth.currentUser;

  // Load Sessions
  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/chat_sessions`;
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      setSessions(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Messages for active session
  useEffect(() => {
    if (!user || !activeSession) {
      setMessages([]);
      return;
    }

    const path = `users/${user.uid}/chat_sessions/${activeSession.id}/messages`;
    const q = query(collection(db, path), orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, activeSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const createNewSession = async () => {
    if (!user) return;
    const path = `users/${user.uid}/chat_sessions`;
    try {
      const docRef = await addDoc(collection(db, path), {
        userId: user.uid,
        title: 'Nova Conversa',
        lastMessage: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActiveSession({ id: docRef.id, userId: user.uid, title: 'Nova Conversa', lastMessage: '', createdAt: '', updatedAt: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    const path = `users/${user.uid}/chat_sessions/${id}`;
    try {
      await deleteDoc(doc(db, path));
      if (activeSession?.id === id) setActiveSession(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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
      alert(`Treinamento concluído com sucesso! ${count} registros reais do Kaggle/Documentos foram injetados no banco.`);
    } catch (error: any) {
      alert(`Erro ao fazer upload dos dados: ${error.message}`);
    } finally {
      setIsTraining(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenCrm = () => {
    setCurrentView('crm');
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    let targetSession = activeSession;
    
    if (!targetSession) {
      const path = `users/${user.uid}/chat_sessions`;
      try {
        const docRef = await addDoc(collection(db, path), {
          userId: user.uid,
          title: input.slice(0, 30) + '...',
          lastMessage: input,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        targetSession = { id: docRef.id, userId: user.uid, title: input.slice(0, 30) + '...', lastMessage: input, createdAt: '', updatedAt: '' };
        setActiveSession(targetSession);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
        return;
      }
    }

    const userMessageContent = input;
    setInput('');
    setIsLoading(true);

    const messagePath = `users/${user.uid}/chat_sessions/${targetSession.id}/messages`;
    
    try {
      await addDoc(collection(db, messagePath), {
        role: Role.USER,
        content: userMessageContent,
        timestamp: new Date().toISOString()
      });

      const currentMessages = [...messages, { role: Role.USER, content: userMessageContent, timestamp: new Date().toISOString() }];
      
      let fullModelText = "";
      // Pass the provider to askSeguraBot so it knows which logic to use
      await askSeguraBot(currentMessages, (chunk) => {
        setStreamingText(prev => prev + chunk);
        fullModelText += chunk;
      }, provider, user.uid);

      await addDoc(collection(db, messagePath), {
        role: Role.MODEL,
        content: fullModelText,
        timestamp: new Date().toISOString()
      });

      const sessionRef = doc(db, `users/${user.uid}/chat_sessions/${targetSession.id}`);
      await setDoc(sessionRef, {
        lastMessage: fullModelText.slice(0, 50) + '...',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setStreamingText('');
      setIsLoading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagePath);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white dark:bg-slate-950 transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col hidden md:flex transition-colors">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <button 
            onClick={createNewSession}
            className="w-full py-3 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-sm flex items-center justify-center gap-2 font-medium text-slate-700 dark:text-slate-300"
          >
            Novo Atendimento
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv,.json,.pdf" 
            className="hidden" 
          />
          
          <button 
            onClick={handleTrainBotClick}
            disabled={isTraining}
            className="w-full py-2 px-4 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-400 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50"
          >
            {isTraining ? 'Injetando Dados...' : 'Fazer Upload de Dados (.csv/.json/.pdf)'}
          </button>
          
          <button 
            onClick={handleOpenCrm}
            className="w-full py-2 px-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all text-xs font-medium text-indigo-700 dark:text-indigo-300"
          >
            Acessar Painel CRM
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sessions.map((session) => (
            <div 
              key={session.id}
              onClick={() => { setActiveSession(session); setCurrentView('chat'); }}
              className={cn(
                "p-3 rounded-xl cursor-pointer transition-all border group relative",
                activeSession?.id === session.id 
                  ? "bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900/50 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/30" 
                  : "border-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors",
                  activeSession?.id === session.id ? "bg-blue-600 dark:bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                )}>
                  CH
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold truncate transition-colors", activeSession?.id === session.id ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300")}>{session.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 truncate transition-colors">{session.lastMessage || 'Conversa vazia'}</p>
                </div>
              </div>
              <button 
                onClick={(e) => deleteSession(e, session.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium"
              >
                Excluir
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 dark:text-slate-600 font-mono uppercase tracking-tighter transition-colors">Sem históricos</p>
            </div>
          )}
        </div>

        <div className="p-4 mt-auto border-t border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/30 transition-colors">
          <div className="text-xs font-mono text-slate-400 dark:text-slate-500 uppercase transition-colors">
            Criptografia Ativada
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      {currentView === 'crm' ? (
        <CrmAdmin />
      ) : (
        <main className="flex-1 flex flex-col relative bg-white dark:bg-slate-950 transition-colors">
          {!activeSession && messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-2xl transition-colors">
              Bot
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white transition-colors">Como posso ajudar hoje?</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto transition-colors">
                Sou seu assistente SeguraBot. Posso tirar dúvidas sobre coberturas, ajudar com sinistros ou pagamentos.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
               {[
                 "Quais coberturas tenho no plano básico?",
                 "Como faço para acionar o seguro?",
                 "Posso parcelar meu pagamento?",
                 "Quero cancelar minha apólice."
               ].map(q => (
                 <button 
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="p-3 text-left border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-sm text-slate-700 dark:text-slate-300"
                 >
                   {q}
                 </button>
               ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
              {messages.map((msg, i) => (
                <div 
                  key={msg.id || i}
                  className={cn(
                    "flex gap-4 max-w-3xl",
                    msg.role === Role.USER ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm font-bold text-sm transition-colors",
                    msg.role === Role.USER ? "bg-slate-900 dark:bg-slate-800 text-white" : "bg-blue-600 text-white"
                  )}>
                    {msg.role === Role.USER ? "U" : "B"}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors",
                    msg.role === Role.USER 
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tr-none" 
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none prose prose-slate dark:prose-invert prose-sm max-w-none"
                  )}>
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>
              ))}
              
              {streamingText && (
                <div className="flex gap-4 max-w-3xl mr-auto">
                  <div className="w-9 h-9 rounded-xl flex-shrink-0 bg-blue-600 text-white flex items-center justify-center shadow-sm font-bold text-sm transition-colors">
                    B
                  </div>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none prose prose-slate dark:prose-invert prose-sm max-w-none transition-colors">
                    <Markdown>{streamingText}</Markdown>
                    <span className="inline-block w-1 h-4 bg-blue-400 dark:bg-blue-500 ml-1 animate-pulse" />
                  </div>
                </div>
              )}
              
              {isLoading && !streamingText && (
                <div className="flex gap-4 max-w-3xl mr-auto">
                  <div className="w-9 h-9 rounded-xl flex-shrink-0 bg-blue-600 text-white flex items-center justify-center shadow-sm font-bold text-sm transition-colors">
                    B
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-2 transition-colors">
                    <div className="w-4 h-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[10px]">Analisando Apólice...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky bottom-0 transition-colors">
          <form 
            onSubmit={sendMessage}
            className="max-w-3xl mx-auto flex gap-2 items-center bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors"
          >
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua dúvida ou comando..."
              className="flex-1 bg-transparent px-4 py-2 outline-none text-slate-700 dark:text-slate-200 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
              disabled={isLoading}
            />
            <button 
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 h-10 bg-blue-600 dark:bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-100 dark:shadow-none font-medium text-sm"
            >
              Enviar
            </button>
          </form>
          <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-2 uppercase font-mono tracking-widest transition-colors">
            SeguraBot utiliza Inteligência Artificial. Verifique informações críticas.
          </p>
        </div>
      </main>
      )}
    </div>
  );
}
