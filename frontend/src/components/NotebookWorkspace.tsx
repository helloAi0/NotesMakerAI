import { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Volume2, Type, MousePointer, 
  Sparkles, Shapes, Square, Circle, ArrowRight, Trash2, Undo2, Redo2, Minus, X, 
  Activity, Mic, Square as StopSquare, Pause, Play, SkipBack, SkipForward, RotateCcw, Highlighter, Eraser, Pencil, Sigma, Table2, MessageSquareQuote, ListChecks, Printer, Wand2, Copy
} from 'lucide-react';
import RichText from './RichText';
import MarkdownView from './MarkdownView';
import EquationDictation from './EquationDictation';
import { useReader, useDictation, applyVoiceCommands, SPEECH_LANGS } from '../lib/useVoice';
import { splitSentences, type SpeechSegment } from '../lib/speechUtils';
import { generate, loadProvider, loadSaved, loadSpeed, friendlyError } from '../lib/aiClient';

// IMPORT SIMULATION & EXPERIMENT COMPONENTS
import VisualsStudio from './VisualsStudio';
import MicTest from './MicTest';
import ExperimentCard from './ExperimentCard';
import { loadAllExperiments, deleteExperimentRecord, type ExperimentRecord } from '../lib/experimentStore';
import type { Values } from '../sims/types';

interface NotebookWorkspaceProps {
  notebookData?: {
    title: string;
    level: string;
    style: string;
    sections: Array<{ heading: string; content: string }>;
  };
}

type ShapeObj = {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'line';
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  text: string;
  textColor: string;
  zIndex: number;
  rotation: number;
  textAlign: 'left' | 'center' | 'right';
  shadow: boolean;
};

