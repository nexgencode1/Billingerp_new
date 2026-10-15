"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Cpu, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/common/Button";
import { RankedBars } from "@/components/reports/ReportCharts";
import { formatCurrency } from "@/lib/utils";

interface AskAnswer {
  answer: string;
  intent: string;
  period: string;
  engine: string;
  columns: string[];
  rows: (string | number | null)[][];
  chart: { label: string; value: number }[];
  link: string | null;
}

interface Turn {
  question: string;
  result?: AskAnswer;
  error?: string;
}

const EXAMPLES = [
  "Is mahine ki sale kitni hui?",
  "Last month profit",
  "Top 5 products this year",
  "Kaun kaun par udhar baki hai?",
  "Cash aur bank mein kitna paisa hai?",
  "Pichhle mahine kharcha kitna hua?",
  "GST collected last month",
  "Month wise trend",
  "Low stock items",
  "Sabse bade grahak is saal",
];

const MONEY_COLUMNS = /amount|sales|due|value|profit|balance|tax|taxable|purchases|expenses/i;

export default function AskPage() {
  useDocumentTitle("Ask Your Business");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ask/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setModelAvailable(d?.modelAvailable ?? false))
      .catch(() => setModelAvailable(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion("");
    setBusy(true);
    setTurns((t) => [...t, { question: text }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json().catch(() => ({}));
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? (res.ok ? { ...turn, result: data } : { ...turn, error: data.error ?? "Could not answer." }) : turn)));
    } catch {
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: "Network error." } : turn)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Sparkles className="h-5 w-5 text-blue-600" /> Ask Your Business
          </h1>
          <p className="text-sm text-slate-500">Hindi, Hinglish ya English mein poochhiye — answers come straight from your own reports.</p>
        </div>
        {modelAvailable !== null && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${modelAvailable ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
            title={modelAvailable ? "A local AI model (Ollama) understands your question" : "Install Ollama (free) and run `ollama pull llama3.1` for AI answers"}
          >
            {modelAvailable ? <Bot className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
            {modelAvailable ? "AI mode (local Ollama)" : "Smart search mode"}
          </span>
        )}
      </div>

      {turns.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => ask(e)} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-blue-400 hover:bg-blue-50">
                {e}
              </button>
            ))}
          </div>
          {modelAvailable === false && (
            <p className="mt-3 text-xs text-slate-500">
              Works offline with built-in understanding of common questions. For free, private AI that understands any phrasing: install{" "}
              <b>Ollama</b> on this computer and run <code className="rounded bg-slate-100 px-1">ollama pull llama3.1</code> — this page switches
              to AI mode automatically. Your data never leaves your machine.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4" aria-live="polite">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">{turn.question}</div>
            {!turn.result && !turn.error && <div className="self-start rounded-2xl bg-white px-4 py-2 text-sm text-slate-400">Thinking…</div>}
            {turn.error && <div className="self-start rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{turn.error}</div>}
            {turn.result && <AnswerCard result={turn.result} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-0 flex gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. pichhle mahine ka munafa kitna hua?"
          maxLength={500}
          aria-label="Your question"
          className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" loading={busy} disabled={!question.trim()}>
          <Send className="h-4 w-4" /> Ask
        </Button>
      </form>
    </div>
  );
}

function AnswerCard({ result }: { result: AskAnswer }) {
  const showChart = result.chart.length > 1 && result.chart.some((c) => c.value > 0);
  return (
    <div className="self-stretch rounded-2xl rounded-bl-sm border border-slate-200 bg-white p-4">
      <p className="text-sm leading-relaxed text-slate-800">{result.answer}</p>
      <p className="mt-1 text-xs text-slate-400">
        {result.period} · {result.engine.startsWith("ollama") ? `AI (${result.engine.slice(7)})` : "smart search"}
      </p>
      {showChart && (
        <div className="mt-3">
          <RankedBars items={result.chart.map((c) => ({ name: c.label, amount: c.value }))} limit={8} />
        </div>
      )}
      {result.rows.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto rounded border border-slate-100">
          <table className="w-full min-w-max text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                {result.columns.map((c) => (
                  <th key={c} className="px-2 py-1.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {r.map((cell, j) => (
                    <td key={j} className={`px-2 py-1 ${typeof cell === "number" ? "text-right tabular-nums" : ""}`}>
                      {typeof cell === "number" && MONEY_COLUMNS.test(result.columns[j] ?? "") ? formatCurrency(cell) : String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.link && (
        <Link href={result.link} className="mt-2 inline-block text-xs text-blue-600 hover:underline">
          Open full report →
        </Link>
      )}
    </div>
  );
}
