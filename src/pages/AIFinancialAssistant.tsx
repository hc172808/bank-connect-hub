import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Brain, Send, TrendingUp, TrendingDown, PiggyBank,
  Lightbulb, BarChart3, Target, Zap, RefreshCw, Sparkles,
  DollarSign, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { startOfMonth, subMonths, format, differenceInDays } from "date-fns";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: Date;
}

interface FinancialData {
  monthlyIncome: number;
  monthlyExpenses: number;
  totalBalance: number;
  savingsRate: number;
  topCategories: { category: string; amount: number }[];
  txCount: number;
  avgTxAmount: number;
  largestExpense: number;
  recurringExpenses: number;
  loaded: boolean;
}

const QUICK_QUESTIONS = [
  "How is my spending this month?",
  "Am I saving enough?",
  "What are my biggest expenses?",
  "How can I improve my finances?",
  "What's my financial health score?",
  "Give me a savings plan",
  "Am I on track for my goals?",
  "How much can I invest?",
];

function buildAIResponse(question: string, data: FinancialData): string {
  const q = question.toLowerCase();
  const net = data.monthlyIncome - data.monthlyExpenses;
  const healthScore = Math.max(0, Math.min(100,
    (data.savingsRate >= 20 ? 30 : data.savingsRate >= 10 ? 20 : 10) +
    (net > 0 ? 25 : 0) +
    (data.totalBalance > data.monthlyExpenses * 3 ? 25 : data.totalBalance > data.monthlyExpenses ? 15 : 5) +
    (data.txCount > 0 ? 20 : 0)
  ));

  if (!data.loaded) return "I'm still loading your financial data. Please wait a moment and try again.";

  if (q.includes("spending") || q.includes("expenses")) {
    const topCat = data.topCategories[0];
    return `📊 **This Month's Spending Analysis**\n\nYou've spent **$${data.monthlyExpenses.toFixed(2)}** this month across ${data.txCount} transactions (avg $${data.avgTxAmount.toFixed(2)} each).\n\n${topCat ? `Your biggest spending category is **${topCat.category}** at $${topCat.amount.toFixed(2)}.` : ""}\n\n${data.monthlyExpenses > data.monthlyIncome ? "⚠️ You're spending more than you earn. Consider reviewing your largest expenses." : `✅ You're within your income — you have $${net.toFixed(2)} left.`}`;
  }

  if (q.includes("saving") || q.includes("save")) {
    if (data.savingsRate >= 20) {
      return `🌟 **Excellent Savings Habit!**\n\nYou're saving **${data.savingsRate.toFixed(1)}%** of your income — well above the recommended 20%. Keep it up!\n\nWith your current rate, you're saving **$${(data.monthlyIncome * data.savingsRate / 100).toFixed(2)}/month**. Over a year, that's **$${(data.monthlyIncome * data.savingsRate / 100 * 12).toFixed(2)}**.\n\n💡 Tip: Consider moving extra savings into higher-yield instruments like fixed deposits or investments.`;
    } else if (data.savingsRate >= 10) {
      return `👍 **Good Start on Savings**\n\nYou're saving **${data.savingsRate.toFixed(1)}%** of your income. The recommended target is 20%.\n\nTo reach 20%, you need to save an extra **$${((data.monthlyIncome * 0.20) - (data.monthlyIncome * data.savingsRate / 100)).toFixed(2)}/month**.\n\n💡 Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.`;
    } else {
      return `⚠️ **Savings Need Attention**\n\nYour current savings rate is **${data.savingsRate.toFixed(1)}%** — below the recommended 20%.\n\n📋 Quick actions:\n• Cut the top expense category by 10%\n• Set up automatic savings transfer on payday\n• Review subscriptions and recurring expenses ($${data.recurringExpenses.toFixed(2)}/month)\n\nEven saving $${(data.monthlyIncome * 0.05).toFixed(2)}/month (5%) is a great start!`;
    }
  }

  if (q.includes("biggest") || q.includes("largest") || q.includes("top")) {
    if (data.topCategories.length === 0) {
      return "I don't have enough transaction data to identify your top expense categories yet. As you make more transactions, I'll be able to give you detailed insights.";
    }
    const catList = data.topCategories.slice(0, 5).map((c, i) =>
      `${i + 1}. **${c.category}** — $${c.amount.toFixed(2)}`
    ).join("\n");
    return `💸 **Your Top Expense Categories**\n\n${catList}\n\nYour single largest expense was **$${data.largestExpense.toFixed(2)}**.\n\n💡 Focus on reducing your top category first — even a 20% cut there saves **$${(data.topCategories[0]?.amount * 0.2).toFixed(2)}** this month.`;
  }

  if (q.includes("health") || q.includes("score")) {
    const label = healthScore >= 80 ? "Excellent 🌟" : healthScore >= 60 ? "Good 👍" : healthScore >= 40 ? "Fair ⚠️" : "Needs Work 🔴";
    const tips = healthScore < 80 ? [
      data.savingsRate < 20 ? `• Increase savings rate to 20% (currently ${data.savingsRate.toFixed(1)}%)` : null,
      net < 0 ? "• Your expenses exceed income — reduce spending urgently" : null,
      data.totalBalance < data.monthlyExpenses * 3 ? "• Build emergency fund: aim for 3 months of expenses" : null,
    ].filter(Boolean) : ["• Your finances are healthy — focus on investing surplus"];
    return `📊 **Financial Health Score: ${healthScore}/100 — ${label}**\n\n• Monthly Income: $${data.monthlyIncome.toFixed(2)}\n• Monthly Expenses: $${data.monthlyExpenses.toFixed(2)}\n• Net: $${net.toFixed(2)}\n• Savings Rate: ${data.savingsRate.toFixed(1)}%\n\n${tips.join("\n")}`;
  }

  if (q.includes("invest") || q.includes("investment")) {
    const investable = Math.max(0, net - data.monthlyExpenses * 0.1);
    if (investable <= 0) {
      return "⚠️ To invest, you first need to build a positive monthly surplus. Focus on reducing expenses or increasing income before investing.";
    }
    return `📈 **Investment Potential**\n\nBased on your income/expense balance, you could safely invest up to **$${investable.toFixed(2)}/month** after maintaining an emergency buffer.\n\n💡 Smart allocation:\n• 40% — Low-risk (savings account, bonds)\n• 40% — Medium-risk (ETFs, mutual funds)\n• 20% — Higher-risk (stocks, crypto)\n\nStarting with just $${(investable * 0.5).toFixed(2)}/month in a diversified fund can grow significantly over time.`;
  }

  if (q.includes("improve") || q.includes("better") || q.includes("tips")) {
    const tips = [
      net < 0 ? "🔴 **Urgent**: You're spending more than you earn — reduce the top expense category" : null,
      data.savingsRate < 20 ? `💡 Boost savings rate from ${data.savingsRate.toFixed(1)}% to 20%` : null,
      data.totalBalance < data.monthlyExpenses * 3 ? "🏦 Build a 3-month emergency fund" : null,
      data.recurringExpenses > data.monthlyExpenses * 0.4 ? "📋 Review recurring expenses — they're >40% of spending" : null,
      "📱 Set spending alerts for your top expense category",
      "🎯 Create specific savings goals to stay motivated",
    ].filter(Boolean);
    return `🚀 **Personalized Financial Tips**\n\n${tips.slice(0, 5).join("\n")}\n\nWould you like me to create a detailed savings plan based on your data?`;
  }

  if (q.includes("plan") || q.includes("budget") || q.includes("goal")) {
    const savingsTarget = data.monthlyIncome * 0.20;
    const budgetFor50 = data.monthlyIncome * 0.50;
    const budgetFor30 = data.monthlyIncome * 0.30;
    return `📋 **Your 50/30/20 Budget Plan**\n\nBased on your monthly income of $${data.monthlyIncome.toFixed(2)}:\n\n• 🏠 **Needs (50%)**: $${budgetFor50.toFixed(2)} — rent, food, utilities, transport\n• 🎭 **Wants (30%)**: $${budgetFor30.toFixed(2)} — entertainment, dining, shopping\n• 💰 **Savings (20%)**: $${savingsTarget.toFixed(2)}/month\n\nYou're currently spending **$${data.monthlyExpenses.toFixed(2)}** — that's **${((data.monthlyExpenses / data.monthlyIncome) * 100).toFixed(0)}%** of income.\n\n${data.monthlyExpenses > data.monthlyIncome * 0.80 ? "⚠️ You're over budget. Identify which category to cut first." : "✅ You're within budget. Focus on hitting the 20% savings target."}`;
  }

  if (q.includes("track") || q.includes("on track")) {
    return `🎯 **Goal Tracking Summary**\n\n• Emergency Fund: ${data.totalBalance >= data.monthlyExpenses * 3 ? "✅ Funded (3+ months)" : `⚠️ ${((data.totalBalance / (data.monthlyExpenses * 3)) * 100).toFixed(0)}% funded — target $${(data.monthlyExpenses * 3).toFixed(2)}`}\n• Savings Rate: ${data.savingsRate >= 20 ? "✅ On track (≥20%)" : `⚠️ ${data.savingsRate.toFixed(1)}% — target 20%`}\n• Monthly Budget: ${net >= 0 ? "✅ Surplus" : "🔴 Deficit"}\n\n${net > 0 ? `Great news — you have a $${net.toFixed(2)} monthly surplus to accelerate your goals!` : `Focus on closing the $${Math.abs(net).toFixed(2)} monthly deficit first.`}`;
  }

  // Generic fallback
  return `💬 I analyzed your financial data and here's a quick summary:\n\n• Monthly Income: $${data.monthlyIncome.toFixed(2)}\n• Monthly Expenses: $${data.monthlyExpenses.toFixed(2)}\n• Net: $${(data.monthlyIncome - data.monthlyExpenses).toFixed(2)}\n• Savings Rate: ${data.savingsRate.toFixed(1)}%\n\nAsk me about your spending, savings rate, financial health, or investment potential for detailed analysis!`;
}