export default function NotebookWorkspace({ notebookData }: NotebookWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'Home' | 'Insert' | 'Draw' | 'Voice' | 'AI Assistant' | 'Shape Format' | 'Visuals'>('Home');
  const [paperStyle, setPaperStyle] = useState<'ruled' | 'grid' | 'plain' | 'dark'>('ruled');
  const [inputMode, setInputMode] = useState<'pen' | 'keyboard' | 'read' | 'shapes'>('read');
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'rectangle' | 'circle' | 'arrow' | 'line'>('pen');
  const [currentPage, setCurrentPage] = useState(1);
  
  // --- AUTOSAVE & HISTORY ---
  const [autoSave, setAutoSave] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [history, setHistory] = useState<ShapeObj[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const activeTitle = notebookData?.title || "Human Anatomy & Physiology Notebook";

  // --- EXPERIMENTS & SIMULATION INTEGRATION ---
  const [experiments, setExperiments] = useState<ExperimentRecord[]>(() => loadAllExperiments());
  const [simLaunchState, setSimLaunchState] = useState<{ simId: string; rawValues?: Values } | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setExperiments(loadAllExperiments());
    };
    window.addEventListener('notesmaker_experiments_updated', handleUpdate);
    return () => window.removeEventListener('notesmaker_experiments_updated', handleUpdate);
  }, []);

  // --- NOTEBOOK TEXT WITH LOCALSTORAGE PERSISTENCE ---
  const [pageTypedText, setPageTypedText] = useState<{ [page: number]: string }>(() => {
    try {
      const saved = localStorage.getItem(`notesmaker_text_${activeTitle}`);
      return saved ? JSON.parse(saved) : { 1: "Human anatomy and physiological mechanisms study notes." };
    } catch {
      return { 1: "Human anatomy and physiological mechanisms study notes." };
    }
  });

  // --- CANVAS & SHAPES STATE ---
  const storeKey = (k: string) => `notesmaker_${k}_${notebookData?.title || 'default'}`;
  const [pageDrawings, setPageDrawings] = useState<{ [page: number]: string }>(() => {
    try { const r = localStorage.getItem(storeKey('drawings')); return r ? JSON.parse(r) : {}; } catch { return {}; }
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [pageShapes, setPageShapes] = useState<{ [page: number]: ShapeObj[] }>(() => {
    try { const r = localStorage.getItem(storeKey('shapes')); return r ? JSON.parse(r) : { 1: [] }; } catch { return { 1: [] }; }
  });
  useEffect(() => { try { localStorage.setItem(storeKey('shapes'), JSON.stringify(pageShapes)); } catch { /* storage full or blocked */ } }, [pageShapes]);
  useEffect(() => { try { localStorage.setItem(storeKey('drawings'), JSON.stringify(pageDrawings)); } catch { /* storage full or blocked */ } }, [pageDrawings]);

  // --- STUDIO INTERACTION STATE ---
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [isResizingShape, setIsResizingShape] = useState(false);
  
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [tempShape, setTempShape] = useState<ShapeObj | null>(null);

  // Default properties for new shapes
  const [shapeFill] = useState('#ffffff');
  const [shapeStroke, setShapeStroke] = useState('#1e293b');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState(2);

  // --- VOICE STUDIO ---
  const reader = useReader();
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const textRef = useRef(pageTypedText);
  textRef.current = pageTypedText;
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;
  const [showEquation, setShowEquation] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOut, setAiOut] = useState('');
  const [aiErr, setAiErr] = useState('');
  const [aiTitle, setAiTitle] = useState('');
  const activeSections = notebookData?.sections || [
    { heading: "Human Reproductive System", content: "The human reproductive system includes primary and secondary sex organs supporting gametogenesis and hormone production." }
  ];
  const currentSection = activeSections[currentPage - 1] || { heading: activeTitle, content: "Physiological notes." };
  const totalPages = Math.max(1, activeSections.length);

  // --- SAVE & HISTORY LOGIC ---
  const updateShapes = (newShapes: ShapeObj[]) => {
    if (autoSave) setSaveStatus('Saving...');
    setPageShapes(prev => ({ ...prev, [currentPage]: newShapes }));
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    if (autoSave) setTimeout(() => setSaveStatus('Saved'), 500);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setPageShapes(prev => ({ ...prev, [currentPage]: history[historyIndex - 1] }));
      setSelectedShapeId(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setPageShapes(prev => ({ ...prev, [currentPage]: history[historyIndex + 1] }));
      setSelectedShapeId(null);
    }
  };

  // --- CANVAS (PEN) LOGIC ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 850;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pageDrawings[currentPage]) {
      const img = new Image();
      img.src = pageDrawings[currentPage];
      img.onload = () => ctx.drawImage(img, 0, 0);
    }
  }, [currentPage, paperStyle]);

  const startCanvasDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (inputMode !== 'pen' || !canvasRef.current || !ctxRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
    setIsDrawingShape(true);
  };

  const drawCanvas = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingShape || !ctxRef.current || !canvasRef.current || inputMode !== 'pen') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    ctxRef.current.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctxRef.current.strokeStyle = tool === 'highlighter' ? '#facc15' : shapeStroke;
    ctxRef.current.globalAlpha = tool === 'highlighter' ? 0.35 : 1;
    ctxRef.current.lineWidth = tool === 'eraser' ? 18 : tool === 'highlighter' ? 16 : shapeStrokeWidth * 2;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    setSaveStatus('Unsaved...');
  };

  const stopCanvasDraw = () => {
    if (!isDrawingShape) return;
    setIsDrawingShape(false);
    if (ctxRef.current) { ctxRef.current.closePath(); ctxRef.current.globalAlpha = 1; }
    if (canvasRef.current) {
      setPageDrawings(prev => ({ ...prev, [currentPage]: canvasRef.current!.toDataURL() }));
    }
    setSaveStatus('Saved');
  };

  // --- STUDIO (SVG) LOGIC ---
  const handleSvgMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (inputMode !== 'shapes') return;
    
    if (e.target === e.currentTarget) {
      setSelectedShapeId(null);
      setActiveTab('Home');
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left);
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top);

    setDragStartPos({ x, y });
    setIsDrawingShape(true);

    const newShape: ShapeObj = {
      id: `shape-${Date.now()}`,
      type: tool as any,
      x, y, w: 0, h: 0,
      fillColor: shapeFill,
      strokeColor: shapeStroke,
      strokeWidth: shapeStrokeWidth,
      text: '',
      textColor: '#000000',
      zIndex: (pageShapes[currentPage]?.length || 0) + 1,
      rotation: 0,
      textAlign: 'center',
      shadow: false
    };
    setTempShape(newShape);
  };

  const handleSvgMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (inputMode !== 'shapes') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left);
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top);

    if (isDrawingShape && tempShape) {
      setTempShape({ ...tempShape, w: x - dragStartPos.x, h: y - dragStartPos.y });
    } else if (isDraggingShape && selectedShapeId) {
      const dx = x - dragStartPos.x;
      const dy = y - dragStartPos.y;
      const currentShapes = [...(pageShapes[currentPage] || [])];
      const idx = currentShapes.findIndex(s => s.id === selectedShapeId);
      if (idx !== -1) {
        currentShapes[idx] = { ...currentShapes[idx], x: currentShapes[idx].x + dx, y: currentShapes[idx].y + dy };
        setPageShapes(prev => ({ ...prev, [currentPage]: currentShapes }));
        setDragStartPos({ x, y });
      }
    } else if (isResizingShape && selectedShapeId) {
      const currentShapes = [...(pageShapes[currentPage] || [])];
      const idx = currentShapes.findIndex(s => s.id === selectedShapeId);
      if (idx !== -1) {
        currentShapes[idx] = { 
          ...currentShapes[idx], 
          w: Math.max(10, x - currentShapes[idx].x), 
          h: Math.max(10, y - currentShapes[idx].y) 
        };
        setPageShapes(prev => ({ ...prev, [currentPage]: currentShapes }));
      }
    }
  };

  const handleSvgMouseUp = () => {
    if (isDrawingShape && tempShape) {
      if (Math.abs(tempShape.w) > 10 || Math.abs(tempShape.h) > 10) {
        const newShapes = [...(pageShapes[currentPage] || []), tempShape];
        updateShapes(newShapes);
        setSelectedShapeId(tempShape.id);
        setActiveTab('Shape Format');
      }
      setTempShape(null);
    }
    if (isDraggingShape || isResizingShape) {
      updateShapes(pageShapes[currentPage] || []);
    }
    setIsDrawingShape(false);
    setIsDraggingShape(false);
    setIsResizingShape(false);
  };

  const handleShapeClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (inputMode !== 'shapes') return;
    setSelectedShapeId(id);
    setActiveTab('Shape Format');
  };

  const startDragShape = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement?.parentElement as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragStartPos({ x, y });
    setIsDraggingShape(true);
    setSelectedShapeId(id);
  };

  const startResizeShape = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizingShape(true);
  };

  const deleteSelected = () => {
    if (!selectedShapeId) return;
    const newShapes = (pageShapes[currentPage] || []).filter(s => s.id !== selectedShapeId);
    updateShapes(newShapes);
    setSelectedShapeId(null);
    setActiveTab('Home');
  };

  const updateSelectedProperty = (key: keyof ShapeObj, value: any) => {
    if (!selectedShapeId) return;
    const newShapes = (pageShapes[currentPage] || []).map(s => 
      s.id === selectedShapeId ? { ...s, [key]: value } : s
    );
    setPageShapes(prev => ({ ...prev, [currentPage]: newShapes }));
    setSaveStatus('Unsaved...');
  };

  const bringForward = () => {
    if (!selectedShapeId) return;
    const currentShapes = [...(pageShapes[currentPage] || [])].sort((a, b) => a.zIndex - b.zIndex);
    const idx = currentShapes.findIndex(s => s.id === selectedShapeId);
    if (idx !== -1 && idx < currentShapes.length - 1) {
      const tempZ = currentShapes[idx].zIndex;
      currentShapes[idx].zIndex = currentShapes[idx + 1].zIndex;
      currentShapes[idx + 1].zIndex = tempZ;
      updateShapes(currentShapes);
    }
  };

  const sendBackward = () => {
    if (!selectedShapeId) return;
    const currentShapes = [...(pageShapes[currentPage] || [])].sort((a, b) => a.zIndex - b.zIndex);
    const idx = currentShapes.findIndex(s => s.id === selectedShapeId);
    if (idx > 0) {
      const tempZ = currentShapes[idx].zIndex;
      currentShapes[idx].zIndex = currentShapes[idx - 1].zIndex;
      currentShapes[idx - 1].zIndex = tempZ;
      updateShapes(currentShapes);
    }
  };

  const handleDoubleClick = (id: string) => {
    const shape = (pageShapes[currentPage] || []).find(s => s.id === id);
    if (!shape) return;
    const text = window.prompt("Enter text for this shape:", shape.text);
    if (text !== null) {
      updateSelectedProperty('text', text);
    }
  };

  const applyPresetStyle = (fill: string, stroke: string) => {
    if (!selectedShapeId) return;
    const newShapes = (pageShapes[currentPage] || []).map(s => 
      s.id === selectedShapeId ? { ...s, fillColor: fill, strokeColor: stroke } : s
    );
    updateShapes(newShapes);
  };

  // ---- notes editing helpers ----
  const setNotesFor = (page: number, val: string) => {
    const next = { ...textRef.current, [page]: val };
    textRef.current = next;
    setPageTypedText(next);
    try { localStorage.setItem(`notesmaker_text_${activeTitle}`, JSON.stringify(next)); } catch { /* storage blocked */ }
    setSaveStatus('Saved');
  };
  const insertAtCaret = (snippet: string, transform?: (before: string) => string) => {
    const page = pageRef.current;
    const cur = textRef.current[page] || '';
    const pos = Math.min(caretRef.current ?? cur.length, cur.length);
    const text = transform ? transform(cur.slice(0, pos)) : snippet;
    setNotesFor(page, cur.slice(0, pos) + text + cur.slice(pos));
    caretRef.current = pos + text.length;
    setInputMode('keyboard');
    requestAnimationFrame(() => {
      const ta = notesRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(caretRef.current!, caretRef.current!); }
    });
  };
  const dict = useDictation(text => {
    insertAtCaret('', before => applyVoiceCommands(text, before.slice(-1)));
  });
  const startDictation = () => {
    setInputMode('keyboard');
    setActiveTab('Voice');
    dict.start();
  };

  // ---- reading aloud ----
  const sentsOf = (prefix: string, text: string): SpeechSegment[] => splitSentences(text).map((t, i) => ({ id: `${prefix}-${i}`, text: t }));
  const headingS = sentsOf('h', currentSection.heading);
  const contentS = sentsOf('c', currentSection.content);
  const noteLines = (pageTypedText[currentPage] || '').split('\n').map((line, li) => sentsOf(`n${li}`, line));
  const allSegs: SpeechSegment[] = [{ id: 't-0', text: activeTitle }, ...headingS, ...contentS, ...noteLines.flat()];
  const playPage = () => reader.playFrom(allSegs, 0);
  const speakFrom = (id: string) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // the student is selecting text, not clicking
    const i = allSegs.findIndex(x => x.id === id);
    if (i >= 0) reader.playFrom(allSegs, i);
  };
  const readSelection = () => {
    const t = window.getSelection()?.toString().trim() || (notesRef.current ? notesRef.current.value.slice(notesRef.current.selectionStart, notesRef.current.selectionEnd).trim() : '');
    if (!t) { reader.playFrom(allSegs, 0); return; }
    reader.playFrom(splitSentences(t).map((x, i) => ({ id: `sel-${i}`, text: x })), 0);
  };
  const readParagraph = () => {
    // from the start of the paragraph that holds the sentence being read (or the first note line)
    const cur = Math.max(0, reader.index);
    const id = allSegs[cur]?.id ?? 'h-0';
    const prefix = id.split('-')[0];
    const first = allSegs.findIndex(x => x.id.split('-')[0] === prefix);
    reader.playFrom(allSegs.filter(x => x.id.split('-')[0] === prefix), 0);
    void first;
  };
  const readSection = () => reader.playFrom([...headingS, ...contentS], 0);

  useEffect(() => { reader.stop(); }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!reader.segId) return;
    document.querySelector(`[data-seg="${reader.segId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [reader.segId]);

  const renderSent = (x: SpeechSegment) => (
    <span
      key={x.id}
      data-seg={x.id}
      role="button"
      tabIndex={0}
      title="Click to hear from here"
      onClick={() => speakFrom(x.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); speakFrom(x.id); } }}
      className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-amber-200/70 ${reader.segId === x.id ? 'bg-yellow-300 text-slate-900' : ''}`}
    ><RichText text={x.text} />{' '}</span>
  );

  // ---- AI study assistant ----
  const AI_ACTIONS: { id: string; label: string; ask: string }[] = [
    { id: 'sum', label: 'Summarize page', ask: 'Summarize these notes in 5 short bullet points.' },
    { id: 'simple', label: 'Explain simply', ask: 'Explain these notes in simple words for a student, with one everyday example.' },
    { id: 'terms', label: 'Key terms', ask: 'List the key terms with a one-line definition each.' },
    { id: 'quiz', label: 'Make a quiz', ask: 'Write 5 multiple-choice questions with 4 options each. Put the answer key at the end.' },
    { id: 'cards', label: 'Flashcards', ask: 'Write 8 flashcards as "Q: ... / A: ..." pairs.' },
    { id: 'eq', label: 'Explain equation', ask: 'Explain every equation in these notes: what each symbol means, units, and when it is used. Write math with $...$.' },
    { id: 'prob', label: 'Practice problems', ask: 'Write 4 practice problems of increasing difficulty with short worked solutions. Write math with $...$.' },
    { id: 'fix', label: 'Clean up my notes', ask: 'Rewrite my typed notes so they are clear and correct, keeping my meaning. Write math with $...$.' },
  ];
  const runAi = async (a: { label: string; ask: string }) => {
    const provider = loadProvider();
    const saved = loadSaved(provider, (import.meta.env.VITE_GEMINI_API_KEY as string) || '');
    setAiTitle(a.label); setAiOut(''); setAiErr('');
    if (!saved.apiKey) { setAiErr('Add an AI key first: open the PDF Library tab, choose a provider and save a key. The assistant uses the same key.'); return; }
    const sel = window.getSelection()?.toString().trim();
    const body = sel || `${currentSection.heading}\n${currentSection.content}\n${pageTypedText[currentPage] || ''}`;
    setAiBusy(true);
    try {
      const out = await generate(
        { provider, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl, speed: loadSpeed() },
        `You are a study assistant inside a notebook. ${a.ask}\n\nNotes${sel ? ' (selected text)' : ''}:\n"""\n${body}\n"""`,
        { maxTokens: 1200, onText: setAiOut, timeoutMs: 45000 },
      );
      setAiOut(out);
    } catch (e) { setAiErr(friendlyError(e)); } finally { setAiBusy(false); }
  };

  const clearDrawing = () => {
    const c = canvasRef.current;
    if (c && ctxRef.current) { ctxRef.current.clearRect(0, 0, c.width, c.height); }
    setPageDrawings(prev => ({ ...prev, [currentPage]: '' }));
    updateShapes([]);
  };
  const pickTool = (t: typeof tool) => { setTool(t); setInputMode(t === 'pen' || t === 'highlighter' || t === 'eraser' ? 'pen' : 'shapes'); };

  const getPaperBackground = () => {
    switch (paperStyle) {
      case 'grid': return 'bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] bg-[#fefbf6]';
      case 'ruled': return 'bg-[linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:100%_32px] bg-[#fefbf6]';
      case 'dark': return 'bg-[#0f172a] text-slate-100';
      default: return 'bg-[#fefbf6]';
    }
  };

  const selectedShape = (pageShapes[currentPage] || []).find(s => s.id === selectedShapeId);
  const sortedShapes = [...(pageShapes[currentPage] || [])].sort((a, b) => a.zIndex - b.zIndex);
  const pageExperiments = experiments.filter(e => e.notebookTitle === activeTitle && e.pageNumber === currentPage);

  return (
    <div className="print-root flex-1 flex flex-col h-screen overflow-hidden bg-slate-100 font-sans">
      
      {/* 1. TOP TITLE BAR */}
      <div className="no-print bg-[#1e293b] text-white px-2 md:px-4 py-1 flex items-center justify-between gap-2 text-xs min-h-9">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <span className="font-bold text-amber-400 text-sm whitespace-nowrap hidden sm:inline">Notes Maker AI</span>
          <label className="flex items-center gap-1 cursor-pointer sm:border-l border-slate-600 sm:pl-4 whitespace-nowrap">
            <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} className="w-3 h-3 accent-amber-500" />
            AutoSave
          </label>
          <div className="flex items-center gap-1 border-l border-slate-600 pl-2 md:pl-4">
            <button onClick={undo} disabled={historyIndex <= 0} title="Undo shape change" className="p-1 hover:bg-slate-700 rounded disabled:opacity-50"><Undo2 className="w-3.5 h-3.5"/></button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo shape change" className="p-1 hover:bg-slate-700 rounded disabled:opacity-50"><Redo2 className="w-3.5 h-3.5"/></button>
          </div>
        </div>
        <span className="font-semibold text-slate-300 truncate mx-4 hidden md:inline">{activeTitle}</span>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${saveStatus === 'Saved' ? 'bg-emerald-600' : 'bg-amber-600'}`}>{saveStatus}</span>
          <button onClick={() => window.print()} className="bg-amber-600 px-3 py-1 rounded font-medium hover:bg-amber-700 flex items-center gap-1"><Printer className="w-3 h-3"/> <span className="hidden sm:inline">Print / Save PDF</span><span className="sm:hidden">PDF</span></button>
        </div>
      </div>

      {/* 2. MAIN NAVIGATION RIBBON TABS */}
      <div className="no-print flex items-center px-4 bg-[#f3f4f6] border-b border-slate-300 text-xs font-medium text-slate-700 overflow-x-auto">
        {(['Home', 'Insert', 'Draw', 'Voice', 'AI Assistant', 'Shape Format', 'Visuals'] as const).map((tab) => {
          if (tab === 'Shape Format' && !selectedShapeId) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-amber-600 bg-white text-slate-900 font-semibold shadow-inner' : 'border-transparent hover:bg-slate-200'} ${tab === 'Shape Format' ? 'text-amber-700 bg-amber-50/50' : ''} ${tab === 'Visuals' ? 'text-blue-700 bg-blue-50/50' : ''}`}
            >
              {tab === 'Visuals' ? '✨ Visuals Studio' : tab}
            </button>
          );
        })}
      </div>

      {/* 3. RIBBON CONTENT */}
      <div className="no-print bg-white px-4 py-2 flex items-center overflow-x-auto text-xs border-b border-slate-200 min-h-[96px] shadow-sm z-10 relative">
        
        {activeTab === 'Home' && (
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                <button onClick={() => setInputMode('read')} className={`px-3 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'read' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Volume2 className="w-4 h-4"/> Read</button>
                <button onClick={() => setInputMode('keyboard')} className={`px-3 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'keyboard' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Type className="w-4 h-4"/> Edit</button>
                <button onClick={() => setInputMode('pen')} className={`px-3 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'pen' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><MousePointer className="w-4 h-4"/> Pen</button>
                <button onClick={() => { setInputMode('shapes'); if (tool === 'pen' || tool === 'eraser' || tool === 'highlighter') setTool('rectangle'); }} className={`px-3 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'shapes' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Shapes className="w-4 h-4"/> Shapes</button>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Mode</span>
            </div>
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <select value={paperStyle} onChange={(e) => setPaperStyle(e.target.value as typeof paperStyle)} className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-xs font-medium text-slate-700 mb-1">
                <option value="ruled">Ruled Paper</option>
                <option value="grid">Grid Paper</option>
                <option value="plain">Plain Paper</option>
                <option value="dark">Dark Mode</option>
              </select>
              <span className="text-[10px] text-slate-500 font-medium">Paper Style</span>
            </div>
            <div className="text-[11px] text-slate-500 max-w-xs leading-snug">
              <b>Read</b>: click any sentence to hear it from there. <b>Edit</b>: type or dictate notes. Use the <b>Voice</b> tab for dictation and equations.
            </div>
          </div>
        )}

        {activeTab === 'Insert' && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: <Sigma className="w-4 h-4"/>, label: 'Fraction', text: '$\\frac{a}{b}$' },
              { icon: <Sigma className="w-4 h-4"/>, label: 'Square root', text: '$\\sqrt{x}$' },
              { icon: <Sigma className="w-4 h-4"/>, label: 'Integral', text: '$\\int_{0}^{1} x^{2}\\,dx$' },
              { icon: <Sigma className="w-4 h-4"/>, label: 'Summation', text: '$\\sum_{i=1}^{n} i$' },
              { icon: <Sigma className="w-4 h-4"/>, label: 'Matrix', text: '$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$' },
              { icon: <Table2 className="w-4 h-4"/>, label: 'Table', text: '\n| Term | Meaning |\n| --- | --- |\n| ... | ... |\n' },
              { icon: <MessageSquareQuote className="w-4 h-4"/>, label: 'Callout', text: '\n> Note: \n' },
              { icon: <ListChecks className="w-4 h-4"/>, label: 'Checklist', text: '\n- [ ] \n- [ ] \n' },
            ].map(b => (
              <button key={b.label} onClick={() => insertAtCaret(b.text)} className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-amber-100 border border-slate-200 font-semibold flex items-center gap-1">{b.icon}{b.label}</button>
            ))}
            <button onClick={() => setShowEquation(true)} className="px-2.5 py-1.5 rounded bg-amber-600 text-white font-semibold flex items-center gap-1"><Mic className="w-4 h-4"/> Equation by voice / words</button>
            <button onClick={() => setActiveTab('Visuals')} className="px-2.5 py-1.5 rounded bg-blue-600 text-white font-semibold flex items-center gap-1"><Activity className="w-4 h-4"/> Simulation</button>
          </div>
        )}

        {activeTab === 'Draw' && (
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                {([['pen', <Pencil key="p" className="w-4 h-4"/>, 'Pen'], ['highlighter', <Highlighter key="h" className="w-4 h-4"/>, 'Highlight'], ['eraser', <Eraser key="e" className="w-4 h-4"/>, 'Eraser'], ['rectangle', <Square key="r" className="w-4 h-4"/>, 'Box'], ['circle', <Circle key="c" className="w-4 h-4"/>, 'Circle'], ['arrow', <ArrowRight key="a" className="w-4 h-4"/>, 'Arrow'], ['line', <Minus key="l" className="w-4 h-4"/>, 'Line']] as const).map(([t, ic, lb]) => (
                  <button key={t} onClick={() => pickTool(t)} className={`px-2 py-1 rounded font-semibold flex flex-col items-center ${tool === t && (inputMode === 'pen' || inputMode === 'shapes') ? 'bg-amber-600 text-white' : 'hover:bg-slate-200'}`}>{ic}<span className="text-[10px]">{lb}</span></button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Tools</span>
            </div>
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                {['#1e293b', '#b91c1c', '#15803d', '#1d4ed8', '#b45309', '#7c3aed', '#db2777', '#000000'].map((c) => (
                  <button key={c} aria-label={`Colour ${c}`} onClick={() => { setShapeStroke(c); if (selectedShapeId) updateSelectedProperty('strokeColor', c); }} className={`w-5 h-5 rounded-full border ${shapeStroke === c ? 'scale-125 border-slate-900 shadow' : 'border-slate-300'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Colour</span>
            </div>
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <input type="range" min={1} max={8} value={shapeStrokeWidth} onChange={e => setShapeStrokeWidth(Number(e.target.value))} aria-label="Line width" className="w-24 mb-1" />
              <span className="text-[10px] text-slate-500 font-medium">Line width</span>
            </div>
            <button onClick={clearDrawing} className="px-3 py-1.5 rounded bg-red-50 text-red-600 border border-red-200 font-semibold flex items-center gap-1"><Trash2 className="w-4 h-4"/> Clear drawings</button>
          </div>
        )}

        {activeTab === 'Voice' && (
          <div className="flex items-stretch gap-4 flex-wrap">
            <div className="flex flex-col gap-1 border-r border-slate-200 pr-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Dictate notes (speech to text)</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {!dict.supported ? (
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-[220px]">Voice input is not available in this browser (try Chrome/Edge). You can still type in Edit mode.</span>
                ) : dict.state === 'listening' || dict.state === 'starting' ? (
                  <>
                    <button onClick={dict.pause} className="px-2 py-1.5 rounded bg-slate-200 font-semibold flex items-center gap-1"><Pause className="w-3.5 h-3.5"/> Pause</button>
                    <button onClick={dict.stop} className="px-2 py-1.5 rounded bg-red-600 text-white font-semibold flex items-center gap-1"><StopSquare className="w-3.5 h-3.5"/> Stop</button>
                    <span className="text-red-600 animate-pulse">● listening</span>
                  </>
                ) : dict.state === 'paused' ? (
                  <>
                    <button onClick={dict.resume} className="px-2 py-1.5 rounded bg-amber-600 text-white font-semibold flex items-center gap-1"><Mic className="w-3.5 h-3.5"/> Resume</button>
                    <button onClick={dict.cancel} className="px-2 py-1.5 rounded bg-slate-200 font-semibold">Cancel</button>
                  </>
                ) : (
                  <button onClick={startDictation} className="px-3 py-1.5 rounded bg-amber-600 text-white font-semibold flex items-center gap-1"><Mic className="w-3.5 h-3.5"/> Start dictation</button>
                )}
                <select value={dict.lang} onChange={e => dict.setLang(e.target.value)} aria-label="Dictation language" className="border rounded px-1.5 py-1">
                  {SPEECH_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <button onClick={() => setShowEquation(true)} className="px-2 py-1.5 rounded bg-slate-800 text-white font-semibold flex items-center gap-1 w-fit"><Sigma className="w-3.5 h-3.5"/> Equation Dictation</button>
              {dict.error && <span className="text-red-600 max-w-[260px]">{dict.error}</span>}
              <MicTest />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Read aloud (text to speech)</span>
              {!reader.supported ? <span className="text-amber-700">Text-to-speech is not supported in this browser.</span> : (
                <>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button onClick={playPage} className="px-2.5 py-1.5 rounded bg-amber-600 text-white font-semibold flex items-center gap-1"><Play className="w-3.5 h-3.5"/> Page</button>
                    <button onClick={readSelection} className="px-2 py-1.5 rounded bg-slate-100 border font-semibold">Selection</button>
                    <button onClick={readParagraph} className="px-2 py-1.5 rounded bg-slate-100 border font-semibold">Paragraph</button>
                    <button onClick={readSection} className="px-2 py-1.5 rounded bg-slate-100 border font-semibold">Section</button>
                    <span className="w-px h-6 bg-slate-300 mx-1" />
                    <button onClick={reader.prev} disabled={reader.state === 'idle'} aria-label="Previous sentence" className="p-1.5 rounded bg-slate-100 border disabled:opacity-40"><SkipBack className="w-3.5 h-3.5"/></button>
                    {reader.state === 'playing'
                      ? <button onClick={reader.pause} aria-label="Pause" className="p-1.5 rounded bg-slate-100 border"><Pause className="w-3.5 h-3.5"/></button>
                      : <button onClick={reader.resume} disabled={reader.state !== 'paused'} aria-label="Resume" className="p-1.5 rounded bg-slate-100 border disabled:opacity-40"><Play className="w-3.5 h-3.5"/></button>}
                    <button onClick={reader.next} disabled={reader.state === 'idle'} aria-label="Next sentence" className="p-1.5 rounded bg-slate-100 border disabled:opacity-40"><SkipForward className="w-3.5 h-3.5"/></button>
                    <button onClick={reader.replay} disabled={reader.state === 'idle'} aria-label="Replay sentence" className="p-1.5 rounded bg-slate-100 border disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5"/></button>
                    <button onClick={reader.stop} disabled={reader.state === 'idle'} aria-label="Stop" className="p-1.5 rounded bg-red-600 text-white disabled:opacity-40"><StopSquare className="w-3.5 h-3.5"/></button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1">Speed <input type="range" min={0.5} max={2} step={0.1} value={reader.rate} onChange={e => reader.setRate(Number(e.target.value))} className="w-20" /> {reader.rate.toFixed(1)}×</label>
                    <select value={reader.voiceName} onChange={e => reader.setVoice(e.target.value)} aria-label="Voice" className="border rounded px-1.5 py-1 max-w-[150px]">
                      <option value="">Default voice</option>
                      {reader.voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                    </select>
                    <select value={reader.lang} onChange={e => reader.setLang(e.target.value)} aria-label="Speech language" className="border rounded px-1.5 py-1">
                      <option value="">Any language</option>
                      {SPEECH_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                    {reader.state !== 'idle' && <span className="text-slate-500">Sentence {Math.max(reader.index, 0) + 1} / {reader.count}</span>}
                  </div>
                  {reader.state !== 'idle' && <div className="h-1 bg-slate-200 rounded"><div className="h-1 bg-amber-600 rounded" style={{ width: `${((Math.max(reader.index, 0) + 1) / Math.max(reader.count, 1)) * 100}%` }} /></div>}
                  {reader.error && <span className="text-red-600">{reader.error}</span>}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'AI Assistant' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Wand2 className="w-4 h-4 text-amber-600" />
            {AI_ACTIONS.map(a => (
              <button key={a.id} disabled={aiBusy} onClick={() => runAi(a)} className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-amber-100 border border-slate-200 font-semibold disabled:opacity-50">{a.label}</button>
            ))}
            <span className="text-[11px] text-slate-500">Select text on the page first to work on just that part.</span>
          </div>
        )}

        {activeTab === 'Visuals' && (
          <div className="flex items-center gap-4 text-xs text-slate-700">
            <Activity className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-bold text-slate-900">Interactive Visual Learning Studio</p>
              <p className="text-[11px] text-slate-500">Open a simulation, change its controls, then use <b>Add to Notebook</b> to save it on this page.</p>
            </div>
          </div>
        )}

        {activeTab === 'Shape Format' && selectedShape && (
          <div className="flex items-center gap-4 w-full">
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-2 mb-1">
                 <button onClick={() => setTool('rectangle')} className="p-1 hover:bg-slate-200 rounded"><Square className="w-5 h-5"/></button>
                 <button onClick={() => setTool('circle')} className="p-1 hover:bg-slate-200 rounded"><Circle className="w-5 h-5"/></button>
                 <button onClick={() => setTool('arrow')} className="p-1 hover:bg-slate-200 rounded"><ArrowRight className="w-5 h-5"/></button>
                 <button onClick={() => setTool('line')} className="p-1 hover:bg-slate-200 rounded"><Minus className="w-5 h-5"/></button>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Insert Shapes</span>
            </div>

            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex gap-1 mr-2">
                  <button onClick={() => applyPresetStyle('#1e293b', '#1e293b')} className="w-6 h-6 bg-slate-800 rounded shadow-sm border"></button>
                  <button onClick={() => applyPresetStyle('#2563eb', '#1d4ed8')} className="w-6 h-6 bg-blue-600 rounded shadow-sm border"></button>
                  <button onClick={() => applyPresetStyle('#16a34a', '#15803d')} className="w-6 h-6 bg-green-600 rounded shadow-sm border"></button>
                  <button onClick={() => applyPresetStyle('#d97706', '#b45309')} className="w-6 h-6 bg-amber-600 rounded shadow-sm border"></button>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 mb-0.5">Fill</span>
                  <input type="color" value={selectedShape.fillColor} onChange={(e) => updateSelectedProperty('fillColor', e.target.value)} className="w-6 h-6 cursor-pointer border rounded p-0.5" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 mb-0.5">Outline</span>
                  <input type="color" value={selectedShape.strokeColor} onChange={(e) => updateSelectedProperty('strokeColor', e.target.value)} className="w-6 h-6 cursor-pointer border rounded p-0.5" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 mb-0.5">Weight</span>
                  <input type="number" min="1" max="10" value={selectedShape.strokeWidth} onChange={(e) => updateSelectedProperty('strokeWidth', Number(e.target.value))} className="w-10 border rounded px-1 text-center py-0.5" />
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Shape Styles</span>
            </div>

            <div className="flex flex-col items-center border-r border-slate-200 pr-3">
              <div className="flex gap-1 mb-1">
                <button onClick={bringForward} className="px-2 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 rounded">Forward</button>
                <button onClick={sendBackward} className="px-2 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 rounded">Backward</button>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Arrange</span>
            </div>

            <div className="flex flex-col items-center">
              <button onClick={deleteSelected} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded font-semibold flex items-center gap-1 hover:bg-red-100 mb-1"><Trash2 className="w-4 h-4"/> Delete</button>
              <span className="text-[10px] text-slate-500 font-medium">Action</span>
            </div>
          </div>
        )}

      </div>

      {/* 4. WORKSPACE / VIEW RENDERER */}
      <div className="print-scroll flex-1 overflow-y-auto p-2 md:p-8 flex justify-center items-start pb-16 bg-slate-200">
        
        {/* RENDER THE ISOLATED VISUALIZER COMPONENT */}
        {activeTab === 'Visuals' ? (
          <div className="w-full flex justify-center pt-8">
             <VisualsStudio
               initialSimId={simLaunchState?.simId}
               initialValues={simLaunchState?.rawValues}
               notebookContext={{
                 notebookTitle: activeTitle,
                 pageNumber: currentPage,
                 onBackToNotebook: () => {
                   setSimLaunchState(null);
                   setActiveTab('Home');
                 },
               }}
             />
          </div>
        ) : (
          /* Normal Notebook Page View */
          <div className={`select-text w-full max-w-[850px] min-h-[1100px] shadow-2xl rounded-sm border border-amber-200/80 relative overflow-hidden transition-colors ${getPaperBackground()}`}>
            <div className="absolute left-6 md:left-16 top-0 bottom-0 w-[1px] bg-red-300/60 pointer-events-none z-0"></div>

            <div className="p-6 pl-10 md:p-16 relative z-0 space-y-6 text-slate-900">
              <div className="border-b-2 border-slate-800/20 pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{renderSent({ id: 't-0', text: activeTitle })}</h1>
                  <p className="text-xs opacity-70 mt-1">Page {currentPage} of {totalPages}</p>
                </div>
                <button
                  onClick={() => setActiveTab('Visuals')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3.5 py-2 rounded-xl shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" /> Simulations Studio
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded-xl border-l-4 border-amber-600 bg-amber-500/10">
                  <h3 className="font-bold text-lg">{headingS.map(renderSent)}</h3>
                  <p className="text-base leading-relaxed">{contentS.map(renderSent)}</p>
                </div>
              </div>

              {/* Student Typed Notes with autosave */}
              <div className="mt-4 pt-2 relative">
                {inputMode === 'keyboard' ? (
                  <div>
                    <textarea
                      ref={notesRef}
                      value={pageTypedText[currentPage] || ''}
                      onChange={(e) => { caretRef.current = e.target.selectionStart; setNotesFor(currentPage, e.target.value); }}
                      onSelect={(e) => { caretRef.current = e.currentTarget.selectionStart; }}
                      onClick={(e) => { caretRef.current = e.currentTarget.selectionStart; }}
                      onKeyUp={(e) => { caretRef.current = e.currentTarget.selectionStart; }}
                      placeholder="Type notes here, or use the Voice tab to dictate. Math: $x^2$"
                      className="w-full text-slate-900 text-base font-sans p-3 bg-amber-50/30 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-y leading-relaxed min-h-[140px]"
                    />
                    {dict.interim && <p className="text-xs text-slate-500 italic mt-1">Hearing: {dict.interim}</p>}
                    <button onClick={() => setInputMode('read')} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded bg-slate-800 text-white">Done editing — read mode</button>
                  </div>
                ) : (
                  <div className="w-full text-slate-900 text-base font-sans whitespace-pre-wrap" style={{ lineHeight: '30px', minHeight: '120px' }}>
                    {(pageTypedText[currentPage] || '').trim() === '' ? (
                      <button onClick={() => setInputMode('keyboard')} className="text-slate-400 italic">No notes yet. Click here to write, or dictate from the Voice tab.</button>
                    ) : noteLines.map((sents, li) => (
                      <div key={li} className="px-1">{sents.length ? sents.map(renderSent) : '\u00A0'}</div>
                    ))}
                    {(pageTypedText[currentPage] || '').trim() !== '' && inputMode === 'read' && (
                      <button onClick={() => setInputMode('keyboard')} className="no-print mt-2 text-xs font-semibold px-3 py-1 rounded border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100">Edit notes</button>
                    )}
                  </div>
                )}
              </div>

              {/* SAVED LAB EXPERIMENTS & SIMULATION RECORDS */}
              <div className="mt-8 pt-6 border-t-2 border-amber-200/80 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-base text-slate-800">
                      Simulation Experiments & Saved Records ({pageExperiments.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('Visuals')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Activity className="w-3.5 h-3.5 text-amber-600" /> Open Visuals Studio
                  </button>
                </div>

                {pageExperiments.length > 0 ? (
                  <div className="space-y-5">
                    {pageExperiments.map((exp) => (
                      <ExperimentCard
                        key={exp.id}
                        record={exp}
                        onReopen={(simId, rawValues) => {
                          setSimLaunchState({ simId, rawValues: rawValues as Values });
                          setActiveTab('Visuals');
                        }}
                        onDelete={(id) => deleteExperimentRecord(id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl border-2 border-dashed border-amber-300/80 bg-amber-50/40 text-center space-y-2">
                    <p className="text-xs font-bold text-slate-800">No simulation experiments added to Page {currentPage} yet</p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                      Launch any physics, robotics, electronics, or mathematics simulation, test parameters, and click <strong>Add to Notebook</strong> to save live snapshots, calculated results, and interactive states.
                    </p>
                    <button
                      onClick={() => setActiveTab('Visuals')}
                      className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" /> Conduct Experiment in Visuals Studio
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SVG SHAPE EDITOR */}
            <div 
              className="absolute inset-0 z-10" 
              style={{ pointerEvents: inputMode === 'shapes' ? 'auto' : 'none' }}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
              onTouchStart={handleSvgMouseDown}
              onTouchMove={handleSvgMouseMove}
              onTouchEnd={handleSvgMouseUp}
            >
              <svg width="100%" height="100%" className="w-full h-full">
                <defs>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="3" dy="3" stdDeviation="3" floodOpacity="0.3" />
                  </filter>
                </defs>

                {sortedShapes.map((shape) => {
                  const isSelected = selectedShapeId === shape.id;
                  const rx = Math.min(shape.x, shape.x + shape.w);
                  const ry = Math.min(shape.y, shape.y + shape.h);
                  const rw = Math.abs(shape.w);
                  const rh = Math.abs(shape.h);
                  const centerX = rx + rw / 2;
                  const centerY = ry + rh / 2;

                  return (
                    <g 
                      key={shape.id} 
                      onClick={(e) => handleShapeClick(e, shape.id)}
                      onMouseDown={(e) => startDragShape(e, shape.id)}
                      onDoubleClick={() => handleDoubleClick(shape.id)}
                      className="cursor-move"
                      transform={`rotate(${shape.rotation}, ${centerX}, ${centerY})`}
                      filter={shape.shadow ? "url(#shadow)" : ""}
                    >
                      {shape.type === 'rectangle' && (
                        <rect x={rx} y={ry} width={rw} height={rh} fill={shape.fillColor} stroke={shape.strokeColor} strokeWidth={shape.strokeWidth} />
                      )}
                      {shape.type === 'circle' && (
                        <ellipse cx={centerX} cy={centerY} rx={rw/2} ry={rh/2} fill={shape.fillColor} stroke={shape.strokeColor} strokeWidth={shape.strokeWidth} />
                      )}
                      {shape.type === 'line' && (
                        <line x1={shape.x} y1={shape.y} x2={shape.x + shape.w} y2={shape.y + shape.h} stroke={shape.strokeColor} strokeWidth={shape.strokeWidth} />
                      )}
                      {shape.type === 'arrow' && (
                        <>
                          <line x1={shape.x} y1={shape.y} x2={shape.x + shape.w} y2={shape.y + shape.h} stroke={shape.strokeColor} strokeWidth={shape.strokeWidth} />
                          <polygon 
                            points={`${shape.x + shape.w},${shape.y + shape.h} ${shape.x + shape.w - 15 * Math.cos(Math.atan2(shape.h, shape.w) - Math.PI/6)},${shape.y + shape.h - 15 * Math.sin(Math.atan2(shape.h, shape.w) - Math.PI/6)} ${shape.x + shape.w - 15 * Math.cos(Math.atan2(shape.h, shape.w) + Math.PI/6)},${shape.y + shape.h - 15 * Math.sin(Math.atan2(shape.h, shape.w) + Math.PI/6)}`} 
                            fill={shape.strokeColor} 
                          />
                        </>
                      )}
                      
                      {shape.text && shape.type !== 'line' && shape.type !== 'arrow' && (
                        <text 
                          x={shape.textAlign === 'left' ? rx + 10 : shape.textAlign === 'right' ? rx + rw - 10 : centerX} 
                          y={centerY} 
                          textAnchor={shape.textAlign === 'left' ? 'start' : shape.textAlign === 'right' ? 'end' : 'middle'} 
                          dominantBaseline="middle" 
                          fill={shape.textColor} 
                          fontSize="16" 
                          fontWeight="bold" 
                          className="pointer-events-none select-none"
                        >
                          {shape.text}
                        </text>
                      )}

                      {isSelected && (
                        <>
                          <rect x={rx - 4} y={ry - 4} width={rw + 8} height={rh + 8} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" fill="transparent" className="pointer-events-none" />
                          <circle cx={rx + rw} cy={ry + rh} r="6" fill="#3b82f6" className="cursor-se-resize" onMouseDown={startResizeShape} />
                        </>
                      )}
                    </g>
                  );
                })}

                {tempShape && (
                  <g className="pointer-events-none">
                    {tempShape.type === 'rectangle' && <rect x={Math.min(tempShape.x, tempShape.x + tempShape.w)} y={Math.min(tempShape.y, tempShape.y + tempShape.h)} width={Math.abs(tempShape.w)} height={Math.abs(tempShape.h)} stroke={shapeStroke} strokeWidth={shapeStrokeWidth} fill="transparent" strokeDasharray="4 4" />}
                    {tempShape.type === 'circle' && <ellipse cx={Math.min(tempShape.x, tempShape.x + tempShape.w) + Math.abs(tempShape.w)/2} cy={Math.min(tempShape.y, tempShape.y + tempShape.h) + Math.abs(tempShape.h)/2} rx={Math.abs(tempShape.w)/2} ry={Math.abs(tempShape.h)/2} stroke={shapeStroke} strokeWidth={shapeStrokeWidth} fill="transparent" strokeDasharray="4 4" />}
                    {(tempShape.type === 'line' || tempShape.type === 'arrow') && <line x1={tempShape.x} y1={tempShape.y} x2={tempShape.x + tempShape.w} y2={tempShape.y + tempShape.h} stroke={shapeStroke} strokeWidth={shapeStrokeWidth} strokeDasharray="4 4" />}
                  </g>
                )}
              </svg>
            </div>

            <canvas 
              ref={canvasRef} 
              onMouseDown={startCanvasDraw} 
              onMouseMove={drawCanvas} 
              onMouseUp={stopCanvasDraw} 
              onMouseLeave={stopCanvasDraw} 
              onTouchStart={startCanvasDraw} 
              onTouchMove={drawCanvas} 
              onTouchEnd={stopCanvasDraw} 
              className="absolute inset-0 cursor-crosshair z-20" 
              style={{ pointerEvents: inputMode === 'pen' ? 'auto' : 'none' }} 
            />
          </div>
        )}
      </div>

      {/* 5. FOOTER */}
      <div className="no-print h-10 bg-white border-t border-slate-300 px-3 md:px-8 flex items-center justify-between text-xs text-slate-700 z-30">
        <div className="flex items-center gap-2">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"><ChevronLeft className="w-4 h-4"/></button>
          <span className="font-semibold">Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(c => c + 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"><ChevronRight className="w-4 h-4"/></button>
        </div>
        <div className="text-slate-500 truncate ml-2 hidden sm:block">
          {activeTab === 'Visuals' ? 'Simulation Studio' : inputMode === 'read' ? 'Click any sentence to hear it from there.' : inputMode === 'keyboard' ? 'Editing notes' : 'Drawing'}
        </div>
      </div>

      {showEquation && <EquationDictation onClose={() => setShowEquation(false)} onInsert={(latex) => insertAtCaret('', before => `${before && !/[\s\n]$/.test(before) ? ' ' : ''}$${latex}$ `)} />}

      {(aiBusy || aiOut || aiErr) && (
        <div className="no-print fixed right-2 md:right-4 bottom-14 w-[calc(100vw-1rem)] max-w-[26rem] max-h-[70vh] overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl z-40 p-4 text-slate-800">
          <div className="flex items-center justify-between mb-2">
            <b className="text-sm">{aiTitle}</b>
            <button onClick={() => { setAiOut(''); setAiErr(''); }} aria-label="Close" className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4"/></button>
          </div>
          {aiBusy && !aiOut && <p className="text-xs text-slate-500">Thinking…</p>}
          {aiErr && <p className="text-xs text-red-600">{aiErr}</p>}
          {aiOut && <MarkdownView text={aiOut} />}
          {aiOut && !aiBusy && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => insertAtCaret('', before => `${before && !before.endsWith('\n') ? '\n' : ''}\n${aiOut}\n`)} className="px-2.5 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold">Insert into notes</button>
              <button onClick={() => reader.playFrom(splitSentences(aiOut).map((t, i) => ({ id: `ai-${i}`, text: t })), 0)} className="px-2.5 py-1.5 rounded bg-slate-100 border text-xs font-semibold flex items-center gap-1"><Volume2 className="w-3.5 h-3.5"/> Read aloud</button>
              <button onClick={() => { try { void navigator.clipboard.writeText(aiOut); } catch { /* clipboard blocked */ } }} className="px-2.5 py-1.5 rounded bg-slate-100 border text-xs font-semibold flex items-center gap-1"><Copy className="w-3.5 h-3.5"/> Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}