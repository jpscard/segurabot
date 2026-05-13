import { auth, logout } from '../api/firebase';
import { cn } from '../utils/utils';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';

export function Header() {
  const user = auth.currentUser;
  const { provider, setProvider } = useSettings();
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-300">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-blue-600 dark:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/20 font-bold transition-shadow">
          B
        </div>
        <span className="font-sans font-bold text-xl tracking-tight text-slate-900 dark:text-white italic transition-colors">
          Segura<span className="text-blue-600 dark:text-blue-500 capitalize not-italic font-medium">Bot</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="px-3 py-1 text-xs font-medium rounded-md transition-all text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Model Toggle Switch */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
          <button
            onClick={() => setProvider('gemini')}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              provider === 'gemini' 
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/50 dark:border-slate-600/50" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            Nuvem
          </button>
          <button
            onClick={() => setProvider('ollama')}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              provider === 'ollama' 
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/50 dark:border-slate-600/50" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            Local
          </button>
        </div>

        {user ? (
          <div className="flex items-center gap-3 ml-2 border-l border-slate-200 dark:border-slate-800 pl-4 transition-colors">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-900 dark:text-white transition-colors">{user.displayName || 'User'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">{user.email}</p>
            </div>
            <button 
              onClick={logout}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 font-medium"
              title="Logout"
            >
              Sair
            </button>
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-bold text-sm transition-colors">
                U
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 border-l border-slate-200 dark:border-slate-800 pl-4 transition-colors">
            Protocolo Ativado
          </div>
        )}
      </div>
    </header>
  );
}
