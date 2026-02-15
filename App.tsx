
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { User } from '@supabase/supabase-js';
import { SPECIALISTS, DISCLAIMER } from './constants';
import { Specialist, Message } from './types';
import { ChatMessage } from './components/ChatMessage';
import { getAIResponse } from './services/aiService';
import * as db from './services/supabaseService';
import { decode, decodeAudioData, createBlob } from './services/liveService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | { id: string; email?: string; is_local?: boolean } | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<Specialist>(SPECIALISTS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  // Voice/Live States
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscription, setLiveTranscription] = useState<{ user: string; model: string }>({ user: '', model: '' });

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  // Monitorar Autenticação
  useEffect(() => {
    const localUserId = localStorage.getItem('mente_aberta_mock_user');
    if (localUserId) {
      setUser({ id: localUserId, is_local: true });
      setIsAuthChecking(false);
      return;
    }

    db.supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user);
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = db.supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUser(session.user);
      else if (!localStorage.getItem('mente_aberta_mock_user')) setUser(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Carregar histórico
  useEffect(() => {
    if (!user) return;

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const history = await db.fetchMessages(selectedSpecialist.id, user.id);
        if (history.length === 0) {
          const firstMsg: Message = { id: crypto.randomUUID(), role: 'model', content: selectedSpecialist.firstMessage, timestamp: Date.now() };
          setMessages([firstMsg]);
          await db.saveMessage(selectedSpecialist.id, firstMsg, user.id);
        } else {
          setMessages(history);
        }
      } catch (err) {
        console.error("Erro ao carregar banco:", err);
      } finally {
        setIsHistoryLoading(false);
      }
    };
    loadHistory();
    if (isVoiceMode) toggleVoiceMode();
  }, [selectedSpecialist, user]);

  // Scroll Automático
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, liveTranscription, isPressing]);

  // Timer PTT
  useEffect(() => {
    if (isPressing) {
      setRecordingTime(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isPressing]);

  const handleClearChat = async () => {
    if (!user || !confirm("Deseja apagar todo o histórico deste especialista?")) return;
    setIsHistoryLoading(true);
    await db.clearMessages(selectedSpecialist.id, user.id);
    const firstMsg: Message = { id: crypto.randomUUID(), role: 'model', content: selectedSpecialist.firstMessage, timestamp: Date.now() };
    setMessages([firstMsg]);
    await db.saveMessage(selectedSpecialist.id, firstMsg, user.id);
    setIsHistoryLoading(false);
  };

  const handleLocalLogin = () => {
    const id = db.getLocalGuestId();
    setUser({ id, is_local: true });
  };

  const handleAnonLogin = async () => {
    const { error } = await db.signInAnonymously();
    if (error) {
      console.warn("Auth Anônimo no servidor falhou (desativado no painel). Usando persistência local.");
      handleLocalLogin();
    }
  };

  const toggleVoiceMode = async () => {
    if (isVoiceMode) {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextsRef.current) {
        audioContextsRef.current.input.close();
        audioContextsRef.current.output.close();
      }
      sessionPromiseRef.current = null;
      setIsVoiceMode(false);
      setIsConnecting(false);
      setLiveTranscription({ user: '', model: '' });
      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
    } else {
      setIsVoiceMode(true);
      setIsConnecting(true);
      initLiveSession();
    }
  };

  const initLiveSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: selectedSpecialist.systemPrompt,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setIsConnecting(false),
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextsRef.current) {
              const { output: ctx } = audioContextsRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.inputTranscription) {
              userTranscriptionRef.current += message.serverContent.inputTranscription.text;
              setLiveTranscription(prev => ({ ...prev, user: userTranscriptionRef.current }));
            }
            if (message.serverContent?.outputTranscription) {
              modelTranscriptionRef.current += message.serverContent.outputTranscription.text;
              setLiveTranscription(prev => ({ ...prev, model: modelTranscriptionRef.current }));
            }

            if (message.serverContent?.turnComplete) {
              const uText = userTranscriptionRef.current;
              const mText = modelTranscriptionRef.current;
              if (user && (uText || mText)) {
                const msgsToAdd: Message[] = [];
                if (uText) {
                  const m: Message = { id: crypto.randomUUID(), role: 'user', content: uText, timestamp: Date.now() };
                  msgsToAdd.push(m);
                  db.saveMessage(selectedSpecialist.id, m, user.id);
                }
                if (mText) {
                  const m: Message = { id: crypto.randomUUID(), role: 'model', content: mText, timestamp: Date.now() };
                  msgsToAdd.push(m);
                  db.saveMessage(selectedSpecialist.id, m, user.id);
                }
                setMessages(prev => [...prev, ...msgsToAdd]);
              }
              userTranscriptionRef.current = '';
              modelTranscriptionRef.current = '';
              setLiveTranscription({ user: '', model: '' });
            }
          },
          onerror: () => setIsConnecting(false),
          onclose: () => setIsVoiceMode(false),
        }
      });

      const source = inputCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessor.onaudioprocess = (e) => {
        if (isPressing && sessionPromiseRef.current) {
          const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
          sessionPromiseRef.current.then(session => session.sendRealtimeInput({ media: pcmBlob }));
        }
      };
      source.connect(scriptProcessor);
      scriptProcessor.connect(inputCtx.destination);
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error(err);
      setIsVoiceMode(false);
      setIsConnecting(false);
    }
  };

  const handlePointerDown = async (e: React.PointerEvent) => {
    e.preventDefault();
    if (isConnecting) return;
    if (audioContextsRef.current) {
      await audioContextsRef.current.input.resume();
      await audioContextsRef.current.output.resume();
    }
    if (navigator.vibrate) navigator.vibrate(20);
    setIsPressing(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isPressing) {
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      setIsPressing(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading || !user) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    await db.saveMessage(selectedSpecialist.id, userMsg, user.id);
    
    setInputText('');
    setIsLoading(true);

    const aiResponseText = await getAIResponse(selectedSpecialist, messages, inputText);
    const modelMsg: Message = { id: crypto.randomUUID(), role: 'model', content: aiResponseText, timestamp: Date.now() };
    setMessages(prev => [...prev, modelMsg]);
    await db.saveMessage(selectedSpecialist.id, modelMsg, user.id);
    setIsLoading(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="w-10 h-10 border-4 border-[#075E54] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#075E54] to-[#128C7E] p-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md text-center">
          <div className="w-20 h-20 bg-[#DCF8C6] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <svg className="w-10 h-10 text-[#075E54]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-800 mb-2">Mente Aberta</h1>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Sua jornada de autoconhecimento começa aqui. Converse com especialistas virtuais em um ambiente seguro e gratuito.
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={handleAnonLogin}
              className="w-full py-4 rounded-2xl font-bold text-white bg-[#075E54] hover:bg-[#064e46] transition-all shadow-md active:scale-95 text-lg"
            >
              Começar Agora (Modo Grátis)
            </button>

            <div className="flex items-center gap-2 py-1">
              <div className="flex-grow h-[1px] bg-gray-100"></div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Sincronizar com Google</span>
              <div className="flex-grow h-[1px] bg-gray-100"></div>
            </div>

            <button 
              onClick={db.signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 py-3 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition-all active:scale-95 text-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
              Entrar com Google
            </button>
            
            <p className="text-[10px] text-gray-400 mt-2">
              * O login com Google é opcional e gratuito. <br/>
              Ele serve para você acessar suas conversas em outros aparelhos.
            </p>
          </div>

          <p className="mt-8 text-[10px] text-gray-400 uppercase font-bold tracking-widest">{DISCLAIMER}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen chat-bg overflow-hidden">
      <header className="bg-[#075E54] px-4 py-3 flex items-center justify-between shadow-md z-30 text-white shrink-0 no-select">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center overflow-hidden border border-white/30">
            <img src={selectedSpecialist.avatar} className="w-full h-full object-cover" alt="" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold leading-tight flex items-center gap-2">
              {selectedSpecialist.name}
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-white/80 font-medium tracking-tight truncate max-w-[100px]">
                {(user as any).is_local ? "Visitante (Local)" : ((user as any).is_anonymous ? "Visitante" : (user as any).email)}
              </p>
              <button 
                onClick={() => {
                  db.signOut();
                  setUser(null);
                }}
                className="text-[9px] bg-black/20 hover:bg-black/40 px-1.5 py-0.5 rounded border border-white/10 transition-colors uppercase font-bold"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          {SPECIALISTS.map(spec => (
            <button
              key={spec.id}
              onClick={() => setSelectedSpecialist(spec)}
              className={`w-9 h-9 rounded-full border-2 transition-all overflow-hidden ${
                selectedSpecialist.id === spec.id ? 'border-white scale-110 z-10' : 'border-transparent opacity-40 hover:opacity-100'
              }`}
            >
              <img src={spec.avatar} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </header>

      <button 
        onClick={handleClearChat}
        className="absolute top-20 right-4 z-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-red-500 shadow-sm border border-red-100 uppercase"
      >
        Limpar Histórico
      </button>

      <main ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {isHistoryLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 bg-white/40 backdrop-blur-sm rounded-3xl mx-8 my-12">
            <div className="w-8 h-8 border-3 border-[#075E54] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[#075E54] text-[10px] font-black tracking-widest uppercase">Restaurando Conversa...</span>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} specialistName={selectedSpecialist.name} avatar={selectedSpecialist.avatar} />
            ))}
            
            {(liveTranscription.user || liveTranscription.model || isPressing) && (
              <div className="flex flex-col gap-2 p-3 bg-white/95 backdrop-blur rounded-2xl border border-gray-100 shadow-xl animate-in fade-in slide-in-from-bottom-4 sticky bottom-2 mx-1">
                {isPressing && (
                  <div className="flex items-center gap-2 text-red-500 font-bold text-[10px] uppercase">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    Ouvindo...
                  </div>
                )}
                {liveTranscription.user && (
                  <div className="text-[13px] text-[#075E54] italic font-semibold leading-tight">Você: "{liveTranscription.user}"</div>
                )}
                {liveTranscription.model && (
                  <div className="text-[13px] text-gray-700 border-l-2 border-[#075E54] pl-3 py-1 bg-gray-50 rounded-r-lg">{liveTranscription.model}</div>
                )}
              </div>
            )}
            
            {isLoading && (
              <div className="flex items-center gap-1.5 bg-white px-4 py-2 rounded-2xl w-fit shadow-sm border border-gray-100">
                <div className="w-2 h-2 bg-[#075E54]/40 rounded-full animate-bounce" style={{animationDelay:'0s'}}></div>
                <div className="w-2 h-2 bg-[#075E54]/60 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div>
                <div className="w-2 h-2 bg-[#075E54]/80 rounded-full animate-bounce" style={{animationDelay:'0.4s'}}></div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="bg-[#F0F2F5] p-3 flex items-center gap-2 relative border-t border-gray-200 shrink-0">
        <div className="flex items-center w-full gap-2 px-1">
          <button 
            onClick={toggleVoiceMode} 
            className={`p-3.5 rounded-full transition-all active:scale-90 ${isVoiceMode ? 'bg-[#075E54] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isVoiceMode ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" />
              )}
            </svg>
          </button>

          <div className="flex-grow flex items-center h-12 relative">
            {isVoiceMode ? (
              <div className={`flex items-center w-full h-full bg-white rounded-full px-5 transition-all shadow-sm ${isPressing ? 'ring-2 ring-red-400' : 'border border-gray-200'}`}>
                {isPressing ? (
                  <div className="flex items-center gap-3 animate-pulse">
                    <span className="text-red-600 font-bold text-lg tabular-nums">{formatTime(recordingTime)}</span>
                    <span className="text-gray-400 text-sm italic">Gravando...</span>
                  </div>
                ) : (
                  <div className="w-full text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                    {isConnecting ? 'CONECTANDO...' : 'Segure o microfone'}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="w-full flex items-center bg-white rounded-full px-5 h-full shadow-sm border border-gray-200">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Mensagem"
                  className="flex-grow bg-transparent text-[15px] text-gray-800 outline-none font-medium"
                  disabled={isLoading}
                />
                {inputText.trim() && (
                  <button type="submit" className="ml-2 text-[#075E54] active:scale-90 transition-transform">
                    <svg className="w-6 h-6 rotate-45" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                )}
              </form>
            )}
          </div>

          {isVoiceMode && (
            <div className="relative">
              {isPressing && <div className="recording-ripple"></div>}
              <button
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isConnecting}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all transform active:scale-125 active:-translate-y-4 touch-none ${
                  isPressing ? 'bg-red-500 text-white' : 'bg-[#075E54] text-white'
                } ${isConnecting ? 'opacity-50 grayscale' : ''}`}
                style={{ touchAction: 'none' }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </footer>
      
      <div className="bg-[#F0F2F5] pb-4 text-center no-select">
         <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[1px] max-w-[280px] mx-auto">{DISCLAIMER}</p>
      </div>
    </div>
  );
};

export default App;
