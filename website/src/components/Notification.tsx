import { CheckCircle2, AlertCircle, Loader2, Info, X } from 'lucide-react';
import toast from 'react-hot-toast';

export type NotificationType = 'success' | 'error' | 'loading' | 'info';

interface NotificationProps {
  message: string;
  type: NotificationType;
  t: { visible: boolean; id: string }; // toast instance for closing
}

export const Notification = ({ message, type, t }: NotificationProps) => {
  const icons = {
    success: <CheckCircle2 className="text-green-500" size={18} />,
    error: <AlertCircle className="text-red-500" size={18} />,
    loading: <Loader2 className="text-nb-primary animate-spin" size={18} />,
    info: <Info className="text-nb-tertiary" size={18} />,
  };

  const bgColors = {
    success: 'bg-green-50/50',
    error: 'bg-red-50/50',
    loading: 'bg-nb-primary/5',
    info: 'bg-nb-tertiary/5',
  };

  return (
    <div
      className={`${
        t.visible ? 'animate-in fade-in slide-in-from-right-4' : 'animate-out fade-out zoom-out-95'
      } max-w-md w-full bg-nb-surface shadow-nb-2xl rounded-2xl pointer-events-auto flex overflow-hidden`}
    >
      <div className={`w-1.5 shrink-0 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : type === 'info' ? 'bg-nb-tertiary' : 'bg-nb-primary'}`} />
      
      <div className="flex-1 p-4 flex items-start gap-3">
        <div className={`shrink-0 p-2 rounded-xl ${bgColors[type]}`}>
          {icons[type]}
        </div>
        
        <div className="flex-1 pt-0.5">
          <p className="text-xs font-black text-nb-on-surface uppercase tracking-wider mb-0.5">
            {type === 'loading' ? 'Processing' : type.toUpperCase()}
          </p>
          <p className="text-xs font-medium text-nb-on-surface-variant leading-relaxed">
            {message}
          </p>
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

export const showNotification = (message: string, type: NotificationType = 'info') => {
  toast.custom((t) => <Notification message={message} type={type} t={t} />, {
    duration: type === 'loading' ? Infinity : 4000,
  });
};