export default function AIFinancialAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "👋 Hi! I'm your AI Financial Assistant. I've analyzed your transaction history and I'm ready to give you personalized financial insights.\n\nAsk me anything about your spending, savings, or financial health — or tap one of the quick questions below!",
      time: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [data, setData] = useState<FinancialData>({
    monthlyIncome: 0, monthlyExpenses: 0, totalBalance: 0, savingsRate: 0,
    topCategories: [], txCount: 0, avgTxAmount: 0, largestExpense: 0,
    recurringExpenses: 0, loaded: false,
  });
  const [loadingData, setLoadingData] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    loadFinancialData();
  }, []);

  const loadFinancialData = async () => {
    setLoadingData(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const monthStart = startOfMonth(new Date()).toISOString();
      const prevMonthStart = startOfMonth(subMonths(new Date(), 1)).toISOString();

      const [walletRes, txRes, prevTxRes] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).eq("wallet_type", "main").single(),
        supabase.from("transactions").select("amount, transaction_type, description, created_at")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .gte("created_at", monthStart).eq("status", "completed").limit(500),
        supabase.from("transactions").select("amount, transaction_type")
          .eq("sender_id", user.id)
          .gte("created_at", prevMonthStart).lt("created_at", monthStart)
          .eq("status", "completed").limit(200),
      ]);

      const txs = txRes.data || [];
      const balance = (walletRes.data as { balance: number } | null)?.balance || 0;

      let income = 0, expenses = 0, largest = 0;
      const catMap: Record<string, number> = {};
      const hourCounts: Record<number, number> = {};

      txs.forEach(t => {
        const isIncoming = t.transaction_type === "deposit" || t.transaction_type === "transfer_in" || t.transaction_type === "receive";
        if (isIncoming) {
          income += t.amount;
        } else {
          expenses += t.amount;
          if (t.amount > largest) largest = t.amount;
          const cat = t.description?.split(" ")[0] || "Other";
          catMap[cat] = (catMap[cat] || 0) + t.amount;
        }
        const hour = new Date(t.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const topCategories = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([category, amount]) => ({ category, amount }));

      const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
      const recurring = (prevTxRes.data || []).reduce((s, t) => s + t.amount, 0);

      setData({
        monthlyIncome: income,
        monthlyExpenses: expenses,
        totalBalance: balance,
        savingsRate: Math.max(0, savingsRate),
        topCategories,
        txCount: txs.length,
        avgTxAmount: txs.length > 0 ? expenses / Math.max(1, txs.filter(t => t.transaction_type !== "deposit").length) : 0,
        largestExpense: largest,
        recurringExpenses: recurring,
        loaded: true,
      });
    } catch (err) {
      console.error("AI assistant data load error:", err);
    }
    setLoadingData(false);
  };

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: text.trim(), time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    setTimeout(() => {
      const response = buildAIResponse(text, data);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: response,
        time: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 600);
  };

  const formatText = (text: string) => {
    return text.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong>${m}</strong>`);
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: bold }} />;
    });
  };

  const healthScore = Math.max(0, Math.min(100,
    (data.savingsRate >= 20 ? 30 : data.savingsRate >= 10 ? 20 : 10) +
    (data.monthlyIncome > data.monthlyExpenses ? 25 : 0) +
    (data.totalBalance > data.monthlyExpenses * 3 ? 25 : data.totalBalance > data.monthlyExpenses ? 15 : 5) +
    (data.loaded ? 20 : 0)
  ));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-gradient-to-r from-violet-700 to-indigo-600 text-white p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-black flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> AI Financial Assistant
            </h1>
            <p className="text-xs text-white/70">Powered by your real financial data</p>
          </div>
          <Button variant="ghost" size="icon" onClick={loadFinancialData} className="text-white">
            <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: TrendingUp, label: "Income", value: `$${data.monthlyIncome.toFixed(0)}`, color: "text-green-300" },
            { icon: TrendingDown, label: "Spent", value: `$${data.monthlyExpenses.toFixed(0)}`, color: "text-red-300" },
            { icon: PiggyBank, label: "Saving", value: `${data.savingsRate.toFixed(0)}%`, color: "text-yellow-300" },
            { icon: BarChart3, label: "Health", value: `${healthScore}`, color: healthScore >= 70 ? "text-green-300" : "text-orange-300" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white/10 rounded-xl p-2 text-center">
              <Icon className={`h-4 w-4 mx-auto mb-0.5 ${color}`} />
              <p className={`text-sm font-bold ${color}`}>{value}</p>
              <p className="text-[9px] text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm space-y-1 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted rounded-bl-sm"
            }`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1 mb-1">
                  <Brain className="h-3 w-3 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600">AI ASSISTANT</span>
                </div>
              )}
              <div className="space-y-0.5">{formatText(msg.text)}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="shrink-0 text-xs bg-muted hover:bg-primary/10 border rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage(input)}
          placeholder="Ask about your finances…"
          className="flex-1"
        />
        <Button onClick={() => sendMessage(input)} disabled={!input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
