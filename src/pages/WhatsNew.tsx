import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Sparkles, Brain, Shield, Globe, Lock, Smartphone,
  ArrowLeftRight, Zap, TrendingUp, CheckCircle2, Star,
} from "lucide-react";

interface Release {
  version: string;
  date: string;
  tag: string;
  tagColor: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  desc: string;
  items: string[];
}

const RELEASES: Release[] = [
  {
    version: "1.6.0",
    date: "June 2026",
    tag: "Latest",
    tagColor: "bg-green-600",
    icon: Brain,
    iconColor: "text-violet-600",
    title: "AI & Production Security",
    desc: "Intelligent financial guidance and enterprise-grade fraud prevention.",
    items: [
      "AI Financial Assistant — personalized spending analysis & chat",
      "AI Defense Center — double-spend detection, velocity limits, account takeover guard",
      "Personalized Recommendations engine",
      "Open Banking — link external bank accounts",
      "Business API Integrations (webhooks, API keys, accounting sync)",
      "NFC Tap Payments support",
    ],
  },
  {
    version: "1.5.0",
    date: "June 2026",
    tag: "Security",
    tagColor: "bg-orange-600",
    icon: Lock,
    iconColor: "text-orange-600",
    title: "App Lock & Multi-Language",
    desc: "New security features and international language support.",
    items: [
      "App Lock — automatic PIN lock after inactivity",
      "Multi-Language — English, Spanish, French, Portuguese, Arabic (RTL)",
      "Currency Converter — 44 currencies with live flag UI",
      "Enhanced AI Security Center with auto-block engine",
    ],
  },
  {
    version: "1.4.0",
    date: "May 2026",
    tag: "AI",
    tagColor: "bg-blue-600",
    icon: Shield,
    iconColor: "text-blue-600",
    title: "AI Security & Cyber Defense",
    desc: "44-point AI security framework for production-ready protection.",
    items: [
      "AI Threat Detection & Behavioral Analysis",
      "WAF + API Firewall + DDoS Protection",
      "Zero Trust Continuous Verification",
      "AML Monitoring & RBAC",
      "SOC / SIEM dashboards",
    ],
  },
  {
    version: "1.3.0",
    date: "April 2026",
    tag: "Payments",
    tagColor: "bg-purple-600",
    icon: Zap,
    iconColor: "text-purple-600",
    title: "Advanced Payment Features",
    desc: "More ways to send, receive, and manage money.",
    items: [
      "Scheduled & Recurring Payments",
      "Split Bills & Group Payments",
      "International Transfers",
      "QR Payments upgrade",
      "Bill, Utility, School & Government Payments",
    ],
  },
  {
    version: "1.2.0",
    date: "March 2026",
    tag: "Banking",
    tagColor: "bg-teal-600",
    icon: TrendingUp,
    iconColor: "text-teal-600",
    title: "Full Banking Suite",
    desc: "Comprehensive banking and investment tools.",
    items: [
      "Savings Accounts, Fixed Deposits, Loans",
      "Credit Builder, BNPL, Micro Loans",
      "Investment Portfolio (Stocks, ETFs, Bonds, Crypto)",
      "Business Banking (Payroll, Treasury, Vendor Payments)",
      "Budget Planner, Debt Tracker, Net Worth Calculator",
    ],
  },
];

const WHATS_NEW_KEY = "vbank_whats_new_seen_v1_6_0";

export function markWhatsNewSeen() {
  localStorage.setItem(WHATS_NEW_KEY, "true");
}
export function hasSeenWhatsNew() {
  return localStorage.getItem(WHATS_NEW_KEY) === "true";
}

export default function WhatsNew() {
  const navigate = useNavigate();

  const handleClose = () => {
    markWhatsNewSeen();
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={handleClose} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            <h1 className="text-xl font-black">What's New</h1>
          </div>
          <Badge className="ml-auto bg-white/20 text-white text-xs">NETLIFE CASH</Badge>
        </div>
        <div className="bg-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Star className="h-8 w-8 text-yellow-300" />
            </div>
            <div>
              <p className="font-black text-lg">Version 1.6.0</p>
              <p className="text-white/70 text-sm">AI-Powered Financial Platform</p>
              <p className="text-white/50 text-xs mt-0.5">June 2026 · 245 features complete</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {RELEASES.map((rel) => {
          const Icon = rel.icon;
          return (
            <div key={rel.version} className="border rounded-2xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Icon className={`h-5 w-5 ${rel.iconColor}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">v{rel.version}</span>
                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${rel.tagColor}`}>
                          {rel.tag}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{rel.date}</p>
                    </div>
                  </div>
                </div>
                <h2 className="font-bold text-base mb-0.5">{rel.title}</h2>
                <p className="text-xs text-muted-foreground mb-3">{rel.desc}</p>
                <ul className="space-y-1.5">
                  {rel.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}

        <Button className="w-full gap-2 h-12 text-base font-bold" onClick={handleClose}>
          <Sparkles className="h-5 w-5" /> Got it — Let's go!
        </Button>
      </div>
    </div>
  );
}
