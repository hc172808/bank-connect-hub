import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Landmark, ShieldCheck } from "lucide-react";
import bankImage from "@/assets/neon-bank.jpg";

export function BankingAuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="banking-dashboard banking-auth min-h-screen relative isolate overflow-hidden">
      <img src={bankImage} alt="" className="banking-auth-image pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <div className="banking-auth-scrim pointer-events-none absolute inset-0" />
      <header className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-10">
        <Link to="/auth" className="flex items-center gap-3 text-foreground">
          <Landmark className="h-8 w-8 text-primary banking-glow" />
          <span className="text-lg font-bold">NETLIFE <span className="text-primary">CASH</span></span>
        </Link>
        <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="h-4 w-4 text-primary" /> Account access</span>
      </header>
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-10 pt-4 sm:px-10 lg:min-h-[calc(100svh-110px)] lg:grid-cols-2 lg:gap-24 lg:py-12">
        <section className="hidden self-center lg:block">
          <p className="mb-5 flex items-center gap-2 text-sm text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Your personal banking space</p>
          <h2 className="text-5xl font-bold leading-tight">NETLIFE CASH<span className="mt-4 block text-primary">Your money.<br />Your next move.</span></h2>
          <div className="mt-10 flex items-center gap-3 border-t border-primary/20 pt-6 text-sm text-muted-foreground"><ArrowUpRight className="h-5 w-5 text-primary" /> Banking · Payments · Everyday possibilities</div>
        </section>
        <section className="banking-auth-form mx-auto w-full max-w-md py-2 lg:py-8">{children}</section>
      </div>
      <footer className="relative px-5 pb-6 text-center text-xs text-muted-foreground">NETLIFE CASH <span className="mx-2 text-primary">·</span> GYDSchain</footer>
    </main>
  );
}