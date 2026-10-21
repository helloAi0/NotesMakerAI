import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, ChevronLeft, ChevronRight, Volume2, Type, MousePointer, 
  Settings2, Sparkles, Table, Image as ImageIcon, Shapes, LayoutTemplate, 
  FileText, Square, Circle, ArrowRight, Trash2, Undo2, Redo2, Save, 
  Search, User, Minus, X, AlignLeft, AlignCenter, AlignRight, 
  ArrowUp, ArrowDown, Layers, Activity
} from 'lucide-react';

// IMPORT THE NEW SIMULATION COMPONENT
import VisualsStudio from './VisualsStudio';

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
  const [activeTab, setActiveTab] = useState<'Home' | 'Insert' | 'Design' | 'Layout' | 'Review' | 'View' | 'Shape Format' | 'Visuals'>('Home');
  const [paperStyle, setPaperStyle] = useState<'ruled' | 'grid' | 'plain' | 'dark'>('ruled');
  const [inputMode, setInputMode] = useState<'pen' | 'keyboard' | 'read' | 'shapes'>('read');
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'rectangle' | 'circle' | 'arrow' | 'line'>('pen');
  const [currentPage, setCurrentPage] = useState(1);
  
  // --- AUTOSAVE & HISTORY ---
  const [autoSave, setAutoSave] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [history, setHistory] = useState<ShapeObj[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // --- NOTEBOOK TEXT ---
  const [pageTypedText, setPageTypedText] = useState<{ [page: number]: string }>({
    1: "Hello My name is taha"
  });

  // --- CANVAS & SHAPES STATE ---
  const [pageDrawings, setPageDrawings] = useState<{ [page: number]: string }>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [pageShapes, setPageShapes] = useState<{ [page: number]: ShapeObj[] }>({
    1: []
  });

  // --- STUDIO INTERACTION STATE ---
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [isResizingShape, setIsResizingShape] = useState(false);
  
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [tempShape, setTempShape] = useState<ShapeObj | null>(null);

  // Default properties for new shapes
  const [shapeFill, setShapeFill] = useState('#ffffff');
  const [shapeStroke, setShapeStroke] = useState('#1e293b');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState(2);

  // --- VOICE STUDIO ---
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeTitle = notebookData?.title || "Human Anatomy & Physiology Notebook";
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
    ctxRef.current.strokeStyle = shapeStroke;
    ctxRef.current.lineWidth = tool === 'eraser' ? 15 : shapeStrokeWidth * 2;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    setSaveStatus('Unsaved...');
  };

  const stopCanvasDraw = () => {
    if (!isDrawingShape) return;
    setIsDrawingShape(false);
    if (ctxRef.current) ctxRef.current.closePath();
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

  const speakText = (text: string) => {
    if (!text.trim() || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechSpeed;
    utterance.pitch = speechPitch;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

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

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-100 select-none font-sans">
      
      {/* 1. TOP TITLE BAR */}
      <div className="bg-[#1e293b] text-white px-4 py-1 flex items-center justify-between text-xs h-9">
        <div className="flex items-center gap-4">
          <span className="font-bold text-amber-400 text-sm">Notes Maker AI</span>
          <div className="flex items-center gap-2 border-l border-slate-600 pl-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} className="w-3 h-3 accent-amber-500" />
              AutoSave
            </label>
            <button className="p-1 hover:bg-slate-700 rounded" title="Save"><Save className="w-3.5 h-3.5"/></button>
          </div>
          <div className="flex items-center gap-1 border-l border-slate-600 pl-4">
            <button onClick={undo} disabled={historyIndex <= 0} className="p-1 hover:bg-slate-700 rounded disabled:opacity-50"><Undo2 className="w-3.5 h-3.5"/></button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1 hover:bg-slate-700 rounded disabled:opacity-50"><Redo2 className="w-3.5 h-3.5"/></button>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-1 max-w-xl mx-4">
          <div className="relative flex-1">
             <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-slate-400" />
             <input type="text" placeholder="Search" className="w-full bg-slate-800 text-white rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <span className="font-semibold text-slate-300 whitespace-nowrap">{activeTitle}.docx</span>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${saveStatus === 'Saved' ? 'bg-emerald-600' : 'bg-amber-600'}`}>{saveStatus}</span>
          <button className="bg-amber-600 px-3 py-1 rounded font-medium hover:bg-amber-700 flex items-center gap-1"><Download className="w-3 h-3"/> Export PDF</button>
          <div className="flex items-center gap-1 border-l border-slate-600 pl-4">
            <button className="p-1 hover:bg-slate-700 rounded"><Minus className="w-3.5 h-3.5"/></button>
            <button className="p-1 hover:bg-slate-700 rounded"><Square className="w-3 h-3"/></button>
            <button className="p-1 hover:bg-red-600 rounded"><X className="w-3.5 h-3.5"/></button>
          </div>
          <button className="p-1 bg-slate-700 rounded-full"><User className="w-4 h-4"/></button>
        </div>
      </div>

      {/* 2. MAIN NAVIGATION RIBBON TABS */}
      <div className="flex items-center px-4 bg-[#f3f4f6] border-b border-slate-300 text-xs font-medium text-slate-700">
        {(['Home', 'Insert', 'Design', 'Layout', 'Review', 'View', 'Shape Format', 'Visuals'] as const).map((tab) => {
          if (tab === 'Shape Format' && !selectedShapeId) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-b-2 transition-colors ${activeTab === tab ? 'border-amber-600 bg-white text-slate-900 font-semibold shadow-inner' : 'border-transparent hover:bg-slate-200'} ${tab === 'Shape Format' ? 'text-amber-700 bg-amber-50/50' : ''} ${tab === 'Visuals' ? 'text-blue-700 bg-blue-50/50' : ''}`}
            >
              {tab === 'Visuals' ? '✨ Visuals Studio' : tab}
            </button>
          );
        })}
      </div>

      {/* 3. RIBBON CONTENT */}
      <div className="bg-white px-4 py-2 flex items-center overflow-x-auto text-xs border-b border-slate-200 min-h-[96px] shadow-sm z-10 relative">
        
        {activeTab === 'Home' && (
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                <button onClick={() => setInputMode('read')} className={`px-2.5 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'read' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Volume2 className="w-4 h-4"/> Read</button>
                <button onClick={() => setInputMode('pen')} className={`px-2.5 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'pen' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><MousePointer className="w-4 h-4"/> Pen</button>
                <button onClick={() => setInputMode('shapes')} className={`px-2.5 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'shapes' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Shapes className="w-4 h-4"/> Studio</button>
                <button onClick={() => setInputMode('keyboard')} className={`px-2.5 py-1.5 rounded font-semibold flex flex-col items-center gap-1 ${inputMode === 'keyboard' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><Type className="w-4 h-4"/> Type</button>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Input Mode</span>
            </div>
            
            {inputMode === 'shapes' && (
               <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                 <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                    <button onClick={() => setTool('rectangle')} className={`px-2 py-1 rounded font-semibold flex items-center gap-1 ${tool === 'rectangle' ? 'bg-amber-600 text-white' : ''}`}><Square className="w-4 h-4"/> Box</button>
                    <button onClick={() => setTool('circle')} className={`px-2 py-1 rounded font-semibold flex items-center gap-1 ${tool === 'circle' ? 'bg-amber-600 text-white' : ''}`}><Circle className="w-4 h-4"/> Circle</button>
                    <button onClick={() => setTool('arrow')} className={`px-2 py-1 rounded font-semibold flex items-center gap-1 ${tool === 'arrow' ? 'bg-amber-600 text-white' : ''}`}><ArrowRight className="w-4 h-4"/> Arrow</button>
                    <button onClick={() => setTool('line')} className={`px-2 py-1 rounded font-semibold flex items-center gap-1 ${tool === 'line' ? 'bg-amber-600 text-white' : ''}`}><Minus className="w-4 h-4"/> Line</button>
                 </div>
                 <span className="text-[10px] text-slate-500 font-medium">Insert Shapes</span>
               </div>
            )}

            <div className="flex flex-col items-center border-r border-slate-200 pr-4">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                {['#1e293b', '#b91c1c', '#15803d', '#1d4ed8', '#b45309', '#7c3aed', '#db2777', '#000000'].map((c) => (
                  <button key={c} onClick={() => { setShapeStroke(c); if(selectedShapeId) updateSelectedProperty('strokeColor', c); }} className={`w-5 h-5 rounded-full border ${shapeStroke === c ? 'scale-125 border-slate-900 shadow' : 'border-slate-300'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Colors</span>
            </div>

            <div className="flex flex-col items-center">
              <select value={paperStyle} onChange={(e) => setPaperStyle(e.target.value as any)} className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-xs font-medium text-slate-700 mb-1">
                <option value="ruled">Ruled Paper</option>
                <option value="grid">Grid Paper</option>
                <option value="plain">Plain Paper</option>
                <option value="dark">Dark Mode</option>
              </select>
              <span className="text-[10px] text-slate-500 font-medium">Paper Style</span>
            </div>
          </div>
        )}

        {activeTab === 'Visuals' && (
          <div className="flex items-center gap-4 text-xs text-slate-700">
            <Activity className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-bold text-slate-900">Interactive Visual Learning Studio</p>
              <p className="text-[11px] text-slate-500">Explore physics simulations and dynamic parameter controls live.</p>
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

            <div className="flex flex-col items-center">
              <button onClick={deleteSelected} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded font-semibold flex items-center gap-1 hover:bg-red-100 mb-1"><Trash2 className="w-4 h-4"/> Delete</button>
              <span className="text-[10px] text-slate-500 font-medium">Action</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2 rounded-xl border border-slate-700 ml-auto shadow-md">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <button onClick={() => speakText(`${activeTitle}. ${currentSection.heading}. ${currentSection.content}`)} className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5"/> Play Page
          </button>
          {isPlaying && (
            <button onClick={() => { window.speechSynthesis.cancel(); setIsPlaying(false); }} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs font-semibold">Stop</button>
          )}
        </div>
      </div>

      {/* 4. WORKSPACE / VIEW RENDERER */}
      <div className="flex-1 overflow-y-auto p-8 flex justify-center items-start pb-16 bg-slate-200">
        
        {/* RENDER THE ISOLATED VISUALIZER COMPONENT */}
        {activeTab === 'Visuals' ? (
          <div className="w-full flex justify-center pt-8">
             <VisualsStudio />
          </div>
        ) : (
          /* Normal Notebook Page View */
          <div className={`w-[850px] min-h-[1100px] shadow-2xl rounded-sm border border-amber-200/80 relative overflow-hidden transition-colors ${getPaperBackground()}`}>
            <div className="absolute left-16 top-0 bottom-0 w-[1px] bg-red-300/60 pointer-events-none z-0"></div>

            <div className="p-16 relative z-0 space-y-6 text-slate-900">
              <div className="border-b-2 border-slate-800/20 pb-4">
                <h1 className="text-3xl font-bold tracking-tight">{activeTitle}</h1>
                <p className="text-xs opacity-70 mt-1">Page {currentPage} of {totalPages}</p>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded-xl border-l-4 border-amber-600 bg-amber-500/10">
                  <h3 className="font-bold text-lg">{currentSection.heading}</h3>
                  <p className="text-base leading-relaxed">{currentSection.content}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 relative">
                 <div className="w-full text-slate-900 text-base font-sans whitespace-pre-wrap select-text" style={{ lineHeight: '32px', minHeight: '350px' }}>
                    {(pageTypedText[currentPage] || '').split('\n').map((line, idx) => (
                      <div key={idx} className="px-1"><span>{line || '\u00A0'}</span></div>
                    ))}
                  </div>
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
      <div className="h-10 bg-white border-t border-slate-300 px-8 flex items-center justify-between text-xs text-slate-700 z-30">
        <div className="flex items-center gap-2">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"><ChevronLeft className="w-4 h-4"/></button>
          <span className="font-semibold">Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(c => c + 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"><ChevronRight className="w-4 h-4"/></button>
        </div>
        <div className="text-slate-500">
          {activeTab === 'Visuals' ? "Kinematics Engine: Adjust the angle and click Launch." : "Click text to speak."}
        </div>
      </div>
    </div>
  );
}