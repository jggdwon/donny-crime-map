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
        className={`flex items-center justify-between cursor-pointer p-2.5 bg-[#21262D] rounded-sm mb-0.5 text-lg font-bold text-[#E0E6ED] shadow-[0_2px_7px_rgba(0,0,0,0.7),_0_0_3px_var(--border-color)] border border-solid border-[#4A5D6B] transition-all duration-200 hover:bg-[#161B22] hover:shadow-[0_3px_9px_rgba(0,0,0,0.9),_0_0_5px_var(--accent-secondary)] ${!isCollapsed ? 'active-glow' : ''}`}
        style={{ textShadow: '0 0 1px var(--text-light)' }}
        onClick={toggleCollapse}
      >
        <span>{title}</span>
        <span className={`transition-transform duration-300 text-[#FFD700] ${!isCollapsed ? 'rotate-90' : ''}`}>
          &#9654;
        </span>
      </div>
      <div
        className={`overflow-hidden transition-[max-height] duration-700 ease-in-out ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}
      >
        <div className="overflow-x-auto bg-[#161B22] border-2 border-solid border-[#4A5D6B] rounded-sm shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSection;