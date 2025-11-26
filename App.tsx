import React, { useState, useRef, useEffect } from 'react';
import { Camera, Trash2, ArrowLeft, Share, Wand2, Maximize2, Languages, X, PenTool, Copy, Check, Download, FileText, Image as ImageIcon, FileType, ChevronLeft, ChevronRight, Layers, FileImage, Smartphone, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AppView, DocumentData, ScannedPage, FilterType } from './types';
import { processImage, generateId, formatDate } from './services/imageUtils';
import { analyzeDocument, translateText } from './services/geminiService';
import { exportToPDF, exportToZIP, exportToTXT, downloadSinglePage } from './services/exportUtils';
import { Button } from './components/Button';

// --- CONSTANTS ---
const LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese", 
  "Chinese", "Japanese", "Korean", "Hindi", "Arabic", "Russian"
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'rgba(255, 235, 59, 0.5)', border: 'border-yellow-400', bg: 'bg-yellow-300' },
  { name: 'Green', value: 'rgba(76, 175, 80, 0.5)', border: 'border-green-400', bg: 'bg-green-300' },
  { name: 'Blue', value: 'rgba(33, 150, 243, 0.5)', border: 'border-blue-400', bg: 'bg-blue-300' },
  { name: 'Pink', value: 'rgba(233, 30, 99, 0.5)', border: 'border-pink-400', bg: 'bg-pink-300' },
];

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [documents, setDocuments] = useState<DocumentData[]>(() => {
    const saved = localStorage.getItem('open_scan_docs');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Active editing state
  const [currentDoc, setCurrentDoc] = useState<DocumentData | null>(null);
  const [editorPageIndex, setEditorPageIndex] = useState(0); // For multi-page navigation in editor
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Highlight Tool State
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cleanImageForHighlighting, setCleanImageForHighlighting] = useState<string>('');
  
  // Translation State
  const [showTranslateDialog, setShowTranslateDialog] = useState(false);
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('open_scan_target_lang') || 'Spanish');
  const [sourceLang, setSourceLang] = useState('Auto');
  const [hasCopied, setHasCopied] = useState(false);

  // Export State
  const [showExportSheet, setShowExportSheet] = useState(false);
  
  // Camera & Batch State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanMode, setScanMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [batchPages, setBatchPages] = useState<ScannedPage[]>([]);

  // Selection / Batch Delete State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // UNIFIED DELETE CONFIRMATION STATE
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('open_scan_docs', JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    localStorage.setItem('open_scan_target_lang', targetLang);
  }, [targetLang]);

  useEffect(() => {
    // Capture the PWA install prompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
      });
    }
  };

  // --- SELECTION LOGIC ---
  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      // Exit mode and clear selection
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      // Enter mode
      setIsSelectionMode(true);
    }
  };

  const toggleDocSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // --- DELETE LOGIC ---

  const initiateBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteTargetIds(Array.from(selectedIds));
    setShowDeleteConfirm(true);
  };

  const initiateSingleDelete = (id: string, e: React.MouseEvent) => {
    // CRITICAL: Stop propagation immediately
    e.preventDefault();
    e.stopPropagation();
    setDeleteTargetIds([id]);
    setShowDeleteConfirm(true);
  };

  const executeDelete = () => {
    // 1. Update State
    setDocuments(prev => prev.filter(d => !deleteTargetIds.includes(d.id)));
    
    // 2. Handle View Navigation if needed
    // If we are deleting the currently viewed doc, go back to dashboard
    if (currentDoc && deleteTargetIds.includes(currentDoc.id)) {
      setView(AppView.DASHBOARD);
      setCurrentDoc(null);
    }
    
    // 3. Reset Delete States
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    setDeleteTargetIds([]);
  };

  // --- CAMERA LOGIC ---

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Could not access camera. Please allow permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (view === AppView.CAMERA) {
      startCamera();
      if (batchPages.length === 0) {
        setScanMode('SINGLE');
      }
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [view]);

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      const newPage: ScannedPage = {
        id: generateId(),
        originalDataUrl: dataUrl,
        processedDataUrl: dataUrl,
        filter: FilterType.ORIGINAL,
        rotation: 0
      };

      if (scanMode === 'BATCH') {
        setBatchPages(prev => [...prev, newPage]);
      } else {
        createNewDoc([newPage]);
      }
    }
  };

  const finishBatch = () => {
    if (batchPages.length === 0) return;
    createNewDoc(batchPages);
    setBatchPages([]);
  };

  const createNewDoc = (pages: ScannedPage[]) => {
    const newDoc: DocumentData = {
      id: generateId(),
      title: `Scan ${formatDate(Date.now())}`,
      createdAt: Date.now(),
      category: 'Uncategorized',
      pages: pages,
      aiSummary: ''
    };
    setCurrentDoc(newDoc);
    setEditorPageIndex(0);
    setView(AppView.EDITOR);
  };

  // --- EDITOR LOGIC ---

  const applyFilter = async (filter: FilterType) => {
    if (!currentDoc) return;
    setIsProcessing(true);
    
    const currentPage = currentDoc.pages[editorPageIndex];
    const processed = await processImage(currentPage.originalDataUrl, filter, currentPage.rotation, currentPage.highlightsLayer);
    
    const updatedPage = { ...currentPage, processedDataUrl: processed, filter };
    const updatedPages = [...currentDoc.pages];
    updatedPages[editorPageIndex] = updatedPage;

    setCurrentDoc({ ...currentDoc, pages: updatedPages });
    setIsProcessing(false);
  };

  const rotatePage = async () => {
    if (!currentDoc) return;
    setIsProcessing(true);
    
    const currentPage = currentDoc.pages[editorPageIndex];
    const newRotation = (currentPage.rotation + 90) % 360;
    const processed = await processImage(currentPage.originalDataUrl, currentPage.filter, newRotation, currentPage.highlightsLayer);
    
    const updatedPage = { ...currentPage, processedDataUrl: processed, rotation: newRotation };
    const updatedPages = [...currentDoc.pages];
    updatedPages[editorPageIndex] = updatedPage;

    setCurrentDoc({ ...currentDoc, pages: updatedPages });
    setIsProcessing(false);
  };

  const triggerAIAnalysis = async () => {
    if (!currentDoc || currentDoc.pages.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await analyzeDocument(currentDoc.pages[0].processedDataUrl);
      setCurrentDoc({
        ...currentDoc,
        title: result.title,
        category: result.category,
        aiSummary: result.summary
      });
    } catch (e) {
      alert("AI Analysis failed. Check API configuration.");
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerTranslation = async () => {
    if (!currentDoc || !currentDoc.aiSummary) return;
    setIsProcessing(true);
    try {
      const translatedText = await translateText(currentDoc.aiSummary, targetLang, sourceLang);
      const updatedDoc: DocumentData = {
        ...currentDoc,
        translation: {
          sourceLang,
          targetLang,
          text: translatedText
        }
      };
      setCurrentDoc(updatedDoc);
      setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
      setShowTranslateDialog(false);
    } catch (e) {
      alert("Translation failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyTranslation = () => {
    if (currentDoc?.translation) {
      navigator.clipboard.writeText(currentDoc.translation.text);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const saveDocument = () => {
    if (!currentDoc) return;
    
    setDocuments(prev => {
      const existing = prev.findIndex(d => d.id === currentDoc.id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = currentDoc;
        return copy;
      }
      return [currentDoc, ...prev];
    });
    
    setView(AppView.DASHBOARD);
    setCurrentDoc(null);
    setBatchPages([]); 
  };

  // --- EXPORT LOGIC ---
  const handleExport = async (type: 'pdf' | 'img' | 'txt', imgFormat: 'jpeg' | 'png' | 'webp' = 'jpeg') => {
    if (!currentDoc) return;
    setIsProcessing(true);
    try {
      if (type === 'pdf') await exportToPDF(currentDoc);
      if (type === 'img') {
          if (currentDoc.pages.length === 1) {
              await downloadSinglePage(currentDoc.pages[0], currentDoc.title, imgFormat);
          } else {
              await exportToZIP(currentDoc, imgFormat);
          }
      }
      if (type === 'txt') exportToTXT(currentDoc);
      setShowExportSheet(false);
    } catch (error) {
      console.error(error);
      alert("Export failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HIGHLIGHTING LOGIC ---

  const prepareHighlighting = async () => {
    if (!currentDoc) return;
    const page = currentDoc.pages[editorPageIndex];
    const clean = await processImage(page.originalDataUrl, page.filter, page.rotation, undefined);
    setCleanImageForHighlighting(clean);
    setIsHighlighting(true);
  };

  useEffect(() => {
    if (isHighlighting && currentDoc && editorCanvasRef.current && cleanImageForHighlighting) {
      const canvas = editorCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          if (currentDoc.pages[editorPageIndex].highlightsLayer) {
             const hl = new Image();
             hl.onload = () => ctx.drawImage(hl, 0, 0);
             hl.src = currentDoc.pages[editorPageIndex].highlightsLayer!;
          }
        }
      };
      img.src = cleanImageForHighlighting;
    }
  }, [isHighlighting, cleanImageForHighlighting]);

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent | any) => {
    const canvas = editorCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.nativeEvent && e.nativeEvent.touches && e.nativeEvent.touches.length > 0) {
         clientX = e.nativeEvent.touches[0].clientX;
         clientY = e.nativeEvent.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);
    const ctx = editorCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 40; 
      ctx.strokeStyle = highlightColor;
      ctx.globalCompositeOperation = 'source-over'; 
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoordinates(e);
    const ctx = editorCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = editorCanvasRef.current?.getContext('2d');
    if (ctx) ctx.closePath();
  };

  const saveHighlights = async () => {
    if (editorCanvasRef.current && currentDoc) {
      const highlightsDataUrl = editorCanvasRef.current.toDataURL('image/png'); 
      const page = currentDoc.pages[editorPageIndex];
      const finalComposite = await processImage(
          page.originalDataUrl, 
          page.filter, 
          page.rotation, 
          highlightsDataUrl
      );
      const updatedPages = [...currentDoc.pages];
      updatedPages[editorPageIndex] = { 
          ...updatedPages[editorPageIndex], 
          highlightsLayer: highlightsDataUrl,
          processedDataUrl: finalComposite 
      };
      setCurrentDoc({ ...currentDoc, pages: updatedPages });
      setIsHighlighting(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderDashboard = () => (
    <div className="min-h-screen bg-gray-50 pb-safe relative">
      <header className="bg-white sticky top-0 z-40 px-6 py-4 pt-safe border-b border-gray-100 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Open Scan</h1>
          <p className="text-sm text-gray-500">Free AI Scanner</p>
        </div>
        <div className="flex gap-3 items-center">
          {deferredPrompt && !isSelectionMode && (
            <button type="button" onClick={handleInstallClick} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1">
              <Smartphone size={14} /> Install
            </button>
          )}
          
          {/* Select Toggle Button */}
          {documents.length > 0 && (
            <button 
              type="button"
              onClick={toggleSelectionMode} 
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${isSelectionMode ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {isSelectionMode ? 'Cancel' : 'Select'}
            </button>
          )}

          {!isSelectionMode && (
             <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
               AI
             </div>
          )}
        </div>
      </header>

      <div className="p-4 grid gap-4 pb-28">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
              <Camera size={40} />
            </div>
            <p className="text-lg font-medium text-gray-500">No scans yet</p>
            <p className="text-sm mb-6 text-gray-400">Tap the blue camera button to start</p>
          </div>
        ) : (
          documents.map(doc => (
            <div 
              key={doc.id} 
              onClick={(e) => {
                if (isSelectionMode) {
                  toggleDocSelection(doc.id, e);
                } else {
                  setCurrentDoc(doc); 
                  setView(AppView.DETAILS);
                }
              }} 
              className={`bg-white rounded-2xl p-4 shadow-sm border transition-all cursor-pointer relative group ${
                selectedIds.has(doc.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : 'border-gray-100'
              }`}
            >
              {/* Direct Delete Button (Only in normal mode) - LARGE HIT AREA */}
              {!isSelectionMode && (
                <button
                  type="button"
                  onClick={(e) => initiateSingleDelete(doc.id, e)}
                  className="absolute top-2 right-2 z-30 w-12 h-12 flex items-center justify-center text-gray-400 hover:text-red-600 rounded-full transition-all active:scale-90 active:bg-red-50"
                  aria-label="Delete document"
                >
                  <Trash2 size={20} />
                </button>
              )}

              {/* Selection Checkbox Overlay */}
              {isSelectionMode && (
                <div className="absolute top-4 right-4 z-20">
                   {selectedIds.has(doc.id) ? (
                     <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-md">
                       <Check size={14} strokeWidth={3} />
                     </div>
                   ) : (
                     <div className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white/80 backdrop-blur-sm"></div>
                   )}
                </div>
              )}

              <div className="flex gap-4">
                <div className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 relative">
                  <img src={doc.pages[0].processedDataUrl} className="w-full h-full object-cover" alt="Preview" />
                  {doc.pages.length > 1 && (
                    <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-tl-lg">
                      +{doc.pages.length - 1}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start pr-12">
                      <h3 className={`font-semibold truncate ${selectedIds.has(doc.id) ? 'text-blue-900' : 'text-gray-900'}`}>{doc.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{doc.category}</span>
                        <span className="text-xs text-gray-400">• {formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                  {doc.aiSummary && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-1 leading-relaxed bg-blue-50 px-2 py-1 rounded text-xs truncate">
                      <span className="font-bold text-blue-700">AI:</span> {doc.aiSummary}
                    </p>
                  )}
                  {doc.translation && !doc.aiSummary && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600">
                      <Languages size={12} />
                      <span>Translated to {doc.translation.targetLang}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-30 pb-safe px-4 pointer-events-none">
        {isSelectionMode ? (
          <button 
            type="button"
            onClick={initiateBatchDelete}
            disabled={selectedIds.size === 0}
            className={`pointer-events-auto w-full max-w-sm flex items-center justify-center gap-2 rounded-xl p-4 shadow-xl transition-all ${
              selectedIds.size > 0 
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/30' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Trash2 size={20} />
            <span className="font-bold">Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
          </button>
        ) : (
          <button 
            type="button"
            onClick={() => { setCurrentDoc(null); setView(AppView.CAMERA); }}
            className="pointer-events-auto bg-blue-600 text-white rounded-full p-5 shadow-xl shadow-blue-600/40 hover:bg-blue-700 hover:scale-105 transition-all"
          >
            <Camera size={28} />
          </button>
        )}
      </div>
    </div>
  );

  const renderCamera = () => (
    <div className="fixed inset-0 bg-black flex flex-col z-50 h-safe-screen">
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <video ref={videoRef} autoPlay playsInline className="absolute w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/50">
           <div className="w-full h-full border-2 border-white/50 rounded-lg relative">
             <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
             <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
           </div>
        </div>
        
        {/* Mode Indicator Overlay */}
        <div className="absolute top-8 pt-safe text-white bg-black/40 px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
           {scanMode === 'BATCH' ? `Batch Mode (${batchPages.length})` : 'Single Mode'}
        </div>
      </div>

      <div className="bg-black pt-4 pb-8 px-8 pb-safe">
        {/* Mode Toggle */}
        {batchPages.length === 0 && (
          <div className="flex justify-center mb-6">
            <div className="bg-white/20 p-1 rounded-full flex relative">
               <button 
                 type="button"
                 onClick={() => setScanMode('SINGLE')}
                 className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${scanMode === 'SINGLE' ? 'bg-white text-black' : 'text-white'}`}
               >
                 SINGLE
               </button>
               <button 
                 type="button"
                 onClick={() => setScanMode('BATCH')}
                 className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${scanMode === 'BATCH' ? 'bg-white text-black' : 'text-white'}`}
               >
                 BATCH
               </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* Left Action: Back or Thumbnail */}
          <div className="w-12 h-12 flex items-center justify-center">
            {batchPages.length > 0 ? (
               <div className="relative w-12 h-12 rounded-lg border-2 border-white overflow-hidden">
                 <img src={batchPages[batchPages.length-1].processedDataUrl} className="w-full h-full object-cover" />
                 <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border border-black">
                   {batchPages.length}
                 </div>
               </div>
            ) : (
               <button type="button" onClick={() => setView(AppView.DASHBOARD)} className="text-white p-2 bg-white/10 rounded-full">
                 <ArrowLeft />
               </button>
            )}
          </div>

          {/* Shutter Button */}
          <button type="button" onClick={captureImage} className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center active:scale-90 transition-transform">
            <div className="w-16 h-16 bg-white rounded-full border-2 border-black"></div>
          </button>

          {/* Right Action: Done or Spacer */}
          <div className="w-12 h-12 flex items-center justify-center">
            {batchPages.length > 0 && (
              <button type="button" onClick={finishBatch} className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg animate-bounce-short">
                <Check size={24} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderEditor = () => {
    if (!currentDoc) return null;
    
    // Safety check for index
    const pageCount = currentDoc.pages.length;
    const safeIndex = editorPageIndex >= pageCount ? 0 : editorPageIndex;
    const currentPage = currentDoc.pages[safeIndex];

    if (isHighlighting) {
      return (
        <div className="flex flex-col h-safe-screen bg-gray-900">
           {/* Highlight Toolbar */}
           <div className="flex items-center justify-between px-4 py-3 pt-safe bg-gray-900 text-white border-b border-gray-800 z-10">
              <button type="button" onClick={() => setIsHighlighting(false)} className="text-gray-400 hover:text-white">Cancel</button>
              <div className="flex items-center gap-2">
                <PenTool size={18} className="text-yellow-400" />
                <span className="font-semibold text-sm">Highlight (Page {safeIndex + 1})</span>
              </div>
              <button type="button" onClick={saveHighlights} className="text-blue-400 font-bold">Done</button>
           </div>
           
           {/* Canvas Area */}
           <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-800 p-4 touch-none relative">
              <img src={cleanImageForHighlighting} className="max-w-full max-h-[80vh] shadow-2xl absolute" alt="Background" />
              <canvas 
                ref={editorCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="max-w-full max-h-[80vh] z-10 relative opacity-60 mix-blend-multiply" 
                style={{ touchAction: 'none' }}
              />
           </div>

           {/* Color Picker */}
           <div className="bg-gray-900 border-t border-gray-800 px-4 py-6 pb-safe">
              <div className="flex justify-center gap-6">
                 {HIGHLIGHT_COLORS.map(c => (
                   <button
                     type="button"
                     key={c.name}
                     onClick={() => setHighlightColor(c.value)}
                     className={`w-12 h-12 rounded-full border-4 ${c.bg} ${highlightColor === c.value ? 'border-white scale-110' : 'border-transparent opacity-80'} transition-all`}
                   />
                 ))}
              </div>
              <p className="text-center text-gray-500 text-xs mt-4">Draw to highlight. Changes are saved as a layer.</p>
           </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-safe-screen bg-gray-50">
        <div className="flex items-center justify-between px-4 py-3 pt-safe bg-white border-b border-gray-200 shadow-sm z-10">
          <button type="button" onClick={() => setView(AppView.DASHBOARD)} className="text-gray-600">Cancel</button>
          <h2 className="font-semibold text-gray-800">Edit Scan</h2>
          <button type="button" onClick={saveDocument} className="text-blue-600 font-medium">Save</button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center relative bg-gray-100/50">
          {isProcessing && (
            <div className="absolute inset-0 z-50 bg-white/80 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2"></div>
                <span className="text-sm font-medium text-gray-600">Processing...</span>
              </div>
            </div>
          )}
          
          {/* Main Image Viewer with Navigation */}
          <div className="relative max-w-full">
            <div className="bg-white p-2 shadow-xl rounded-sm">
               <img src={currentPage.processedDataUrl} className="max-h-[60vh] object-contain" alt="Scan" />
            </div>

            {/* Pagination Controls */}
            {pageCount > 1 && (
              <>
                 <button 
                   type="button"
                   onClick={() => setEditorPageIndex(prev => Math.max(0, prev - 1))}
                   disabled={editorPageIndex === 0}
                   className="absolute left-[-20px] top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg disabled:opacity-30 disabled:pointer-events-none hover:bg-white text-gray-700"
                 >
                   <ChevronLeft size={24} />
                 </button>
                 <button 
                   type="button"
                   onClick={() => setEditorPageIndex(prev => Math.min(pageCount - 1, prev + 1))}
                   disabled={editorPageIndex === pageCount - 1}
                   className="absolute right-[-20px] top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg disabled:opacity-30 disabled:pointer-events-none hover:bg-white text-gray-700"
                 >
                   <ChevronRight size={24} />
                 </button>
                 <div className="absolute bottom-[-30px] left-0 right-0 text-center">
                   <span className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium">
                     Page {editorPageIndex + 1} of {pageCount}
                   </span>
                 </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border-t border-gray-200 pb-safe">
          <div className="flex overflow-x-auto no-scrollbar p-4 gap-4">
            <button type="button" onClick={() => applyFilter(FilterType.ORIGINAL)} className={`flex flex-col items-center min-w-[70px] ${currentPage.filter === FilterType.ORIGINAL ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-12 h-12 rounded-lg bg-gray-200 mb-2 flex items-center justify-center overflow-hidden border border-gray-300">
                <img src={currentPage.originalDataUrl} className="w-full h-full object-cover opacity-50" />
              </div>
              <span className="text-xs font-medium text-gray-600">Original</span>
            </button>
            <button type="button" onClick={() => applyFilter(FilterType.GRAYSCALE)} className={`flex flex-col items-center min-w-[70px] ${currentPage.filter === FilterType.GRAYSCALE ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-12 h-12 rounded-lg bg-gray-200 mb-2 flex items-center justify-center grayscale border border-gray-300">
                 <div className="w-full h-full bg-gray-400"></div>
              </div>
              <span className="text-xs font-medium text-gray-600">Gray</span>
            </button>
            <button type="button" onClick={() => applyFilter(FilterType.MAGIC_ENHANCE)} className={`flex flex-col items-center min-w-[70px] ${currentPage.filter === FilterType.MAGIC_ENHANCE ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-12 h-12 rounded-lg bg-blue-100 mb-2 flex items-center justify-center border-2 border-blue-500">
                 <Wand2 size={20} className="text-blue-600" />
              </div>
              <span className="text-xs font-bold text-blue-600">Magic</span>
            </button>
            <button type="button" onClick={() => applyFilter(FilterType.BW)} className={`flex flex-col items-center min-w-[70px] ${currentPage.filter === FilterType.BW ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-12 h-12 rounded-lg bg-black mb-2 flex items-center justify-center border border-gray-300">
                <span className="text-white font-bold text-xs">B&W</span>
              </div>
              <span className="text-xs font-medium text-gray-600">B&W</span>
            </button>
          </div>
          
          <div className="flex justify-around px-4 pb-6 pt-2 border-t border-gray-100">
             <Button variant="ghost" onClick={rotatePage} icon={<Maximize2 size={18} />}>Rotate</Button>
             <Button variant="ghost" onClick={prepareHighlighting} icon={<PenTool size={18} />}>Highlight</Button>
             <Button variant="primary" onClick={triggerAIAnalysis} icon={<Wand2 size={18} />}>AI Identify</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderDetails = () => {
    if (!currentDoc) return null;
    return (
       <div className="min-h-screen bg-gray-50 flex flex-col relative pb-safe">
         {/* Export / Share Sheet */}
         {showExportSheet && (
           <div className="absolute inset-0 z-50 bg-black/50 flex flex-col justify-end">
             <div className="bg-white rounded-t-2xl p-6 pb-safe animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-xl text-gray-900">Export Document</h3>
                  <button type="button" onClick={() => setShowExportSheet(false)} className="bg-gray-100 p-2 rounded-full text-gray-600"><X size={20} /></button>
                </div>
                
                <div className="space-y-4">
                  {/* PDF Option */}
                  <button type="button" onClick={() => handleExport('pdf')} className="w-full flex items-center p-4 bg-gray-50 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors group">
                    <div className="bg-red-100 text-red-600 p-3 rounded-lg mr-4 group-hover:bg-red-200">
                      <FileType size={24} />
                    </div>
                    <div className="text-left">
                      <span className="block font-semibold text-gray-900 group-hover:text-red-800">PDF Document</span>
                      <span className="text-sm text-gray-500">Universal format (Best for printing)</span>
                    </div>
                  </button>
                  
                  {/* Image Options */}
                  <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center mb-3">
                         <div className="bg-blue-100 text-blue-600 p-3 rounded-lg mr-4">
                           <ImageIcon size={24} />
                         </div>
                         <div>
                            <span className="block font-semibold text-gray-900">Image Files {currentDoc.pages.length > 1 ? '(ZIP)' : ''}</span>
                            <span className="text-sm text-gray-500">Select format:</span>
                         </div>
                      </div>
                      <div className="flex gap-2 pl-14">
                         <button type="button" onClick={() => handleExport('img', 'jpeg')} className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700">
                           JPG
                         </button>
                         <button type="button" onClick={() => handleExport('img', 'png')} className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700">
                           PNG
                         </button>
                         <button type="button" onClick={() => handleExport('img', 'webp')} className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700">
                           WEBP
                         </button>
                      </div>
                  </div>

                  {/* Text Option */}
                  <button type="button" onClick={() => handleExport('txt')} className="w-full flex items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
                    <div className="bg-gray-200 text-gray-700 p-3 rounded-lg mr-4 group-hover:bg-gray-300">
                      <FileText size={24} />
                    </div>
                    <div className="text-left">
                      <span className="block font-semibold text-gray-900">Text Summary (.txt)</span>
                      <span className="text-sm text-gray-500">Only AI summary & text</span>
                    </div>
                  </button>
                </div>
             </div>
           </div>
         )}

         {/* Translation Modal Overlay */}
         {showTranslateDialog && (
           <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-gray-800">Translate Document</h3>
                  <button type="button" onClick={() => setShowTranslateDialog(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </div>
                <div className="p-6 space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Source Language</label>
                     <select 
                        value={sourceLang} 
                        onChange={(e) => setSourceLang(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-800"
                     >
                        <option value="Auto">Auto Detect</option>
                        {LANGUAGES.map(l => <option key={`source-${l}`} value={l}>{l}</option>)}
                     </select>
                   </div>
                   <div className="flex justify-center">
                      <ArrowLeft className="rotate-[-90deg] text-gray-400" size={20} />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
                     <select 
                        value={targetLang} 
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-800"
                     >
                        {LANGUAGES.map(l => <option key={`target-${l}`} value={l}>{l}</option>)}
                     </select>
                   </div>
                   <p className="text-xs text-gray-500 text-center">Using Cloud AI for free translation.</p>
                </div>
                <div className="p-6 bg-gray-50">
                  <Button variant="primary" className="w-full" onClick={triggerTranslation} disabled={isProcessing}>
                    {isProcessing ? "Translating..." : "Translate Now"}
                  </Button>
                </div>
             </div>
           </div>
         )}

         {/* Print View Hidden */}
         <div className="print-only">
           <h1>{currentDoc.title}</h1>
           <p>{currentDoc.aiSummary}</p>
           {currentDoc.pages.map(p => (
             <img key={p.id} src={p.processedDataUrl} style={{ width: '100%', marginBottom: '20px' }} />
           ))}
         </div>

         {/* DETAILS HEADER */}
         <div className="bg-white border-b border-gray-200 px-4 py-3 pt-safe flex items-center justify-between no-print sticky top-0 z-10 shadow-sm">
           <button type="button" onClick={() => setView(AppView.DASHBOARD)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-600">
             <ArrowLeft size={24} />
           </button>
           <div className="flex gap-2">
             <button type="button" onClick={(e) => initiateSingleDelete(currentDoc.id, e)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Delete">
               <Trash2 size={20} />
             </button>
             <button type="button" onClick={() => setShowExportSheet(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-md shadow-blue-600/20 active:scale-95 transition-all">
               <Download size={18} />
               <span className="font-medium text-sm">Save / Export</span>
             </button>
           </div>
         </div>

         <div className="flex-1 overflow-y-auto p-4 no-print space-y-4">
            {/* Document Info Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
               <h1 className="text-2xl font-bold text-gray-900 mb-1">{currentDoc.title}</h1>
               <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                 <span className="bg-gray-100 px-2 py-0.5 rounded text-xs uppercase tracking-wide font-medium">{currentDoc.category}</span>
                 <span>•</span>
                 <span>{formatDate(currentDoc.createdAt)}</span>
               </div>
               
               {/* AI Section */}
               {currentDoc.aiSummary ? (
                 <>
                   <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4 relative overflow-hidden">
                     <div className="flex items-center gap-2 mb-2 text-blue-800 font-semibold relative z-10">
                       <Wand2 size={16} />
                       <span>AI Summary</span>
                     </div>
                     <p className="text-gray-700 text-sm leading-relaxed relative z-10">{currentDoc.aiSummary}</p>
                     <Wand2 size={120} className="absolute -bottom-4 -right-4 text-blue-100 opacity-50 z-0 rotate-12" />
                   </div>
                   
                   {currentDoc.translation ? (
                     <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 relative">
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                           <Languages size={16} />
                           <span>Translation ({currentDoc.translation.targetLang})</span>
                         </div>
                         <div className="flex gap-2">
                           <button type="button" onClick={copyTranslation} className="text-emerald-700 hover:bg-emerald-100 p-1 rounded transition-colors" title="Copy Text">
                             {hasCopied ? <Check size={16} /> : <Copy size={16} />}
                           </button>
                           <button type="button" onClick={() => setShowTranslateDialog(true)} className="text-xs text-emerald-600 underline self-center hover:text-emerald-800">Change</button>
                         </div>
                       </div>
                       <p className="text-gray-700 text-sm leading-relaxed">{currentDoc.translation.text}</p>
                     </div>
                   ) : (
                     <Button variant="secondary" onClick={() => setShowTranslateDialog(true)} className="w-full text-sm py-2">
                       <Languages size={16} className="mr-2" /> Translate Text
                     </Button>
                   )}
                 </>
               ) : (
                 <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                   <p className="text-sm text-gray-500 mb-3">Unlock content insights</p>
                   <Button variant="primary" onClick={triggerAIAnalysis} className="text-sm py-2 px-6">
                     <Wand2 size={16} className="mr-2" /> AI Identify & OCR
                   </Button>
                 </div>
               )}
            </div>

            {/* Pages Feed */}
            <div className="space-y-4">
              {currentDoc.pages.map((page, index) => (
                <div key={page.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 relative group">
                   <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-md">
                     Page {index + 1}
                   </div>
                   <img src={page.processedDataUrl} className="w-full h-auto" loading="lazy" />
                </div>
              ))}
            </div>
            
            <div className="h-20"></div>
         </div>
         
         {/* Loading Overlay */}
         {isProcessing && (
            <div className="absolute inset-0 z-[60] bg-white/80 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center p-6 bg-white rounded-2xl shadow-xl">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                <span className="text-sm font-medium text-gray-700">Generating File...</span>
              </div>
            </div>
          )}
       </div>
    );
  };

  return (
    <div className="font-sans antialiased text-gray-900">
      {view === AppView.DASHBOARD && renderDashboard()}
      {view === AppView.CAMERA && renderCamera()}
      {view === AppView.EDITOR && renderEditor()}
      {view === AppView.DETAILS && renderDetails()}
      
      {/* GLOBAL DELETE CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                 <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle size={24} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Document?</h3>
                 <p className="text-gray-500 text-sm mb-6">
                   {deleteTargetIds.length > 1 
                     ? `You are about to delete ${deleteTargetIds.length} items. ` 
                     : "You are about to delete this document. "
                   }
                   This action cannot be undone.
                 </p>
                 <div className="flex gap-3 w-full">
                    <button 
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={executeDelete}
                      className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 shadow-lg shadow-red-600/30 transition-colors"
                    >
                      Delete
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;