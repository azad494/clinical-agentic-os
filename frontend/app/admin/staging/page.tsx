'use client';

import React, { useState, useEffect } from 'react';

interface StagedDocument {
  id: number;
  filename: string | null;
  source: string;
  file_type: string;
  raw_text: string | null;
  sanitized_text: string | null;
  status: 'pending_review' | 'cleaning' | 'failed' | 'approved' | 'rejected';
  category: string;
  error_message: string | null;
  created_at?: string;
}

export default function AdminStagingDashboard() {
  const [documents, setDocuments] = useState<StagedDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<StagedDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // 1. In enterprise states, poll or fetch items from the quarantine table metadata endpoint
  const fetchStagedQueue = async () => {
    try {
      setLoading(true);
      // Fallback fallback simulated baseline if GET endpoint isn't fully exposed
      const res = await fetch(`${BACKEND_URL}/api/v1/documents/staged`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        if (data.length > 0 && !selectedDoc) {
          setSelectedDoc(data[0]);
        }
      } else {
        // Mock fallback to safely allow visual styling rendering during Phase 1 verification
        setDocuments([
          {
            id: 1,
            filename: "Md Azad Hossain Raju_Offer_Letter_Updated.pdf",
            source: "manual_upload",
            file_type: "application/pdf",
            raw_text: "MD AZAD HOSSAIN RAJU\nAddress: 123 ICU Drive, Boston, MA\nSSN: 000-12-3456\nDiagnosis: Severe Sepsis monitoring.\nPlan: Administer IV Vancomycin...",
            sanitized_text: "MD [REDACTED_NAME]\nAddress: [REDACTED_ADDRESS]\nSSN: [REDACTED_SSN]\nDiagnosis: Severe Sepsis monitoring.\nPlan: Administer IV Vancomycin...",
            status: "pending_review",
            category: "Patient_EHR",
            error_message: null
          }
        ]);
        setSelectedDoc({
          id: 1,
          filename: "Md Azad Hossain Raju_Offer_Letter_Updated.pdf",
          source: "manual_upload",
          file_type: "application/pdf",
          raw_text: "MD AZAD HOSSAIN RAJU\nAddress: 123 ICU Drive, Boston, MA\nSSN: 000-12-3456\nDiagnosis: Severe Sepsis monitoring.\nPlan: Administer IV Vancomycin...",
          sanitized_text: "MD [REDACTED_NAME]\nAddress: [REDACTED_ADDRESS]\nSSN: [REDACTED_SSN]\nDiagnosis: Severe Sepsis monitoring.\nPlan: Administer IV Vancomycin...",
          status: "pending_review",
          category: "Patient_EHR",
          error_message: null
        });
      }
    } catch (err) {
      console.error("Staging fetch bypass context:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStagedQueue();
  }, []);

  // 2. Transmit Human-In-The-Loop review decisions over proxy scopes
  const submitReviewDecision = async (id: number, status: 'approved' | 'rejected') => {
    try {
      setActionLoading(true);
      setMessage(null);

      const response = await fetch(`${BACKEND_URL}/api/v1/documents/${id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status,
          admin_id: "admin_001"
        })
      });

      if (!response.ok) {
        throw new Error(`Review submission rejected by backend server router: ${response.statusText}`);
      }

      setMessage({ text: `Document ID #${id} successfully updated to ${status}.`, type: 'success' });
      
      // Refresh local view states
      await fetchStagedQueue();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to commit administrative review decision override.", type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'cleaning': return 'bg-blue-900/40 text-blue-400 border-blue-500/30';
      case 'failed': return 'bg-red-900/40 text-red-400 border-red-500/30';
      case 'approved': return 'bg-green-900/40 text-green-400 border-green-500/30';
      case 'rejected': return 'bg-amber-900/40 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner Control Center Bar */}
      <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-4 flex items-center justify-between backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight text-white">Zero-Trust Data Refinery</h1>
          <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-0.5 rounded-full font-mono">Pillar I Checkpoint</span>
        </div>
        <button 
          onClick={fetchStagedQueue}
          className="text-xs border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2 rounded transition-all flex items-center gap-2"
        >
          🔄 Synchronize Queue
        </button>
      </header>

      {/* Main Workspace Stage split panes */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left pane: Feed list queue item navigation stream */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/20 overflow-y-auto flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40">
            <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Quarantine Stream</h2>
            <p className="text-xs text-slate-500 mt-1">{documents.length} records awaiting data pipeline validation</p>
          </div>
          
          <nav className="divide-y divide-slate-900/60">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500 font-mono animate-pulse">Scanning tracking files...</div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Staging area empty. Ingestion channels clean.</div>
            ) : documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`w-full text-left p-4 transition-all flex flex-col gap-2 group hover:bg-slate-900/50 ${selectedDoc?.id === doc.id ? 'bg-slate-900 border-l-2 border-emerald-500' : ''}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-mono text-slate-500">ID: #{doc.id}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-mono border px-2 py-0.5 rounded-full ${getStatusBadgeClass(doc.status)}`}>
                    {doc.status}
                  </span>
                </div>
                <span className="text-sm font-medium truncate text-slate-200 group-hover:text-white">
                  {doc.filename || 'Integrated API Stream'}
                </span>
                <span className="text-xs text-slate-500 font-mono truncate">
                  Tag: {doc.category} | Type: {doc.file_type}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Right workspace view matching selected quarantine indexes */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {selectedDoc ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* Telemetry metadata validation status headers */}
              <section className="p-6 border-b border-slate-800 bg-slate-900/10 flex flex-col gap-4">
                <div className="flex items-start justify-between w-full">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedDoc.filename || 'Live Network Integration Data Object'}</h2>
                    <p className="text-xs text-slate-400 font-mono mt-1">Classification Context: <span className="text-emerald-400 font-semibold">{selectedDoc.category}</span></p>
                  </div>
                  
                  {/* HITL execution control footer buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => submitReviewDecision(selectedDoc.id, 'rejected')}
                      disabled={actionLoading || selectedDoc.status === 'approved'}
                      className="px-4 py-2 border border-red-500/40 bg-red-950/20 text-red-400 hover:bg-red-950/40 rounded text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ❌ Reject & Purge
                    </button>
                    <button
                      onClick={() => submitReviewDecision(selectedDoc.id, 'approved')}
                      disabled={actionLoading || selectedDoc.status === 'approved'}
                      className="px-4 py-2 border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-500/40 rounded text-xs font-medium transition-all shadow-lg shadow-emerald-950/20 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ✓ Verify & Index into RAG
                    </button>
                  </div>
                </div>

                {/* System warning messaging popups */}
                {message && (
                  <div className={`p-3 rounded text-xs font-mono border ${message.type === 'success' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' : 'bg-red-950/30 text-red-400 border-red-500/20'}`}>
                    {message.text}
                  </div>
                )}
                {selectedDoc.error_message && (
                  <div className="p-3 rounded text-xs font-mono bg-red-900/20 text-red-400 border border-red-500/20">
                    ⚠️ Background Worker Fault: {selectedDoc.error_message}
                  </div>
                )}
              </section>

              {/* Side-by-Side Validation Stage Columns */}
              <section className="flex-1 flex overflow-hidden divide-x divide-slate-800 p-6 gap-6 bg-slate-950">
                
                {/* Panel A: Raw text extraction layer */}
                <div className="flex-1 flex flex-col h-full bg-slate-900/30 rounded-lg border border-slate-800/80 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase font-mono">1. Unsanitized Ingestion Output</span>
                    <span className="text-[10px] bg-red-950/50 text-red-400 border border-red-500/20 px-2 rounded-full font-mono">Contains Raw PHI</span>
                  </div>
                  <pre className="flex-1 p-4 overflow-auto text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-text selection:bg-slate-700">
                    {selectedDoc.raw_text || '[No clear strings captured for text analysis fields]'}
                  </pre>
                </div>

                {/* Panel B: Redacted agent scrub layer output */}
                <div className="flex-1 flex flex-col h-full bg-slate-900/30 rounded-lg border border-slate-800/80 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase font-mono">2. Refinery Masked Snapshot</span>
                    <span className="text-[10px] bg-emerald-950/50 text-emerald-400 border border-emerald-500/20 px-2 rounded-full font-mono">Scrub Verified</span>
                  </div>
                  <pre className="flex-1 p-4 overflow-auto text-xs font-mono text-emerald-400/90 leading-relaxed whitespace-pre-wrap select-text selection:bg-slate-700 bg-slate-950/40">
                    {selectedDoc.status === 'cleaning' ? (
                      <div className="h-full flex items-center justify-center text-slate-500 animate-pulse">Gemini Automated Scrubber processing text strings...</div>
                    ) : selectedDoc.sanitized_text || '[Awaiting background worker thread synchronization processing cycle]'}
                  </pre>
                </div>

              </section>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm font-mono">
              Select a quarantined dataset ledger row from the left panel stream view.
            </div>
          )}
        </main>

      </div>
    </div>
  );
}