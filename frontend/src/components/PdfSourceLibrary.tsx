import React, { useState } from 'react';
import { 
  FileText, UploadCloud, Search, BookOpen, CheckCircle2, 
  Clock, Sparkles, Send, Trash2, Key, Check, X 
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// 1. SWITCHED TO NEW SDK
import { GoogleGenAI } from '@google/genai';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface DocumentItem {
  id: string;
  name: string;
  size: string;
  pages: number;
  status: 'Uploading' | 'Extracting' | 'Ready' | 'Error';
  textContent: string;
  uploadDate: string;
}

export default function PdfSourceLibrary() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [keyStatus, setKeyStatus] = useState<'none' | 'testing' | 'valid' | 'invalid'>('none');
  const [keyError, setKeyError] = useState<string | null>(null);
  
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [ragQuery, setRagQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [ragResult, setRagResult] = useState<{ answer: string; citations: any[] } | null>(null);

  const [activeTab, setActiveTab] = useState<'qa' | 'summary' | 'formulas' | 'questions'>('qa');
  
  const [generatedContent, setGeneratedContent] = useState<{ summary: string; formulas: string; quiz: string }>({ summary: '', formulas: '', quiz: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTab, setGeneratingTab] = useState('');

  const [quizLevel, setQuizLevel] = useState('College Level');
  const [quizMarks, setQuizMarks] = useState('5');
  const [userAnswers, setUserAnswers] = useState<{[key: string]: string}>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  // 2. NEW MODEL CONSTANT
  const MODEL = 'gemini-3.8-flash';

  const testApiKey = async () => {
    if (!apiKey) return;
    setKeyStatus('testing');
    setKeyError(null);

    try {
      // 3. UPDATED TO NEW SDK SYNTAX
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      const response = await ai.models.generateContent({ model: MODEL, contents: 'Hello' });
      console.log('Success:', response.text);
      
      setKeyStatus('valid');
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setTimeout(() => setShowKeyInput(false), 1000);
      
    } catch (e: any) {
      console.error("Full Error Object:", e);
      setKeyError(e.message || "Invalid key or network error.");
      setKeyStatus('invalid');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const newDocId = `doc-${Date.now()}`;
    
    setDocuments(prev => [{
      id: newDocId,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      pages: 0,
      status: 'Extracting',
      textContent: '',
      uploadDate: 'Just now'
    }, ...prev]);
    
    setSelectedDocId(newDocId);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }

      setDocuments(prev => prev.map(d => d.id === newDocId ? { 
        ...d, 
        status: 'Ready', 
        pages: pdf.numPages,
        textContent: fullText 
      } : d));

    } catch (error) {
      console.error("PDF Error:", error);
      setDocuments(prev => prev.map(d => d.id === newDocId ? { ...d, status: 'Error' } : d));
    }
  };

  // 4. UPDATED callGemini FUNCTION
  const callGemini = async (prompt: string, isJson = false) => {
    if (!apiKey) throw new Error('API Key missing');

    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: isJson ? { responseMimeType: 'application/json' } : undefined,
    });
    return response.text ?? '';
  };

  const handleRagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim() || !selectedDoc || !selectedDoc.textContent) return;

    setIsSearching(true);
    setRagResult(null);

    try {
      const prompt = `
        You are FRIDAY, an elite educational AI. 
        Answer the user's question based ONLY on the provided document text.
        If the answer is not in the text, say "I cannot find this in the document."
        Provide exact page numbers where the answer was found.
        
        Document Text:
        ${selectedDoc.textContent.substring(0, 15000)} 

        User Question: ${ragQuery}
        
        Return ONLY a JSON object exactly like this:
        {
          "answer": "Your detailed answer here.",
          "citations": [{"page": 1, "excerpt": "Exact quote from text..."}]
        }
      `;

      const response = await callGemini(prompt, true);
      const parsed = JSON.parse(response);
      
      setRagResult(parsed);
    } catch (err: any) {
      setRagResult({ answer: "Error: " + err.message, citations: [] });
    } finally {
      setIsSearching(false);
    }
  };

  const generateTabContent = async (tab: 'summary' | 'formulas' | 'quiz') => {
    if (!selectedDoc || !selectedDoc.textContent) return;
    setIsGenerating(true);
    setGeneratingTab(tab);

    try {
      let prompt = "";
      let isJson = false;
      
      if (tab === 'summary') {
        prompt = `
          Act as an elite academic professor. Write a highly detailed Chapter Summary of the following text.
          You MUST strictly follow this exact structure using markdown headings:
          
          **A. Prerequisite Anchors** (What must the student know beforehand?)
          **B. The Core Thesis** (What is the exact scientific/mechanical problem being solved?)
          **C. Operational Taxonomy** (List and define all mandatory keywords/vocabulary found in the text.)
          **D. The Execution Workflow** (Step-by-step procedural pipeline.)
          **E. Quantitative / Formulaic Anchors** (Any math, ratios, or equations mentioned.)
          **F. Common Misconceptions** (What does the text warn against?)
          **G. Provenance & Verification** (Mention where in the text these concepts are found.)
          
          Text: ${selectedDoc.textContent.substring(0, 15000)}
        `;
      } else if (tab === 'formulas') {
        prompt = `
          Extract EVERY mathematical formula, equation, or quantitative ratio from the following text.
          For each formula, you must provide:
          1. The equation itself (in plain text or LaTeX).
          2. A detailed explanation of what every variable means.
          3. The context of why this formula is used in the text.
          
          Text: ${selectedDoc.textContent.substring(0, 15000)}
        `;
      } else if (tab === 'quiz') {
        isJson = true;
        prompt = `
          Create an interactive multiple-choice practice exam based on the following text.
          Target Level: ${quizLevel}
          Marks per question: ${quizMarks}
          Total Questions: 3
          
          For EACH question, you must provide:
          - The question text.
          - 4 options (A, B, C, D).
          - The CORRECT answer (must exactly match one of the options).
          - A highly detailed explanation of WHY the correct answer is right, and WHY the other options are wrong.
          
          Return ONLY a JSON array of objects:
          [{"q": "Question?", "options": ["A", "B", "C", "D"], "correct": "A", "explanation": "Detailed explanation..."}]
          
          Text: ${selectedDoc.textContent.substring(0, 15000)}
        `;
      }

      const response = await callGemini(prompt, isJson);
      
      if (tab === 'quiz') {
        setGeneratedContent(prev => ({ ...prev, quiz: response }));
        setQuizSubmitted(false);
        setUserAnswers({});
      } else {
        setGeneratedContent(prev => ({ ...prev, [tab]: response }));
      }
      
    } catch (err: any) {
      setGeneratedContent(prev => ({ ...prev, [tab]: "Error: " + err.message }));
    } finally {
      setIsGenerating(false);
      setGeneratingTab('');
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (selectedDocId === id) {
      setSelectedDocId(documents.find(d => d.id !== id)?.id || '');
      setRagResult(null);
      setGeneratedContent({ summary: '', formulas: '', quiz: '' });
    }
  };

  let parsedQuiz: any[] = [];
  try {
    if (generatedContent.quiz) parsedQuiz = JSON.parse(generatedContent.quiz);
  } catch(e) {}

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">
      
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-600" /> PDF Intelligence (Powered by Gemini)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload real PDFs. Extract text. Generate grounded summaries, formulas, and interactive exams.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {showKeyInput ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-300">
                <Key className="w-4 h-4 text-slate-500 ml-2" />
                <input 
                  type="password" 
                  placeholder="Paste AQ.Ab8... key" 
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setKeyStatus('none'); setKeyError(null); }}
                  className="bg-transparent text-xs outline-none w-48"
                />
                <button 
                  onClick={testApiKey} 
                  disabled={keyStatus === 'testing'}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold text-white transition-colors ${
                    keyStatus === 'valid' ? 'bg-emerald-600' : 
                    keyStatus === 'invalid' ? 'bg-red-600' : 'bg-slate-800'
                  }`}
                >
                  {keyStatus === 'testing' ? 'Testing...' : 
                   keyStatus === 'valid' ? 'Verified!' : 
                   keyStatus === 'invalid' ? 'Invalid Key' : 'Verify Key'}
                </button>
              </div>
              {keyError && (
                <p className="text-[10px] text-red-500 max-w-xs break-words">{keyError}</p>
              )}
            </div>
          ) : (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 cursor-pointer" onClick={() => setShowKeyInput(true)}>
              <CheckCircle2 className="w-3 h-3" /> API Key Active
            </span>
          )}

          <label className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all">
            <UploadCloud className="w-4 h-4" /> Upload Document
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* Left Column: Document List */}
        <div className="w-80 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Library</span>
            <span className="text-xs font-semibold text-slate-500">{documents.length} Files</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {documents.map((doc) => (
              <div 
                key={doc.id}
                onClick={() => { setSelectedDocId(doc.id); setRagResult(null); setGeneratedContent({ summary: '', formulas: '', quiz: '' }); }}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                  doc.id === selectedDocId ? 'border-amber-500 bg-amber-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${doc.id === selectedDocId ? 'text-amber-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{doc.pages} pages • {doc.size}</p>
                    <div className="mt-2 flex items-center justify-between">
                      {doc.status === 'Ready' ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Extracted</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3 animate-spin" /> {doc.status}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={(e) => handleDelete(e, doc.id)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: AI Workspace */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {selectedDoc ? (
            <>
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{selectedDoc.name}</h2>
                  <p className="text-[11px] text-slate-500">Real Text Extraction Complete</p>
                </div>
                <div className="flex gap-1 bg-slate-200 p-1 rounded-lg text-xs font-semibold">
                  <button onClick={() => setActiveTab('qa')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'qa' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Ask FRIDAY</button>
                  <button onClick={() => { setActiveTab('summary'); if(!generatedContent.summary) generateTabContent('summary'); }} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Summary</button>
                  <button onClick={() => { setActiveTab('formulas'); if(!generatedContent.formulas) generateTabContent('formulas'); }} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'formulas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Formulas</button>
                  <button onClick={() => setActiveTab('questions')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'questions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Practice Quiz</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {activeTab === 'qa' && (
                  <div className="max-w-3xl mx-auto space-y-6">
                    <form onSubmit={handleRagSearch} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <input 
                          type="text"
                          value={ragQuery}
                          onChange={(e) => setRagQuery(e.target.value)}
                          placeholder={`Ask a question about ${selectedDoc.name}...`}
                          className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <button type="submit" disabled={isSearching || !selectedDoc.textContent} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> {isSearching ? 'Thinking...' : 'Ask FRIDAY'}
                      </button>
                    </form>

                    {ragResult && (
                      <div className="space-y-4 animate-fade-in">
                        <div className="p-5 bg-amber-500/10 border-l-4 border-amber-600 rounded-xl space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                            <Sparkles className="w-4 h-4 text-amber-600" /> Grounded Explanation
                          </div>
                          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{ragResult.answer}</p>
                        </div>
                        {ragResult.citations && ragResult.citations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Source Page Citations</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {ragResult.citations.map((c, i) => (
                                <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Page {c.page}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 italic">"{c.excerpt}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'summary' && (
                  <div className="max-w-4xl mx-auto">
                    {isGenerating && generatingTab === 'summary' ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
                        <Clock className="w-8 h-8 animate-spin text-amber-500" />
                        <p className="text-xs font-semibold">FRIDAY is analyzing the document and writing a deep summary...</p>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-700">
                        {generatedContent.summary ? (
                          <div dangerouslySetInnerHTML={{ __html: generatedContent.summary.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        ) : (
                          <p>Summary not generated yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'formulas' && (
                  <div className="max-w-4xl mx-auto">
                    {isGenerating && generatingTab === 'formulas' ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
                        <Clock className="w-8 h-8 animate-spin text-amber-500" />
                        <p className="text-xs font-semibold">Extracting every formula and writing explanations...</p>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-700">
                        {generatedContent.formulas ? (
                          <div dangerouslySetInnerHTML={{ __html: generatedContent.formulas.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        ) : (
                          <p>Formulas not generated yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'questions' && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {!generatedContent.quiz ? (
                      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col items-center justify-center space-y-4">
                        <h3 className="text-sm font-bold text-slate-800">Configure Your Exam</h3>
                        <div className="flex gap-4">
                          <select value={quizLevel} onChange={(e) => setQuizLevel(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs">
                            <option>School Level</option>
                            <option>College Level</option>
                            <option>MTech / Research</option>
                            <option>IIT JEE / Advanced</option>
                          </select>
                          <select value={quizMarks} onChange={(e) => setQuizMarks(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs">
                            <option value="1">1 Mark (MCQ)</option>
                            <option value="5">5 Marks</option>
                            <option value="10">10 Marks</option>
                          </select>
                        </div>
                        <button onClick={() => generateTabContent('quiz')} disabled={isGenerating} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-xs font-bold shadow-sm">
                          {isGenerating ? 'Drafting Exam...' : 'Generate Interactive Quiz'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6 animate-fade-in">
                        <div className="flex justify-between items-center border-b pb-2">
                          <h3 className="text-lg font-bold text-slate-900">Interactive Practice Test</h3>
                          <span className="text-xs font-bold text-amber-600">{quizLevel}</span>
                        </div>

                        {parsedQuiz.map((q: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-3">
                            <p className="text-sm font-bold text-slate-800">{idx + 1}. {q.q}</p>
                            <div className="space-y-2">
                              {q.options.map((opt: string, oIdx: number) => (
                                <label key={oIdx} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${userAnswers[idx] === opt ? 'border-amber-500 bg-amber-50' : 'border-transparent hover:bg-slate-50'}`}>
                                  <input type="radio" name={`q${idx}`} checked={userAnswers[idx] === opt} onChange={() => setUserAnswers(prev => ({ ...prev, [idx]: opt }))} disabled={quizSubmitted} className="w-4 h-4 text-amber-600" />
                                  <span className="text-xs text-slate-700">{opt}</span>
                                </label>
                              ))}
                            </div>
                            
                            {quizSubmitted && (
                              <div className={`mt-3 p-3 rounded-lg text-xs ${q.options.includes(userAnswers[idx]) && userAnswers[idx].startsWith(q.correct) ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                {q.options.includes(userAnswers[idx]) && userAnswers[idx].startsWith(q.correct) ? (
                                  <p className="flex items-center gap-2 font-bold"><Check className="w-4 h-4"/> Correct! {q.explanation}</p>
                                ) : (
                                  <div>
                                    <p className="flex items-center gap-2 font-bold"><X className="w-4 h-4"/> Incorrect. The correct answer is {q.correct}.</p>
                                    <p className="mt-1">{q.explanation}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {!quizSubmitted ? (
                          <button 
                            onClick={() => setQuizSubmitted(true)}
                            disabled={Object.keys(userAnswers).length < parsedQuiz.length}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold shadow-sm disabled:opacity-50"
                          >
                            Submit Answers for Grading
                          </button>
                        ) : (
                          <button onClick={() => generateTabContent('quiz')} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold shadow-sm">
                            Generate New Quiz
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs space-y-4">
              <FileText className="w-12 h-12 text-slate-300" />
              <p>No document selected. Upload a PDF to begin real AI analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}