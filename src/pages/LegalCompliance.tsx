import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Shield,
  Scale,
  Copyright,
  AlertTriangle,
  Lock,
  FileText,
  Globe,
  Phone,
  Mail,
  Building2,
  Gavel,
  Eye,
  UserCheck,
  Ban,
} from "lucide-react";

const YEAR = new Date().getFullYear();
const OWNER = "Kenrick Cion Hector";
const APP_NAME = "NETLIFE CASH";
const COMPANY = "NETLIFE CASH Financial Services";

export default function LegalCompliance() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 space-y-5 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6" /> Legal & Compliance
          </h1>
          <p className="text-sm text-muted-foreground">
            Copyright, law enforcement policy, and intellectual property
          </p>
        </div>
      </div>

      {/* Copyright notice */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Copyright className="h-5 w-5 text-blue-600" /> Copyright Notice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-center py-4 border rounded-xl bg-white dark:bg-background">
            <p className="text-2xl font-bold">{APP_NAME}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Copyright &copy; {YEAR} {OWNER}. All rights reserved.
            </p>
            <Badge className="mt-3 bg-blue-600 text-white">
              Proprietary &amp; Confidential
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This software application, including all source code, design, algorithms, databases, documentation,
            trademarks, logos, and all associated intellectual property, is the exclusive property of{" "}
            <strong>{OWNER}</strong> and <strong>{COMPANY}</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: "Owner", value: OWNER },
              { label: "Application", value: APP_NAME },
              { label: "Company", value: COMPANY },
              { label: "Year Established", value: `${YEAR}` },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-lg bg-muted/60">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{label}</p>
                <p className="font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Intellectual Property */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-5 w-5 text-purple-600" /> Intellectual Property Rights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            All intellectual property rights in and to {APP_NAME}, including without limitation all software,
            user interfaces, branding, visual design, APIs, and data models are owned by and vest exclusively
            in <strong className="text-foreground">{OWNER}</strong>.
          </p>
          <ul className="space-y-2">
            {[
              "Copying, reproducing, or distributing any part of this software without written consent is strictly prohibited.",
              "Reverse engineering, decompiling, or disassembling any component of this application is forbidden.",
              "Creating derivative works based on this software without express written permission is not permitted.",
              "All trademarks, service marks, and logos displayed are the property of their respective owners.",
              "Unauthorized commercial use of this software will be prosecuted to the fullest extent of the law.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Law Enforcement Policy */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-5 w-5 text-red-600" /> Law Enforcement Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> For Official Law Enforcement Requests Only
            </p>
            <p className="text-red-700 dark:text-red-400 text-xs mt-1">
              {COMPANY} cooperates fully with lawful requests from authorized government and law enforcement agencies.
              All requests must be submitted through proper legal channels.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-semibold text-foreground">What We Can Provide (with valid legal order):</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { icon: <UserCheck className="h-4 w-4 text-green-600" />, label: "User identity & KYC records" },
                { icon: <FileText className="h-4 w-4 text-green-600" />, label: "Transaction history & logs" },
                { icon: <Eye className="h-4 w-4 text-green-600" />, label: "Account activity & login records" },
                { icon: <Globe className="h-4 w-4 text-green-600" />, label: "IP addresses & device fingerprints" },
                { icon: <Phone className="h-4 w-4 text-green-600" />, label: "Registered phone numbers" },
                { icon: <Lock className="h-4 w-4 text-green-600" />, label: "Wallet & blockchain addresses" },
              ].map(({ icon, label }, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
                  {icon} {label}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-foreground">Required for Any Law Enforcement Request:</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {[
                "Official court order, subpoena, or warrant issued by a court of competent jurisdiction",
                "Written request on official agency letterhead with badge number / badge ID",
                "Clear identification of the data requested and the specific user(s) involved",
                "Case or docket number and investigating officer contact information",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Gavel className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Ban className="h-4 w-4 text-red-500" /> What We Will NOT Do:
            </p>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              {[
                "Provide data in response to informal or unverified requests",
                "Disclose user information to third parties without lawful authority",
                "Alter, delete, or suppress records related to active investigations",
                "Cooperate with foreign government requests unless routed through proper mutual legal assistance treaty (MLAT)",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Ban className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Legal Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-orange-600" /> Legal Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            All legal notices, law enforcement requests, copyright claims, and compliance inquiries must be
            addressed to the legal department of {COMPANY}.
          </p>
          <div className="space-y-2">
            {[
              { icon: <Building2 className="h-4 w-4" />, label: "Legal Entity", value: COMPANY },
              { icon: <UserCheck className="h-4 w-4" />, label: "Owner / Proprietor", value: OWNER },
              { icon: <Mail className="h-4 w-4" />, label: "Legal E-mail", value: "legal@netlifecash.com" },
              { icon: <Shield className="h-4 w-4" />, label: "Law Enforcement", value: "lawenforcement@netlifecash.com" },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg border bg-card text-sm">
                <span className="text-muted-foreground">{icon}</span>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prohibited Use */}
      <Card className="border-yellow-200 dark:border-yellow-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-yellow-600" /> Prohibited Uses & Enforcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {APP_NAME} operates under a strict zero-tolerance policy for illegal, fraudulent, or abusive activity.
            The following activities are strictly prohibited and will result in immediate account termination
            and referral to law enforcement:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "Money laundering or structuring",
              "Financing of terrorism or illegal organizations",
              "Fraud, phishing, or identity theft",
              "Unauthorized access or hacking",
              "Drug trafficking transactions",
              "Child exploitation material",
              "Sanctions violations (OFAC/UN)",
              "Pyramid or Ponzi schemes",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 text-xs border border-yellow-200 dark:border-yellow-800">
                <Ban className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-4 border-t">
        <p>&copy; {YEAR} {OWNER} · {COMPANY}</p>
        <p className="mt-1">All rights reserved. Unauthorized reproduction is prohibited by law.</p>
        <p className="mt-1 font-mono text-[10px] opacity-60">
          {APP_NAME} v1.0 · Proprietary Software · Protected under applicable copyright law
        </p>
      </div>
    </div>
  );
}
