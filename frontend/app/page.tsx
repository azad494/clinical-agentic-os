"use client";
import React, { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello. I am your Clinical Meta-Agent. My WebSocket is open. How can I assist you?" }
  ]);
  const [input, setInput] = useState("");
  const [dbStatus, setDbStatus] = useState({ postgres: "Connecting...", qdrant: "Connecting..." });
  const [isUploading, setIsUploading] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
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

    ws.current = new WebSocket("ws://127.0.0.1:8000/ws/chat");
    ws.current.onmessage = (event) => {
      const incomingMessage = JSON.parse(event.data);
      setMessages((prev) => [...prev, incomingMessage]);
    };
    return () => ws.current?.close();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "Connected") return "text-green-500";
    return "text-red-500";
  };

  const handleSend = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!input.trim() || !ws.current) return;
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    ws.current.send(input);
    setInput("");
  };

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

      const data = await response.json();

      if (response.ok) {
        // Now dynamically using the backend message
        setMessages((prev) => [...prev, { role: "assistant", content: `✅ ${data.message}` }]);
      } else {
        throw new Error(data.message || "Upload failed");
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ Error: ${error instanceof Error ? error.message : "Backend connection failed"}` }]);
    } finally {
      setIsUploading(false);
      e.target.value = ''; 
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 font-sans flex flex-col">
      <header className="mb-8 border-b border-neutral-800 pb-6">
        <h1 className="text-4xl font-extrabold text-white">Clinical Agentic OS</h1>
        <p className="text-neutral-400">Executive Command Center & Multi-RAG Orchestration</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Meta-Agent Status */}
        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
          <h2 className="text-lg font-semibold mb-2 text-neutral-200">Meta-Agent Status</h2>
          <div className="flex items-center text-green-400">
            <span className="relative flex h-3 w-3 mr-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-medium">System Online & Waiting</span>
          </div>
        </div>

        {/* Card 2: Infrastructure */}
        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
          <h2 className="text-lg font-semibold mb-2 text-neutral-200">Infrastructure</h2>
          <div className="space-y-2">
            <p className="flex justify-between text-neutral-500">
              <span>PostgreSQL:</span> <span className={getStatusColor(dbStatus.postgres)}>{dbStatus.postgres}</span>
            </p>
            <p className="flex justify-between text-neutral-500">
              <span>Qdrant:</span> <span className={getStatusColor(dbStatus.qdrant)}>{dbStatus.qdrant}</span>
            </p>
          </div>
        </div>

        {/* Card 3: FinOps Telemetry (Restored) */}
        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
          <h2 className="text-lg font-semibold mb-2 text-neutral-200">FinOps Telemetry</h2>
          <div className="space-y-2">
            <p className="text-neutral-400 flex justify-between">
              <span>Session Cost:</span> <span className="font-mono text-white">$0.0000</span>
            </p>
            <p className="text-neutral-400 flex justify-between">
              <span>Total Tokens:</span> <span className="font-mono text-white">0</span>
            </p>
          </div>
        </div>
      </div>

      <section className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] p-4 rounded-2xl ${msg.role === "user" ? "bg-blue-600" : "bg-neutral-800"}`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-neutral-950 border-t border-neutral-800">
          <form onSubmit={handleSend} className="flex gap-4">
            <label className="cursor-pointer bg-neutral-800 p-3 rounded-lg hover:bg-neutral-700">
              📎
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Command the agent..."
              className="flex-1 bg-neutral-900 border border-neutral-700 px-4 py-3 rounded-lg focus:outline-none"
            />
            <button type="submit" className="bg-blue-600 px-8 py-3 rounded-lg font-medium">Send</button>
          </form>
        </div>
      </section>
    </main>
  );
}