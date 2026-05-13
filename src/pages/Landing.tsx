import { useState } from 'react';
import { loginWithGoogle } from '../api/firebase';

export function Landing() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_120%,rgba(37,99,235,0.05),transparent)] dark:bg-[radial-gradient(circle_at_50%_120%,rgba(37,99,235,0.1),transparent)] transition-colors duration-300">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        {/* Left Side: Copy & Value Proposition */}
        <div className="space-y-8 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-bold tracking-wider uppercase transition-colors">
            Plataforma SeguraBot
          </div>
          <h1 className="text-5xl md:text-6xl font-sans font-bold tracking-tight text-slate-900 dark:text-white leading-tight transition-colors">
            Atendimento de seguros, <br />
            <span className="text-blue-600 dark:text-blue-500 italic">inteligente.</span>
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-sans leading-relaxed max-w-lg transition-colors">
            Automatize chamados, responda dúvidas sobre apólices e ofereça suporte personalizado 24/7 com nossa inteligência artificial baseada nas regras da sua seguradora.
          </p>

          <div className="grid grid-cols-2 gap-6 pt-8 border-t border-slate-200/60 dark:border-slate-800/60 max-w-lg transition-colors">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1 text-sm transition-colors">Alta Precisão</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">RAG com seus manuais.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1 text-sm transition-colors">Resolução Rápida</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">Respostas em milissegundos.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Login Card */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 p-10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-blue-900/5 border border-slate-100 dark:border-slate-800 transition-colors">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 transition-colors">Acesso ao Painel</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 transition-colors">
              Faça login para gerenciar o SeguraBot e visualizar os chamados dos clientes.
            </p>

            <div className="space-y-4">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full py-3.5 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? 'Autenticando...' : 'Entrar com Google'}
              </button>
              
              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800 transition-colors"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider transition-colors">Acesso Seguro</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800 transition-colors"></div>
              </div>

              <div className="text-center text-xs text-slate-400 dark:text-slate-500 transition-colors">
                O acesso corporativo requer uma conta Google pré-autorizada pelo administrador do sistema.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
