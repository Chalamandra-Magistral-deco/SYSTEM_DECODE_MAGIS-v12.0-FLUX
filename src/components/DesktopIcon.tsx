import React from 'react';

interface DesktopIconProps {
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  onClick: () => void;
  isActive?: boolean;
}

const DesktopIcon: React.FC<DesktopIconProps> = ({ label, icon, colorClass, onClick, isActive = false }) => {
  return (
    <button
      type="button"
      aria-label={'Open ' + label}
      title={label}
      aria-pressed={isActive}
      className={'group relative flex h-[4.5rem] w-[4.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-gray-900/90 px-1 transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-gray-800 z-10 sm:h-20 sm:w-20 ' + colorClass + (isActive ? ' ring-2 ring-white/80 ring-offset-2 ring-offset-black bg-gray-800' : '')}
      onClick={onClick}
    >
      <div className="text-2xl filter drop-shadow-lg transition-transform duration-300 group-hover:scale-110 sm:text-4xl" aria-hidden="true">
        {icon}
      </div>
      <span className="text-[0.6rem] font-mono font-bold tracking-wide text-white/90 sm:text-xs">
        {label}
      </span>
    </button>
  );
};

export default DesktopIcon;
