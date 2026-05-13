import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './api/firebase';
import { Header } from './components/Header';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';

import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("App mounted");
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user);
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 font-sans gap-4">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Iniciando Protocolo Seguro</p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <SettingsProvider>
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans selection:bg-blue-100 dark:selection:bg-blue-900/50 selection:text-blue-900 dark:selection:text-blue-100 transition-colors duration-300">
          <Header />
          <main className="flex-1 overflow-hidden">
            {user ? <Dashboard /> : <Landing />}
          </main>
        </div>
      </SettingsProvider>
    </ThemeProvider>
  );
}
