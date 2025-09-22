
import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-background/70 backdrop-blur-md flex items-center justify-center z-[2000]"
      onClick={onClose}
    >
      <div 
        className="bg-background/70 p-4 rounded-md shadow-2xl shadow-primary border-2 border-solid border-secondary max-w-[96vw] w-auto sm:max-w-lg max-h-[92vh] overflow-y-auto text-foreground relative"
        onClick={(e) => e.stopPropagation()}
      >
                <button 
          className="absolute top-1 right-1 bg-none border-none text-2xl text-error cursor-pointer"
          style={{ textShadow: '0 0 3px var(--error-color)' }}
          onClick={onClose}
        >
          &times;
        </button>
        <h2 
          className="text-secondary text-2xl mb-2 text-center font-bold"
          style={{ textShadow: '0 0 2px rgba(255, 215, 0, 0.5)' }}
        >
          {title}
        </h2>
        <div 
          className="bg-muted/10 p-2 rounded-sm min-h-[80px] max-h-[60vh] overflow-y-auto mb-2 text-sm leading-relaxed border border-solid border-muted shadow-inner"
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
