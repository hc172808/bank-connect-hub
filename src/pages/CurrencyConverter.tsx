import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/useT";

// Static rates relative to USD — approximate mid-market (updated 2026-06)
const RATES_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0066, CAD: 0.74, AUD: 0.66,
  CHF: 1.12, CNY: 0.138, INR: 0.012, MXN: 0.058, BRL: 0.197, KRW: 0.00074,
  SGD: 0.746, HKD: 0.128, NOK: 0.095, SEK: 0.097, DKK: 0.145, NZD: 0.614,
  ZAR: 0.055, AED: 0.272, SAR: 0.267, QAR: 0.275, KWD: 3.26, BHD: 2.65,
  OMR: 2.60, JOD: 1.41, EGP: 0.021, NGN: 0.00065, GHS: 0.068, KES: 0.0077,
  TZS: 0.00039, UGX: 0.00027, ZMW: 0.038, GYD: 0.0048, TTD: 0.148,
  XCD: 0.370, BBD: 0.500, JMD: 0.0064, HTG: 0.0076, DOP: 0.017,
  PEN: 0.267, COP: 0.00025, CLP: 0.0011, ARS: 0.001,
};

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen",
  CAD: "Canadian Dollar", AUD: "Australian Dollar", CHF: "Swiss Franc",
  CNY: "Chinese Yuan", INR: "Indian Rupee", MXN: "Mexican Peso",
  BRL: "Brazilian Real", KRW: "South Korean Won", SGD: "Singapore Dollar",
  HKD: "Hong Kong Dollar", NOK: "Norwegian Krone", SEK: "Swedish Krona",
  DKK: "Danish Krone", NZD: "New Zealand Dollar", ZAR: "South African Rand",
  AED: "UAE Dirham", SAR: "Saudi Riyal", QAR: "Qatari Riyal",
  KWD: "Kuwaiti Dinar", BHD: "Bahraini Dinar", OMR: "Omani Rial",
  JOD: "Jordanian Dinar", EGP: "Egyptian Pound", NGN: "Nigerian Naira",
  GHS: "Ghanaian Cedi", KES: "Kenyan Shilling", TZS: "Tanzanian Shilling",
  UGX: "Ugandan Shilling", ZMW: "Zambian Kwacha", GYD: "Guyanese Dollar",
  TTD: "Trinidad & Tobago Dollar", XCD: "East Caribbean Dollar",
  BBD: "Barbadian Dollar", JMD: "Jamaican Dollar", HTG: "Haitian Gourde",
  DOP: "Dominican Peso", PEN: "Peruvian Sol", COP: "Colombian Peso",
  CLP: "Chilean Peso", ARS: "Argentine Peso",
};

const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CAD: "🇨🇦", AUD: "🇦🇺",
  CHF: "🇨🇭", CNY: "🇨🇳", INR: "🇮🇳", MXN: "🇲🇽", BRL: "🇧🇷", KRW: "🇰🇷",
  SGD: "🇸🇬", HKD: "🇭🇰", NOK: "🇳🇴", SEK: "🇸🇪", DKK: "🇩🇰", NZD: "🇳🇿",
  ZAR: "🇿🇦", AED: "🇦🇪", SAR: "🇸🇦", QAR: "🇶🇦", KWD: "🇰🇼", BHD: "🇧🇭",
  OMR: "🇴🇲", JOD: "🇯🇴", EGP: "🇪🇬", NGN: "🇳🇬", GHS: "🇬🇭", KES: "🇰🇪",
  TZS: "🇹🇿", UGX: "🇺🇬", ZMW: "🇿🇲", GYD: "🇬🇾", TTD: "🇹🇹", XCD: "🇱🇨",
  BBD: "🇧🇧", JMD: "🇯🇲", HTG: "🇭🇹", DOP: "🇩🇴", PEN: "🇵🇪", COP: "🇨🇴",
  CLP: "🇨🇱", ARS: "🇦🇷",
};

const POPULAR = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "BRL", "GYD"];
const ALL_CODES = Object.keys(RATES_TO_USD).sort();

function convert(amount: number, from: string, to: string): number {
  if (!amount || isNaN(amount)) return 0;
  const inUsd = amount / (RATES_TO_USD[from] || 1);
  return inUsd * (RATES_TO_USD[to] || 1);
}

function CurrencyPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return ALL_CODES.filter((c) =>
      c.toLowerCase().includes(q) || (CURRENCY_NAMES[c] || "").toLowerCase().includes(q)
    );
  }, [filter]);

  return (
    <div className="relative">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 border rounded-xl px-3 py-3 bg-background hover:bg-muted transition-colors text-left"
      >
        <span className="text-xl">{FLAGS[value] || "🌐"}</span>
        <div className="flex-1">
          <span className="font-bold">{value}</span>
          <span className="text-xs text-muted-foreground ml-2">{CURRENCY_NAMES[value]}</span>
        </div>
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <Input
              autoFocus
              placeholder="Search currency…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            {filtered.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); setFilter(""); }}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted text-left text-sm ${value === c ? "bg-primary/10 text-primary" : ""}`}
              >
                <span>{FLAGS[c] || "🌐"}</span>
                <span className="font-medium w-12">{c}</span>
                <span className="text-muted-foreground truncate">{CURRENCY_NAMES[c]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CurrencyConverter() {
  const navigate = useNavigate();
  const { t } = useT();
  const [fromCur, setFromCur] = useState("USD");
  const [toCur, setToCur] = useState("GYD");
  const [amount, setAmount] = useState("1");

  const result = useMemo(() => convert(parseFloat(amount) || 0, fromCur, toCur), [amount, fromCur, toCur]);
  const rate = useMemo(() => convert(1, fromCur, toCur), [fromCur, toCur]);

  const swap = () => {
    setFromCur(toCur);
    setToCur(fromCur);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">💱 {t("converter.title")}</h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Main converter card */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("converter.amount")}</p>
              <Input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-2xl font-bold h-14"
                placeholder="0.00"
              />
            </div>

            <CurrencyPicker value={fromCur} onChange={setFromCur} label={t("converter.fromCurrency")} />

            <div className="flex justify-center">
              <Button variant="outline" size="icon" onClick={swap} className="rounded-full h-10 w-10 border-2">
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>

            <CurrencyPicker value={toCur} onChange={setToCur} label={t("converter.toCurrency")} />

            {/* Result */}
            <div className="bg-primary/10 rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground">{t("converter.result")}</p>
              <p className="text-3xl font-black text-primary mt-1">
                {FLAGS[toCur]} {result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {toCur}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                1 {fromCur} = {rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {toCur}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Popular currencies quick comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("converter.popularCurrencies")} vs {fromCur}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {POPULAR.filter((c) => c !== fromCur).slice(0, 8).map((c) => {
              const val = convert(parseFloat(amount) || 1, fromCur, c);
              return (
                <button
                  key={c}
                  onClick={() => setToCur(c)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-sm transition-all ${toCur === c ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                >
                  <span className="flex items-center gap-1 font-medium">
                    <span>{FLAGS[c] || "🌐"}</span> {c}
                  </span>
                  <span className="text-xs text-muted-foreground">{val.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{t("converter.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
