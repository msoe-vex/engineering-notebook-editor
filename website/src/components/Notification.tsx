import { CheckCircle2, AlertCircle, AlertTriangle, Loader2, Info, X } from 'lucide-react';
import toast from 'react-hot-toast';

export type NotificationType = 'success' | 'error' | 'warning' | 'loading' | 'info';

interface NotificationProps {
  message: string;
  type: NotificationType;
  t: { visible: boolean; id: string }; // toast instance for closing
}

export const Notification = ({ message, type, t }: NotificationProps) => {
  const icons = {
    success: <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />,
    error: <AlertCircle className="text-red-600 dark:text-red-400" size={18} />,
    warning: <AlertTriangle className="text-amber-600 dark:text-amber-400" size={18} />,
    loading: <Loader2 className="text-nb-primary animate-spin" size={18} />,
    info: <Info className="text-nb-tertiary" size={18} />,
  };

  const bgColors = {
    success: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    error: 'bg-red-500/10 dark:bg-red-500/20',
    warning: 'bg-amber-500/10 dark:bg-amber-500/20',
    loading: 'bg-nb-primary/10 dark:bg-nb-primary/20',
    info: 'bg-nb-tertiary/10 dark:bg-nb-tertiary/20',
  };

  return (
    <div
      className={`${
        t.visible ? 'animate-in fade-in slide-in-from-right-4' : 'animate-out fade-out slide-out-to-right-4'
      } max-w-md w-full max-h-[80vh] bg-nb-surface shadow-nb-2xl rounded-2xl pointer-events-auto flex overflow-hidden`}
    >
      <div className={`w-1.5 shrink-0 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : type === 'info' ? 'bg-nb-tertiary' : 'bg-nb-primary'}`} />
      
      <div className="flex-1 p-4 flex items-start gap-3 min-w-0">
        <div className={`shrink-0 p-2 rounded-xl ${bgColors[type]}`}>
          {icons[type]}
        </div>
        
        <div className="flex-1 pt-0.5 min-w-0">
          <p className="text-xs font-black text-nb-on-surface uppercase tracking-wider mb-0.5">
            {type === 'loading' ? 'Processing' : type.toUpperCase()}
          </p>
          <div className="text-xs font-medium text-nb-on-surface-variant leading-relaxed max-h-48 overflow-y-auto custom-scrollbar wrap-break-word select-text">
            {message}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.remove(t.id);
          }}
          className="shrink-0 p-1 rounded-lg text-nb-on-surface-variant/30 hover:text-nb-on-surface hover:bg-nb-surface-low transition-all cursor-pointer z-10"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export interface NotificationOptions {
  duration?: number;
  persistent?: boolean;
}

export const showNotification = (
  message: string,
  type: NotificationType = 'info',
  options?: NotificationOptions
) => {
  let duration: number;
  if (options?.persistent) {
    duration = Infinity;
  } else if (options?.duration !== undefined) {
    duration = options.duration;
  } else if (type === 'loading') {
    duration = Infinity;
  } else {
    duration = 4000;
  }

  toast.custom((t) => <Notification message={message} type={type} t={t} />, {
    duration,
  });
};
