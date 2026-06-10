"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Lock, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  EyeOff, 
  Info,
  X
} from "lucide-react";
import confetti from "canvas-confetti";

interface Stats {
  photos: number;
  videos: number;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function MemoryBank() {
  // Stats state (server synced)
  const [stats, setStats] = useState<Stats>({ photos: 30, videos: 10 });
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  
  // Drag & drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadingFile, setUploadingFile] = useState<string>("");
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);

  // Toast notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Fetch initial stats and setup real-time updates
  useEffect(() => {
    fetchStats();
    
    // Poll stats every 5 seconds to sync counts across multiple devices
    const interval = setInterval(fetchStats, 5000);

    return () => {
      clearInterval(interval);
      // Clean up active XHR requests on unmount
      if (activeXhrRef.current) {
        activeXhrRef.current.abort();
      }
    };
  }, []);

  // Process files in the upload queue sequentially
  useEffect(() => {
    if (filesToUpload.length > 0 && currentFileIndex < filesToUpload.length && !isUploading) {
      uploadSingleFile(filesToUpload[currentFileIndex], currentFileIndex, filesToUpload.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesToUpload, currentFileIndex, isUploading]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load statistics:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Helper to validate files
  const validateFile = (file: File): boolean => {
    const validImageTypes = ["image/jpeg", "image/png", "image/webp"];
    const validVideoTypes = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];
    
    const isImage = validImageTypes.includes(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    const isVideo = validVideoTypes.includes(file.type) || /\.(mp4|mov)$/i.test(file.name);

    if (!isImage && !isVideo) {
      showToast("Invalid file type. Only JPG, PNG, WEBP, MP4, and MOV are supported.", "error");
      return false;
    }

    // Size limit: 50MB
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast("File is too large. Maximum size allowed is 50MB.", "error");
      return false;
    }

    return true;
  };

  // Trigger file upload for a single file from the queue
  const uploadSingleFile = (file: File, index: number, total: number) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadingFile(`${file.name} (File ${index + 1} of ${total})`);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    activeXhrRef.current = xhr;

    xhr.open("POST", "/api/upload", true);

    // Track upload progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    // Upload loaded (complete)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            // Success Confetti
            confetti({
              particleCount: 50,
              spread: 60,
              origin: { y: 0.8 },
              colors: ["#06b6d4", "#6366f1", "#10b981"]
            });

            // Update stats immediately
            if (response.updatedStats) {
              setStats(response.updatedStats);
            } else {
              // Fallback fallback state increment
              const fileType = response.fileType;
              setStats((prev) => ({
                ...prev,
                [fileType === "videos" ? "videos" : "photos"]: prev[fileType === "videos" ? "videos" : "photos"] + 1
              }));
            }

            showToast(`Uploaded ${file.name} successfully!`, "success");
          } else {
            showToast(`Failed to upload ${file.name}: ${response.error || "Upload failed."}`, "error");
          }
        } catch {
          showToast(`Server returned invalid response for ${file.name}.`, "error");
        }
      } else {
        showToast(`Failed to upload ${file.name}. Status code: ${xhr.status}`, "error");
      }

      // Finish this file and move to next in queue
      setIsUploading(false);
      setUploadProgress(0);
      activeXhrRef.current = null;

      if (index + 1 < total) {
        setCurrentFileIndex(index + 1);
      } else {
        // Queue complete
        setFilesToUpload([]);
        setCurrentFileIndex(0);
        setUploadingFile("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        showToast("All files successfully processed!", "success");
      }
    };

    xhr.onerror = () => {
      showToast(`Network error occurred while uploading ${file.name}.`, "error");
      setIsUploading(false);
      setUploadProgress(0);
      activeXhrRef.current = null;

      // Try to proceed to next file anyway
      if (index + 1 < total) {
        setCurrentFileIndex(index + 1);
      } else {
        setFilesToUpload([]);
        setCurrentFileIndex(0);
        setUploadingFile("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      showToast("Upload queue aborted by user.", "info");
    }
    setFilesToUpload([]);
    setCurrentFileIndex(0);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadingFile("");
    activeXhrRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag & drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFiles: File[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (validateFile(file)) {
          selectedFiles.push(file);
        }
      }
      if (selectedFiles.length > 0) {
        setFilesToUpload((prev) => [...prev, ...selectedFiles]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles: File[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (validateFile(file)) {
          selectedFiles.push(file);
        }
      }
      if (selectedFiles.length > 0) {
        setFilesToUpload((prev) => [...prev, ...selectedFiles]);
      }
      // Reset input to allow selecting same files
      e.target.value = "";
    }
  };

  const openBrowse = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* Cyber Grid Background Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

      {/* Main Header / Cyberpunk Status */}
      <header className="relative w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md z-10">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 opacity-75 blur-sm animate-pulse" />
              <div className="relative bg-[#090d16] p-2 rounded-lg border border-slate-700">
                <Lock className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 uppercase">
                NEURAL VAULT
              </span>
              <span className="block text-[10px] text-slate-400 tracking-widest uppercase font-semibold">
                Class Memory Repository
              </span>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="tracking-wide">SECURED ONE-WAY SYSTEM ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full px-6 py-12 relative z-10 gap-10">
        
        {/* Hero Title */}
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-100 uppercase">
            Upload All Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-indigo-500">Memories</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base font-mono">
            {"// The identity of who uploaded will remain completely invisible"}
          </p>
        </div>

        {/* Anti-Tracking Warning Banner */}
        <section className="w-full relative rounded-2xl border border-cyan-500/20 bg-cyan-950/10 backdrop-blur-md p-6 overflow-hidden animate-fadeIn">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <EyeOff className="w-24 h-24 text-cyan-500" />
          </div>
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-cyan-200 font-bold text-lg mb-1 tracking-tight flex items-center gap-2">
                100% Secure & Anonymous Blind Vault
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
                This is a secure deposit vault built for our graduating class. IP addresses, session cookies, and file metadata (original file name, creation date, geolocation) are instantly stripped on execution. Files cannot be listed or viewed by the public.
              </p>
            </div>
          </div>
        </section>

        {/* Counter Dashboard */}
        <section className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Photo Counter */}
          <div className="relative group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md p-8 flex items-center justify-between transition-all duration-300 hover:border-cyan-500/40 neon-shadow-cyan">
            <div className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-mono uppercase tracking-widest font-bold">Encrypted Archive</span>
              <span className="text-2xl font-black text-slate-100 uppercase tracking-tight">Photos</span>
              <span className="text-slate-500 text-xs mt-2 font-medium">JPEG, PNG, WEBP</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl mb-3">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-4xl md:text-5xl font-black text-cyan-400 font-mono tracking-tight neon-glow-text-cyan">
                  {loadingStats ? "--" : stats.photos}
                </span>
                <span className="text-xl font-bold text-cyan-500/80 font-mono">+</span>
              </div>
            </div>
          </div>

          {/* Video Counter */}
          <div className="relative group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md p-8 flex items-center justify-between transition-all duration-300 hover:border-indigo-500/40 neon-shadow-indigo">
            <div className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-mono uppercase tracking-widest font-bold">Encrypted Archive</span>
              <span className="text-2xl font-black text-slate-100 uppercase tracking-tight">Videos</span>
              <span className="text-slate-500 text-xs mt-2 font-medium">MP4, MOV</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl mb-3">
                <VideoIcon className="w-6 h-6" />
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-4xl md:text-5xl font-black text-indigo-400 font-mono tracking-tight neon-glow-text-indigo">
                  {loadingStats ? "--" : stats.videos}
                </span>
                <span className="text-xl font-bold text-indigo-500/80 font-mono">+</span>
              </div>
            </div>
          </div>

        </section>

        {/* Upload Box Section */}
        <section className="w-full flex flex-col gap-6">
          
          {/* Dropzone Container */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-3xl border-2 border-dashed transition-all duration-500 p-12 text-center flex flex-col items-center justify-center cursor-pointer overflow-hidden group ${
              isDragging 
                ? "border-cyan-400 bg-cyan-950/20 neon-shadow-cyan scale-[1.01]" 
                : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70"
            }`}
            onClick={openBrowse}
          >
            {/* Ambient glowing radial light in dropzone */}
            <div className="absolute inset-0 bg-radial-gradient from-cyan-500/5 to-transparent pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100" />
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
              multiple
            />

            <div className="relative z-10 flex flex-col items-center">
              {/* Outer pulsing circle ring */}
              <div className={`p-6 rounded-full border border-slate-800 bg-slate-900/60 mb-6 transition-all duration-500 relative ${
                isDragging 
                  ? "border-cyan-400 text-cyan-400 scale-110 shadow-[0_0_20px_rgba(6,182,212,0.3)]" 
                  : "text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 group-hover:scale-105"
              }`}>
                {/* Glowing ring animation */}
                {isDragging && (
                  <div className="absolute -inset-1 rounded-full border border-cyan-500/40 animate-ping pointer-events-none" />
                )}
                <UploadCloud className="w-10 h-10 transition-transform duration-300" />
              </div>

              <h3 className="text-lg font-bold text-slate-100 mb-2 tracking-tight group-hover:text-slate-50 transition-colors">
                {isDragging ? "Drop files to encrypt" : "Drag & drop files to upload anonymously"}
              </h3>
              <p className="text-slate-400 text-sm max-w-sm mb-4 leading-normal">
                or <span className="text-cyan-400 font-semibold group-hover:underline">browse files</span> on your system
              </p>

              {/* Supported Extensions Pills */}
              <div className="flex flex-wrap gap-2 justify-center items-center mt-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-slate-800 bg-slate-900/60 rounded text-slate-400">JPG</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-slate-800 bg-slate-900/60 rounded text-slate-400">PNG</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-slate-800 bg-slate-900/60 rounded text-slate-400">WEBP</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-slate-800 bg-slate-900/60 rounded text-slate-400">MP4</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-slate-800 bg-slate-900/60 rounded text-slate-400">MOV</span>
              </div>
            </div>
          </div>

          {/* Active Uploading / Progress Bar Card */}
          {isUploading && (
            <div className="relative rounded-2xl border border-cyan-500/30 bg-[#0c1322]/80 backdrop-blur-md p-6 animate-fadeIn transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-slate-200 text-xs font-mono truncate max-w-xs md:max-w-md" title={uploadingFile}>
                    Encrypting & uploading: {uploadingFile}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-cyan-400 text-xs font-bold font-mono">
                    {uploadProgress}%
                  </span>
                  <button 
                    onClick={cancelUpload}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Abort Upload"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar container */}
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_rgba(6,182,212,0.6)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

        </section>

        {/* Security Info Card */}
        <footer className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          <div className="flex gap-3 items-start border border-slate-900 bg-slate-950/20 p-4 rounded-xl">
            <Terminal className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-1">Metadata Stripping</h4>
              <p className="text-slate-500 text-xs leading-relaxed">Original names and EXIF geo tags are wiped completely clean on the backend before upload.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start border border-slate-900 bg-slate-950/20 p-4 rounded-xl">
            <Lock className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-1">Secure Vault Storage</h4>
              <p className="text-slate-500 text-xs leading-relaxed">Files are written directly to a designated Google Drive Service Account vault directory.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start border border-slate-900 bg-slate-950/20 p-4 rounded-xl">
            <Info className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-1">No Tracking Logs</h4>
              <p className="text-slate-500 text-xs leading-relaxed">We record absolute file count updates, and never save IP records or browser headers.</p>
            </div>
          </div>
        </footer>

      </main>

      {/* Footer copyright */}
      <footer className="w-full text-center py-6 border-t border-slate-950 text-slate-500 text-[10px] tracking-widest uppercase font-semibold bg-slate-950/30 z-10">
        © 2026 NEURAL VAULT • CLASS MEMORY ACCRETION • ALL SYSTEMS ONLINE
      </footer>

      {/* Custom Toast Notifications Stack */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className={`p-4 rounded-xl border flex items-start gap-3 shadow-xl backdrop-blur-md transition-all duration-300 animate-slideIn ${
              toast.type === "success" 
                ? "border-emerald-500/30 bg-[#061c16]/90 text-emerald-300 shadow-emerald-950/20"
                : toast.type === "error"
                ? "border-rose-500/30 bg-[#240c0f]/90 text-rose-300 shadow-rose-950/20"
                : "border-cyan-500/30 bg-[#071924]/90 text-cyan-300 shadow-cyan-950/20"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {toast.type === "info" && <Info className="w-5 h-5 text-cyan-400" />}
            </div>
            <div className="flex-1 text-sm font-medium">
              {toast.message}
            </div>
            <button 
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-200 transition-colors duration-150 p-0.5 hover:bg-slate-800/50 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
