import React, { useEffect, useRef, useState } from 'react';
import { calculateMatrixCode } from '../domain/algorithm/matrixCode';

const MATRIX_GLYPHS = '0123456789X█░▒▓⚡#$@%&*Øµ§';

export const useMatrixDecode = (
  targetText: string,
  speedMs = 40,
) => {
  const [displayText, setDisplayText] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);

  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!targetText) {
      setDisplayText('');
      setIsDecrypting(false);
      return;
    }

    let cancelled = false;
    let step = 0;
    const totalSteps = 24;

    setIsDecrypting(true);

    const animate = () => {
      if (cancelled) return;

      step += 1;

      const progress = step / totalSteps;
      const revealIndex = Math.floor(progress * targetText.length);

      const currentScramble = targetText
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' ';
          if (index <= revealIndex && step > 6) return char;

          return MATRIX_GLYPHS[
            Math.floor(Math.random() * MATRIX_GLYPHS.length)
          ];
        })
        .join('');

      setDisplayText(currentScramble);

      if (step < totalSteps) {
        timeoutRef.current = setTimeout(() => {
          frameRef.current = requestAnimationFrame(animate);
        }, speedMs);
        return;
      }

      setDisplayText(targetText);
      setIsDecrypting(false);
    };

    animate();

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [targetText, speedMs]);

  return { displayText, isDecrypting };
};

export const MatrixDecoder: React.FC = () => {
  const [birthDate, setBirthDate] = useState({
    day: '',
    month: '',
    year: '',
  });

  const [targetCode, setTargetCode] = useState('');

  const { displayText, isDecrypting } =
    useMatrixDecode(targetCode, 35);

  const handleCalculate = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const day = Number.parseInt(birthDate.day, 10);
    const month = Number.parseInt(birthDate.month, 10);
    const year = Number.parseInt(birthDate.year, 10);

    setTargetCode(
      calculateMatrixCode(day, month, year),
    );
  };

  return (
    <div className="w-full max-w-md p-6 bg-slate-950 border border-emerald-500/30 rounded-xl shadow-2xl font-mono text-emerald-400 select-none">
      <header className="mb-6 pb-3 border-b border-emerald-500/20 text-center">
        <h2 className="text-lg font-bold tracking-wider uppercase text-emerald-300">
          [ Matrix Decoder ]
        </h2>

        <p className="text-[10px] text-emerald-600 tracking-widest uppercase mt-1">
          Módulo 9 • Progressive Glyph Unmask
        </p>
      </header>

      <form onSubmit={handleCalculate} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-emerald-600 mb-1 tracking-wider uppercase">
              DÍA
            </label>
            <input
              type="number"
              min="1"
              max="31"
              required
              value={birthDate.day}
              onChange={(e) =>
                setBirthDate({
                  ...birthDate,
                  day: e.target.value,
                })
              }
              className="w-full bg-slate-900 border border-emerald-500/40 rounded px-3 py-2 text-center text-emerald-200 placeholder-emerald-800 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-[10px] text-emerald-600 mb-1 tracking-wider uppercase">
              MES
            </label>
            <input
              type="number"
              min="1"
              max="12"
              required
              value={birthDate.month}
              onChange={(e) =>
                setBirthDate({
                  ...birthDate,
                  month: e.target.value,
                })
              }
              className="w-full bg-slate-900 border border-emerald-500/40 rounded px-3 py-2 text-center text-emerald-200 placeholder-emerald-800 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-[10px] text-emerald-600 mb-1 tracking-wider uppercase">
              AÑO
            </label>
            <input
              type="number"
              min="1900"
              max="2099"
              required
              value={birthDate.year}
              onChange={(e) =>
                setBirthDate({
                  ...birthDate,
                  year: e.target.value,
                })
              }
              className="w-full bg-slate-900 border border-emerald-500/40 rounded px-3 py-2 text-center text-emerald-200 placeholder-emerald-800 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isDecrypting}
          className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800/40 text-slate-950 font-bold tracking-widest rounded transition-all duration-150 active:scale-[0.98] uppercase text-xs"
        >
          {isDecrypting
            ? 'DECODIFICANDO...'
            : 'EXTRAER FRECUENCIA'}
        </button>
      </form>

      {targetCode && (
        <div className="mt-6 pt-4 border-t border-emerald-500/20 text-center">
          <span className="text-[10px] text-emerald-500 uppercase tracking-widest block mb-2">
            {isDecrypting
              ? '▶ DESENCRIPTANDO VECTOR'
              : '✔ CÓDIGO EXTRAÍDO'}
          </span>

          <div
            className={[
              'text-3xl font-extrabold tracking-[0.35em]',
              'bg-slate-900/90 py-3.5 px-4 rounded border',
              isDecrypting
                ? 'border-emerald-400 text-emerald-400'
                : 'border-emerald-500/60 text-emerald-300',
            ].join(' ')}
          >
            {displayText}
          </div>
        </div>
      )}
    </div>
  );
};

export default MatrixDecoder;
