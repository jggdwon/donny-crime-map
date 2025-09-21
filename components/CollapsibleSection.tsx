import React, { useState, ReactNode, useRef } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = () => {
    const wasCollapsed = isCollapsed;
    setIsCollapsed(!wasCollapsed);

    if (wasCollapsed) {
        // Use timeout to allow state to update and element to become visible before scrolling
        setTimeout(() => {
            sectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 100);
    }
  };

  return (
    <div className="mt-1.5" ref={sectionRef}>
      <div
        className={`flex items-center justify-between cursor-pointer p-2.5 bg-muted/30 rounded-sm mb-0.5 text-lg font-bold text-foreground shadow-lg border border-solid border-muted transition-all duration-200 hover:bg-muted/50 hover:shadow-xl ${!isCollapsed ? 'active-glow' : ''}`}
        style={{ textShadow: '0 0 1px var(--text-light)' }}
        onClick={toggleCollapse}
      >
        <span>{title}</span>
        <span className={`transition-transform duration-300 text-secondary ${!isCollapsed ? 'rotate-90' : ''}`}>
          &#9654;
        </span>
      </div>
      <div
        className={`overflow-hidden transition-[max-height] duration-700 ease-in-out ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}
      >
        <div className="overflow-x-auto bg-muted/10 border-2 border-solid border-muted rounded-sm shadow-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSection;