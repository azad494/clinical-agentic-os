"use client";
import React, { useState, useEffect, useRef } from "react";

export default function Home() {
  // --- STATE ---
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello. I am your Clinical Meta-Agent. My WebSocket is open. How can I assist you?" }
  ]);
  const [input, setInput] = useState("");
  const [dbStatus, setDbStatus] = useState({ postgres: "Connecting...", qdrant: "Connecting..." });
  const [isUploading, setIsUploading] = useState(false);

  // --- WEBSOCKET REFERENCE ---
  const ws = useRef<WebSocket | null>(null);

  // --- HOOK: Initial Setup (Health Check & WebSocket) ---
  useEffect(() => {
    // 1. Fetch Health
    const fetchHealth = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/health");
        const data = await response.json();
        setDbStatus({
          postgres: data.postgres_status === "connected" ? "Connected" : "Disconnected",
          qdrant: data.qdrant_status === "connected" ? "Connected" : "Disconnected",
        });
      } catch (error) {
        setDbStatus({ postgres: "Error", qdrant: "Error" });
      }
    };
    fetchHealth();

    // 2. Connect to WebSocket
    ws.current = new WebSocket("ws://127.0.0.1:8000/ws/chat");
    
    ws.current.onopen = () => console.log("WebSocket Connected!");
    
    // 3. Listen for incoming messages from Python
    ws.current.onmessage = (event) => {
      const incomingMessage = JSON.parse(event.data);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg.content === "Thinking...") {
          return [...prev.slice(0, -1), incomingMessage];
        }
        return [...prev, incomingMessage];
      });
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "Connected") return "text-green-500 font-medium";
    if (status === "Error" || status === "Disconnected") return "text-red-500 font-medium";
    return "text-yellow-500 animate-pulse";
  };

  // --- HANDLER: Send Chat Message to Python ---
  const handleSend = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!input.trim() || !ws.current) return;
    
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    ws.current.send(input);
    setInput("");
  };

  // --- HANDLER: Upload File to Python ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    setMessages((prev) => [...prev, { role: "user", content: `📎 Uploading document: ${file.name}...` }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: `✅ Successfully ingested ${file.name} into Qdrant.` }]);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ Error uploading ${file.name}. Is the backend running?` }]);
    } finally {
      setIsUploading(false);
      e.target.value = ''; 
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 font-sans flex flex-col">
      <header className="mb-8 border-b border-neutral-800 pb-6 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Clinical Agentic OS</h1>
          <p className="text-neutral-400 mt-2 text-lg">Executive Command Center & Multi-RAG Orchestration</p>
        </div>
        <div className="text-right">
          <span className="px-3 py-1 bg-blue-900/50 text-blue-400 text-sm font-medium rounded-full border border-blue-800">
            v1.0.0-alpha
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0">
        <section className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-neutral-200">Meta-Agent Status</h2>
          <div className="flex items-center text-green-400">
            <span className="relative flex h-3 w-3 mr-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-medium">System Online & Waiting</span>
          </div>
        </section>

        <section className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-neutral-200">Infrastructure</h2>
          <div className="space-y-2">
            <p className="text-neutral-500 flex justify-between">
              <span>PostgreSQL:</span> 
              <span className={getStatusColor(dbStatus.postgres)}>{dbStatus.postgres}</span>
            </p>
            <p className="text-neutral-500 flex justify-between">
              <span>Qdrant:</span> 
              <span className={getStatusColor(dbStatus.qdrant)}>{dbStatus.qdrant}</span>
            </p>
          </div>
        </section>

        <section className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-neutral-200">FinOps Telemetry</h2>
          <div className="space-y-2">
            <p className="text-neutral-400 flex justify-between">
              <span>Session Cost:</span> <span className="font-mono text-white">$0.0000</span>
            </p>
            <p className="text-neutral-400 flex justify-between">
              <span>Total Tokens:</span> <span className="font-mono text-white">0</span>
            </p>
          </div>
        </section>
      </div>

      <section className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg flex flex-col overflow-hidden min-h-[400px]">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div 
                className={`max-w-[75%] p-4 rounded-2xl ${
                  msg.role === "user" 
                    ? "bg-blue-600 text-white rounded-br-none" 
                    : "bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-neutral-950 border-t border-neutral-800">
          <form onSubmit={handleSend} className="flex gap-4 items-center">
            
            {/* NEW: File Upload Button */}
            <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-3 rounded-lg border border-neutral-700 transition-colors flex items-center justify-center" title="Upload Clinical Document">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf,.txt,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query patient data, request summaries, or trigger agent workflows..."
              className="flex-1 bg-neutral-900 border border-neutral-700 text-neutral-100 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Command
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}