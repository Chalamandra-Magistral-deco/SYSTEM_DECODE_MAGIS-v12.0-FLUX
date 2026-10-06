import React, { useState, useRef, useEffect } from 'react';
import { X, Minus } from 'lucide-react';

interface WindowProps {
  id: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
  initialPosition: { x: number; y: number };
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}

const Window: React.FC<WindowProps> = ({
  id, title, isOpen, isMinimized, zIndex, initialPosition, onClose, onMinimize, onFocus, color, icon, children, width = 'w-[550px]'
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    onFocus();
    if (windowRef.current) {
        const rect = windowRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        setIsDragging(true);
    }
  };

  if (!isOpen || isMinimized) return null;

  // Color theme mapping
  const colorMap: Record<string, { border: string, text: string, bg: string, hex: string }> = {
    gold: { border: 'border-neon-gold', text: 'text-neon-gold', bg: 'from-neon-gold/20', hex: '#FFD700' },
    purple: { border: 'border-neon-purple', text: 'text-neon-purple', bg: 'from-neon-purple/20', hex: '#ff00ff' },
    cyan: { border: 'border-neon-cyan', text: 'text-neon-cyan', bg: 'from-neon-cyan/20', hex: '#00ffff' },
    green: { border: 'border-neon-green', text: 'text-neon-green', bg: 'from-neon-green/20', hex: '#00ff00' },
    red: { border: 'border-neon-red', text: 'text-neon-red', bg: 'from-neon-red/20', hex: '#ff0055' },
  };

  const theme = colorMap[color] || { border: 'border-white', text: 'text-white', bg: 'from-white/20', hex: '#ffffff' };

  return (
    <div
      ref={windowRef}
      className={`absolute flex flex-col w-[calc(100vw-1rem)] max-w-[550px] bg-glass-bg border-2 backdrop-blur-md rounded-lg shadow-2xl overflow-hidden ${theme.border}`}
      style={{
        left: `max(0.5rem, min(${position.x}px, calc(100vw - 0.5rem - min(550px, 100vw - 1rem))))`,
        top: position.y,
        zIndex: zIndex,
        maxHeight: '85vh',
        boxShadow: `0 0 20px ${theme.hex}`
      }}
      onMouseDown={onFocus}
    >
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-white/20 cursor-grab active:cursor-grabbing bg-gradient-to-r ${theme.bg} to-transparent`}
        onMouseDown={handleMouseDown}
      >
        <div className={`flex items-center gap-2 font-mono font-bold ${theme.text} text-shadow`}>
          {icon}
          <span className="tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onMinimize(); }} className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-300 shadow-md" />
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 shadow-md" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 text-white font-rajdhani">
        {children}
      </div>
    </div>
  );
};

export default Window;
