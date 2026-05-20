import { useState, useEffect } from 'react';
import { loginWithGoogle, loginDevAdmin } from '../../infrastructure/firebase';
import { ChatWidget } from '../components/ChatWidget';
import { cn } from '../../utils/utils';
import { useTheme } from '../context/ThemeContext';
import { Shield, Zap, Users, BarChart3, ArrowRight, ChevronRight, Lock, Globe } from 'lucide-react';

export function Landing() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      if (import.meta.env.DEV) {
        await loginDevAdmin();
      } else {
        await loginWithGoogle();
      }
    } catch (error) {
      console.error("Login failed", error);
      setIsLoggingIn(false);
    }
  };

  // Animated counter hook
  function useCounter(end: number, duration = 2000) {
    const [count, setCount] = useState(0);
    useEffect(() => {
      let start = 0;
      const increment = end / (duration / 16);
      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }, [end, duration]);
    return count;
  }

  const statAtendimentos = useCounter(12480);
  const statReducao = useCounter(73);
  const statSatisfacao = useCounter(98);
  const statUptime = useCounter(99);

  return (
    <div className="min-h-screen bg-[#F6F6F6] dark:bg-slate-950 text-slate-900 dark:text-white font-sans relative overflow-x-hidden transition-colors duration-300">
      
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] right-[-10%] w-[600px] h-[600px] bg-[#5E81F4]/5 dark:bg-[#5E81F4]/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#9698D6]/5 dark:bg-[#9698D6]/3 rounded-full blur-3xl"></div>
      </div>
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#ECECF2] dark:border-slate-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#5E81F4] rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-[#5E81F4]/20">
              S
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Segura<span className="text-[#5E81F4]">Bot</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#recursos" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Recursos</a>
            <a href="#solucoes" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Soluções</a>
            <a href="#metricas" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Resultados</a>
          </nav>

          {/* CTA & Theme Toggle */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-lg border border-[#ECECF2] dark:border-slate-800 transition-colors">
              <button
                onClick={() => setTheme('light')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  theme === 'light' 
                    ? "bg-[#F6F6F6] dark:bg-slate-700 text-[#F4BE5E] shadow-sm" 
                    : "text-[#8181A5] hover:text-slate-600 dark:hover:text-slate-300"
                )}
                title="Modo Claro"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.65 17.65l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 17.65l1.41-1.41"/><path d="M17.65 4.93l1.41-1.41"/></svg>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  theme === 'dark' 
                    ? "bg-[#F6F6F6] dark:bg-slate-700 text-[#5E81F4] shadow-sm" 
                    : "text-[#8181A5] hover:text-slate-600 dark:hover:text-slate-300"
                )}
                title="Modo Escuro"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              </button>
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="px-5 py-2.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-70 shadow-sm shadow-[#5E81F4]/20 flex items-center gap-2"
            >
              <span>{isLoggingIn ? 'Autenticando...' : 'Acessar Painel'}</span>
              {!isLoggingIn && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 text-center">
        
        {/* Badge */}
        <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-full border border-[#ECECF2] dark:border-slate-800 mb-8 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#7CE7AC] animate-pulse"></div>
          <span className="text-xs font-bold tracking-wider uppercase text-[#5E81F4]">Plataforma ativa — IA para Seguros</span>
        </div>
        
        <h1 className="animate-fade-in-up delay-100 text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.95]">
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
            Atendimento inteligente.
          </span>
          <br />
          <span className="gradient-text">Sem complicação.</span>
        </h1>
        
        <p className="animate-fade-in-up delay-200 text-lg text-[#8181A5] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Automatize o suporte da sua seguradora com agentes baseados nas suas regras de negócio. 
          Reduza o tempo de espera e qualifique leads em tempo real.
        </p>

        <div className="animate-fade-in-up delay-300 flex justify-center gap-4 mb-24">
          <button
            onClick={() => {
              const event = new CustomEvent('openChatWidget');
              window.dispatchEvent(event);
            }}
            className="px-7 py-3.5 bg-[#5E81F4] text-white font-bold rounded-lg hover:bg-[#5E81F4]/90 transition-all shadow-lg shadow-[#5E81F4]/20 flex items-center gap-2 text-sm"
          >
            <span>Testar Demonstração</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogin}
            className="px-7 py-3.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold rounded-lg hover:bg-[#F6F6F6] dark:hover:bg-slate-800 border border-[#ECECF2] dark:border-slate-800 transition-all shadow-sm text-sm"
          >
            Falar com Especialista
          </button>
        </div>

        {/* Stats Bar */}
        <div id="metricas" className="animate-fade-in-up delay-400 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-24 scroll-mt-20">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover">
            <p className="text-3xl font-black text-[#5E81F4] tabular-nums">{statAtendimentos.toLocaleString('pt-BR')}+</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Atendimentos</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover">
            <p className="text-3xl font-black text-[#7CE7AC] tabular-nums">{statReducao}%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Redução de Espera</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover">
            <p className="text-3xl font-black text-[#9698D6] tabular-nums">{statSatisfacao}%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Satisfação</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover">
            <p className="text-3xl font-black text-[#40E1FA] tabular-nums">{statUptime}.9%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Uptime</p>
          </div>
        </div>

        {/* Features Grid */}
        <div id="recursos" className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left scroll-mt-20">
          <div className="animate-fade-in-up delay-400 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#5E81F4]/10 dark:bg-[#5E81F4]/5 flex items-center justify-center text-[#5E81F4] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Shield className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#5E81F4] mb-3 uppercase tracking-widest">01. RAG Ativado</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Consulta de Manuais</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Nosso sistema lê suas regras de negócio e manuais de seguros para responder com precisão cirúrgica.
            </p>
          </div>

          <div className="animate-fade-in-up delay-500 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#9698D6]/10 dark:bg-[#9698D6]/5 flex items-center justify-center text-[#9698D6] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#9698D6] mb-3 uppercase tracking-widest">02. Integração CRM</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Dados do Cliente</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              O atendente sabe exatamente quem está falando e o histórico de apólices, oferecendo suporte personalizado.
            </p>
          </div>

          <div className="animate-fade-in-up delay-600 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#7CE7AC]/10 dark:bg-[#7CE7AC]/5 flex items-center justify-center text-[#7CE7AC] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Zap className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#7CE7AC] mb-3 uppercase tracking-widest">03. Multiagentes</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Roteamento Inteligente</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Um supervisor decide qual especialista deve atender o cliente, garantindo a melhor resposta possível.
            </p>
          </div>
        </div>
      </main>

      {/* Soluções Section */}
      <section id="solucoes" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Soluções</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Feito para o mercado segurador</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#F4BE5E]/10 flex items-center justify-center text-[#F4BE5E] group-hover:scale-110 transition-transform duration-300">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Para Corretoras</h3>
            </div>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Automatize o atendimento de novos leads, tire dúvidas sobre produtos e agilize o processo de cotação com um assistente disponível 24/7.
            </p>
            <div className="mt-6 pt-5 border-t border-[#ECECF2] dark:border-slate-800 flex flex-wrap gap-2">
              {['Lead scoring', 'Cotação auto', 'FAQ inteligente'].map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider rounded-lg border border-[#ECECF2] dark:border-slate-700">{tag}</span>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#40E1FA]/10 flex items-center justify-center text-[#40E1FA] group-hover:scale-110 transition-transform duration-300">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Para Seguradoras</h3>
            </div>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Integre com seus sistemas legados para consulta de apólices, status de sinistros e suporte especializado para a rede de corretores.
            </p>
            <div className="mt-6 pt-5 border-t border-[#ECECF2] dark:border-slate-800 flex flex-wrap gap-2">
              {['API legado', 'Sinistros', 'Rede parceiros'].map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider rounded-lg border border-[#ECECF2] dark:border-slate-700">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security / Trust Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-br from-[#5E81F4]/5 to-[#9698D6]/5 dark:from-[#5E81F4]/5 dark:to-[#9698D6]/3 p-10 rounded-xl border border-[#5E81F4]/20 dark:border-[#5E81F4]/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#5E81F4]/10 flex items-center justify-center text-[#5E81F4]">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest">Segurança</p>
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">Arquitetura de confiança zero</h3>
              <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
                Todos os dados são processados com criptografia end-to-end. Autenticação Firebase com suporte a SSO, MFA e controle granular de permissões por roles (Admin, Atendente, Cliente).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Criptografia', value: 'AES-256' },
                { label: 'Auth Provider', value: 'Firebase' },
                { label: 'LGPD', value: 'Compliant' },
                { label: 'Roles', value: '3 Níveis' },
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-[#ECECF2] dark:border-slate-800 text-center">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{item.value}</p>
                  <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team & Contact Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Developers */}
          <div>
            <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-2">Equipe</p>
            <h2 className="text-2xl font-black mb-6 text-slate-900 dark:text-white tracking-tight">Desenvolvedores</h2>
            <div className="space-y-3">
              {[
                { initials: 'JP', name: 'João Paulo da Silva Cardoso' },
                { initials: 'LA', name: 'Leonardo Alves Pereira' },
              ].map(dev => (
                <div key={dev.initials} className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover">
                  <div className="w-10 h-10 bg-[#5E81F4]/10 dark:bg-[#5E81F4]/5 rounded-xl flex items-center justify-center text-[#5E81F4] font-bold text-sm shrink-0">
                    {dev.initials}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{dev.name}</div>
                    <div className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Desenvolvedor</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-2">Contato</p>
            <h2 className="text-2xl font-black mb-6 text-slate-900 dark:text-white tracking-tight">Fale Conosco</h2>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 space-y-4">
              <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
                Dúvidas ou sugestões? Entre em contato com a nossa equipe.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-[#F6F6F6] dark:bg-slate-800 rounded-lg">
                  <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider shrink-0">Email</span>
                  <a href="mailto:contato@segurabot.com.br" className="text-sm font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors">contato@segurabot.com.br</a>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#F6F6F6] dark:bg-slate-800 rounded-lg">
                  <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider shrink-0">GitHub</span>
                  <a href="https://github.com/jpscard/uci_ai/tree/main" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors">Repositório do Projeto</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final Section */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <div className="bg-slate-900 dark:bg-slate-900 p-10 md:p-14 rounded-2xl text-center relative overflow-hidden animate-glow-pulse">
          <div className="absolute inset-0 bg-gradient-to-br from-[#5E81F4]/10 to-[#9698D6]/10 pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Pronto para transformar seu atendimento?</h2>
            <p className="text-sm text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed font-normal">
              Entre em contato conosco para desenharmos uma solução personalizada para o tamanho e as necessidades da sua operação.
            </p>
            <button 
              onClick={handleLogin}
              className="px-8 py-3.5 bg-[#5E81F4] text-white font-bold rounded-lg hover:bg-[#5E81F4]/90 transition-all shadow-lg shadow-[#5E81F4]/30 text-sm flex items-center gap-2 mx-auto"
            >
              <span>Começar Agora</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#ECECF2] dark:border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold text-[#8181A5]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#5E81F4] rounded-lg flex items-center justify-center text-white font-bold text-[9px]">S</div>
            <span>© 2026 SeguraBot. Todos os direitos reservados.</span>
          </div>
          <div className="flex gap-6 uppercase tracking-wider text-[10px]">
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">Termos de Uso</span>
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">Privacidade</span>
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">LGPD</span>
          </div>
        </div>
      </footer>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}
