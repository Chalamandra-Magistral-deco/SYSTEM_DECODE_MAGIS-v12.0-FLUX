import React, { Suspense, lazy, useState, useEffect } from 'react';
import Window from './components/Window';
import DesktopIcon from './components/DesktopIcon';
import AuthScreen from './components/AuthScreen';
import { supabase, supabaseConfigured } from './services/supabaseClient';

const MatrixAnalyzer = lazy(() => import('./components/MatrixAnalyzer'));
const Terminal = lazy(() => import('./components/Terminal'));
const DeploymentAnalyzer = lazy(() => import('./components/DeploymentAnalyzer'));
const MediaStudio = lazy(() => import('./components/MediaStudio'));
const LiveConversation = lazy(() => import('./components/LiveConversation'));
import { WindowState, MatrixStats } from './types';
import { Radar, Terminal as TerminalIcon, Cpu, Video, Mic, Sparkles, Info } from 'lucide-react';
import { playWindowOpen, playWindowClose, playWindowMinimize } from './services/soundService';

// Canvas Particle Background
const ParticleBackground = () => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let animationFrameId: number;
        type ParticleLike = { x: number; y: number; update: () => void; draw: () => void };
        let particles: ParticleLike[] = [];
        
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        class Particle {
            x: number; y: number; vx: number; vy: number; size: number; color: string;
            constructor() {
                this.x = Math.random() * canvas!.width;
                this.y = Math.random() * canvas!.height;
                this.vx = (Math.random() - 0.5) * 1.5;
                this.vy = (Math.random() - 0.5) * 1.5;
                this.size = Math.random() * 2 + 1;
                this.color = Math.random() > 0.5 ? 'rgba(255, 215, 0, 0.5)' : 'rgba(0, 255, 255, 0.5)';
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;
            }
            draw() {
                if(!ctx) return;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < 60; i++) particles.push(new Particle());

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            // Connections
            particles.forEach((p, i) => {
                for (let j = i; j < particles.length; j++) {
                    const dx = p.x - particles[j].x;
                    const dy = p.y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 100) {
                        ctx.strokeStyle = `rgba(100, 100, 100, ${1 - dist / 100})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            });
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);
    return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none" />;
};

const App: React.FC = () => {
    const [authReady, setAuthReady] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        if (!supabase) {
            setAuthReady(true);
            return;
        }

        let active = true;
        void supabase.auth.getSession().then(({ data, error }) => {
            if (!active) return;
            if (error) console.error('MAGIS_SESSION_ERROR', error);
            setAuthenticated(Boolean(data.session));
            setUserEmail(data.session?.user.email || 'AUTHENTICATED USER');
            setAuthReady(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuthenticated(Boolean(session));
            setUserEmail(session?.user.email || 'AUTHENTICATED USER');
            setAuthReady(true);
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    // Initial Window States
    const [windows, setWindows] = useState<WindowState[]>([
        { id: 'chalamandra', title: 'CHALAMANDRA_CORE.exe', isOpen: true, zIndex: 10, position: { x: 100, y: 50 }, isMinimized: false, type: 'CHALAMANDRA' },
        { id: 'matrix', title: 'MATRIX_ANALYZER_360.exe', isOpen: false, zIndex: 11, position: { x: 150, y: 80 }, isMinimized: false, type: 'MATRIX' },
        { id: 'terminal', title: 'FLOW_LOG.sh', isOpen: false, zIndex: 12, position: { x: 200, y: 150 }, isMinimized: false, type: 'TERMINAL' },
        { id: 'cicd', title: 'DEPLOYMENT_ANALYZER.sh', isOpen: false, zIndex: 13, position: { x: 400, y: 100 }, isMinimized: false, type: 'CICD' },
        { id: 'media', title: 'MEDIA_STUDIO.bin', isOpen: false, zIndex: 14, position: { x: 500, y: 50 }, isMinimized: false, type: 'MEDIA' },
        { id: 'live', title: 'NEURAL_LINK.live', isOpen: false, zIndex: 15, position: { x: 600, y: 200 }, isMinimized: false, type: 'LIVE' },
        { id: 'about', title: 'SYSTEM_SPECS.nfo', isOpen: false, zIndex: 16, position: { x: 300, y: 150 }, isMinimized: false, type: 'ABOUT' },
    ]);

    // Shared State for Matrix
    const [stats, setStats] = useState<MatrixStats>({ s: 50, e: 50, c: 50, m: 50 });

    const toggleWindow = (id: string) => {
        const target = windows.find(w => w.id === id);
        if (target) {
            if (target.isOpen && !target.isMinimized) playWindowMinimize();
            else playWindowOpen();
        }

        setWindows(prev => {
            const nextZIndex = Math.max(...prev.map(w => w.zIndex), 10) + 1;
            return prev.map(w => {
                if (w.id !== id) return w;
                if (w.isOpen && !w.isMinimized) return { ...w, isMinimized: true };
                return { ...w, isOpen: true, isMinimized: false, zIndex: nextZIndex };
            });
        });
    };

    const bringToFront = (id: string) => {
        // No sound on just focus
        setWindows(prev => {
            const nextZIndex = Math.max(...prev.map(w => w.zIndex), 10) + 1;
            return prev.map(w => w.id === id ? { ...w, zIndex: nextZIndex } : w);
        });
    };

    const closeWindow = (id: string) => {
        playWindowClose();
        setWindows(prev => prev.map(w => w.id === id ? { ...w, isOpen: false } : w));
    };

    const minimizeWindow = (id: string) => {
         playWindowMinimize();
         setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: true } : w));
    };

    if (!authReady) {
        return <div className="flex min-h-screen items-center justify-center bg-black font-mono text-neon-cyan">LOADING AUTHENTICATION...</div>;
    }

    if (!supabaseConfigured || !authenticated) {
        return <AuthScreen />;
    }

    return (
        <div className="relative w-screen h-screen bg-bg-dark text-white overflow-hidden font-rajdhani">
            <ParticleBackground />
            
            {/* Top HUD */}
            <div className="relative z-50 flex justify-between items-center px-6 py-2 bg-black/80 border-b-2 border-neon-purple backdrop-blur-md shadow-glow-purple">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-neon-cyan animate-pulse shadow-glow-cyan"></div>
                    <span className="font-mono text-neon-cyan tracking-widest">SYSTEM_READY</span>
                </div>
                <div className="font-mono text-neon-purple animate-pulse">
                     MAGIS_OS // v12.0 FLUX
                </div>
                <div className="flex items-center gap-3 font-mono text-neon-gold text-sm">
                    <span>{userEmail}</span>
                    <button
                        type="button"
                        onClick={() => void supabase?.auth.signOut()}
                        className="border border-neon-gold px-2 py-1 hover:bg-neon-gold hover:text-black"
                    >
                        SIGN OUT
                    </button>
                </div>
            </div>

            {/* Desktop Area */}
            <div className="relative w-full h-full">
                
                {/* Windows */}
                {windows.map(win => (
                    <Window
                        key={win.id}
                        id={win.id}
                        title={win.title}
                        isOpen={win.isOpen}
                        isMinimized={win.isMinimized}
                        zIndex={win.zIndex}
                        initialPosition={win.position}
                        onClose={() => closeWindow(win.id)}
                        onMinimize={() => minimizeWindow(win.id)}
                        onFocus={() => bringToFront(win.id)}
                        color={win.type === 'MATRIX' ? 'gold' : win.type === 'CICD' ? 'green' : win.type === 'MEDIA' ? 'red' : win.type === 'LIVE' ? 'cyan' : win.type === 'ABOUT' ? 'gold' : 'purple'}
                        icon={
                            win.type === 'MATRIX' ? <Radar size={18}/> : 
                            win.type === 'CICD' ? <Cpu size={18}/> :
                            win.type === 'MEDIA' ? <Video size={18}/> :
                            win.type === 'LIVE' ? <Mic size={18}/> :
                            win.type === 'ABOUT' ? <Info size={18}/> :
                            win.type === 'TERMINAL' ? <TerminalIcon size={18}/> : <Sparkles size={18}/>
                        }
                    >
                        {win.type === 'CHALAMANDRA' && (
                            <div className="flex flex-col items-center gap-4 text-center">
                                <img 
                                    src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEigiwRJJirRe5xXGe0X7D0vp1DmYEtQ5t16dh_cEIqaoe50DEfNzH32reGZYyKt2S3uqDSHivIM_OVlyyqKIDcvaWBND2jwGuo6xrsyKuSnagTkW0wOVJ5SaZBg092HlS0rZI_latqSGCS6QFBPjr0R3TMag58NArrFmPFKdewAdGwoTjo8ZwD04zS5a5_j/s512/1000024976.gif"
                                    alt="Chalamandra Core"
                                    className="w-32 h-32 rounded-full border-4 border-neon-red shadow-[0_0_30px_#ff0055] object-cover animate-pulse"
                                />
                                <div className="text-4xl text-neon-purple animate-pulse text-shadow-glow">MAGIS CORE</div>
                                <div className="text-sm font-mono text-white/70">AUTHENTICATED OPERATOR</div>
                                <div className="grid grid-cols-2 gap-4 w-full mt-4">
                                     <button onClick={() => toggleWindow('matrix')} className="p-4 border border-neon-gold text-neon-gold hover:bg-neon-gold hover:text-black font-bold font-mono transition-all">MATRIX</button>
                                     <button onClick={() => toggleWindow('cicd')} className="p-4 border border-neon-green text-neon-green hover:bg-neon-green hover:text-black font-bold font-mono transition-all">CI/CD</button>
                                     <button onClick={() => toggleWindow('media')} className="p-4 border border-neon-red text-neon-red hover:bg-neon-red hover:text-black font-bold font-mono transition-all">STUDIO</button>
                                     <button onClick={() => toggleWindow('live')} className="p-4 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-black font-bold font-mono transition-all">LINK</button>
                                </div>
                            </div>
                        )}
                        <Suspense fallback={<div className="p-4 font-mono text-xs text-neon-cyan animate-pulse">LOADING MODULE...</div>}>
                            {win.type === 'MATRIX' && <MatrixAnalyzer stats={stats} setStats={setStats} />}
                            {win.type === 'TERMINAL' && <Terminal />}
                            {win.type === 'CICD' && <DeploymentAnalyzer stats={stats} />}
                            {win.type === 'MEDIA' && <MediaStudio />}
                            {win.type === 'LIVE' && <LiveConversation />}
                        </Suspense>
                        {win.type === 'ABOUT' && (
                            <div className="flex flex-col gap-6 p-2 font-mono text-sm">
                                <div className="border-2 border-neon-gold p-4 bg-neon-gold/5 shadow-glow-gold relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1 bg-neon-gold text-black text-xs font-bold">PRODUCTION BUILD</div>
                                    <h1 className="text-2xl font-bold text-neon-gold mb-1">SYSTEM_DECODE_MAGIS</h1>
                                    <p className="text-neon-gold/80">VERSION: 12.0 FLUX</p>
                                    <p className="text-white/60 text-xs mt-2">Authenticated workspace • v12.0 FLUX</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h2 className="text-neon-purple font-bold mb-2 border-b border-neon-purple/50 pb-1">NEURAL CORES</h2>
                                        <ul className="space-y-2 text-white/80 text-xs">
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-purple"></div>Gemini gateway</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-purple"></div>Reasoning capability</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-purple"></div>Veo 3.1 video</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-purple"></div>Multimodal image + speech</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h2 className="text-neon-cyan font-bold mb-2 border-b border-neon-cyan/50 pb-1">SYSTEM SPECS</h2>
                                        <ul className="space-y-2 text-white/80 text-xs">
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-cyan"></div>Auth: Supabase session</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-cyan"></div>Billing: server-side credits</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-cyan"></div>Video: ownership-bound proxy</li>
                                            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-neon-cyan"></div>Security: CSP + strict headers</li>
                                        </ul>
                                    </div>
                                </div>

                                <div className="text-center text-xs text-gray-500 border-t border-gray-800 pt-4">
                                    <p>SECURE OPERATOR WORKSPACE</p>
                                    <p className="mt-1 opacity-50">Use the module controls below to start an analysis or creation task.</p>
                                </div>
                            </div>
                        )}
                    </Window>
                ))}

            </div>

            {/* Dock */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-6 z-50">
                 <DesktopIcon label="MATRIX" icon={<Radar />} colorClass="border-neon-gold shadow-neon-gold text-neon-gold" onClick={() => toggleWindow('matrix')} />
                 <DesktopIcon label="DEPLOY" icon={<Cpu />} colorClass="border-neon-green shadow-neon-green text-neon-green" onClick={() => toggleWindow('cicd')} />
                 <DesktopIcon label="STUDIO" icon={<Video />} colorClass="border-neon-red shadow-neon-red text-neon-red" onClick={() => toggleWindow('media')} />
                 <DesktopIcon label="LINK" icon={<Mic />} colorClass="border-neon-cyan shadow-neon-cyan text-neon-cyan" onClick={() => toggleWindow('live')} />
                 <DesktopIcon label="TERM" icon={<TerminalIcon />} colorClass="border-neon-purple shadow-neon-purple text-neon-purple" onClick={() => toggleWindow('terminal')} />
                 <DesktopIcon label="INFO" icon={<Info />} colorClass="border-white shadow-white text-white" onClick={() => toggleWindow('about')} />
            </div>
        </div>
    );
};

export default App;
