import { useState, useEffect } from 'react';

export interface TourStep {
  targetId: string; // ID do elemento HTML a ser destacado
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

interface ProductTourProps {
  steps: TourStep[];
  active: boolean;
  onComplete: () => void;
}

export function ProductTour({ steps, active, onComplete }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active) return;

    const updateRect = () => {
      const step = steps[currentStep];
      if (!step) return;

      const element = document.getElementById(step.targetId);
      if (element) {
        // Rola até o elemento suavemente antes de posicionar o spotlight
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Pequeno timeout para dar tempo da rolagem terminar
        setTimeout(() => {
          const rect = element.getBoundingClientRect();
          setTargetRect(rect);
        }, 300);
      } else {
        setTargetRect(null);
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [currentStep, active, steps]);

  if (!active || steps.length === 0 || currentStep >= steps.length) {
    return null;
  }

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  // Calcula coordenadas do balão (Tooltip) baseado na posição do elemento destacado
  const getTooltipStyle = () => {
    if (!targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        position: 'fixed' as const,
      };
    }

    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const gap = 16;

    let top = 0;
    let left = 0;
    let transform = '';

    switch (step.position) {
      case 'bottom':
        top = targetRect.bottom + scrollY + gap;
        left = targetRect.left + scrollX + targetRect.width / 2;
        transform = 'translateX(-50%)';
        break;
      case 'top':
        top = targetRect.top + scrollY - gap;
        left = targetRect.left + scrollX + targetRect.width / 2;
        transform = 'translate(-50%, -100%)';
        break;
      case 'left':
        top = targetRect.top + scrollY + targetRect.height / 2;
        left = targetRect.left + scrollX - gap;
        transform = 'translate(-100%, -50%)';
        break;
      case 'right':
        top = targetRect.top + scrollY + targetRect.height / 2;
        left = targetRect.right + scrollX + gap;
        transform = 'translateY(-50%)';
        break;
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      transform,
      position: 'absolute' as const,
    };
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-[9999]">
      {/* Sombra escura de Overlay com buraco (Spotlight) recortado */}
      {targetRect && (
        <div 
          className="fixed inset-0 bg-slate-950/60 pointer-events-auto transition-all duration-300"
          style={{
            clipPath: `polygon(
              0% 0%, 
              0% 100%, 
              ${targetRect.left}px 100%, 
              ${targetRect.left}px ${targetRect.top}px, 
              ${targetRect.right}px ${targetRect.top}px, 
              ${targetRect.right}px ${targetRect.bottom}px, 
              ${targetRect.left}px ${targetRect.bottom}px, 
              ${targetRect.left}px 100%, 
              100% 100%, 
              100% 0%
            )`
          }}
          onClick={handleSkip}
        />
      )}

      {/* Se não houver elemento ativo, exibe uma tela escura cheia normal */}
      {!targetRect && (
        <div className="fixed inset-0 bg-slate-950/60 pointer-events-auto" onClick={handleSkip} />
      )}

      {/* Balão explicativo Premium da Tour (Tooltip) */}
      <div 
        style={getTooltipStyle()}
        className="w-72 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl p-5 shadow-xl pointer-events-auto animate-fadeIn space-y-4 select-none"
      >
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {step.title}
            </h5>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-[#ECECF2] dark:border-slate-800">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p className="text-[11px] text-[#8181A5] dark:text-slate-400 leading-normal font-medium">
            {step.content}
          </p>
        </div>

        {/* Botoes de Navegação minimalistas limpos */}
        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="text-[9px] text-[#8181A5] hover:text-slate-800 dark:hover:text-slate-200 font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Pular Guia
          </button>
          
          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm shadow-[#5E81F4]/10"
          >
            {currentStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}
