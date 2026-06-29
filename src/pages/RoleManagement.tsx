import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Shield, Settings, Users, Eye, Briefcase, AlertTriangle,
  DollarSign, ShoppingBag, UserCheck, HeadphonesIcon, TrendingUp,
  Search, Code, BarChart2, ChevronRight, CheckCircle,
} from "lucide-react";

interface Role {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  permissions: string[];
  level: "high" | "medium" | "low";
}

const ROLES: Role[] = [
  {
    key: "admin",
    label: "Super Admin",
    description: "Full system access — all permissions",
    icon: Shield,
    color: "text-red-600",
    level: "high",
    permissions: ["all_access", "system_config", "user_management", "financial_ops", "audit_access"],
  },
  {
    key: "operations_manager",
    label: "Operations Manager",
    description: "Manage day-to-day operations and transactions",
    icon: Settings,
    color: "text-orange-600",
    level: "high",
    permissions: ["view_transactions", "approve_transactions", "manage_agents", "view_reports", "manage_limits"],
  },
  {
    key: "compliance_officer",
    label: "Compliance Officer",
    description: "AML, KYC review, regulatory reporting",
    icon: AlertTriangle,
    color: "text-yellow-600",
    level: "high",
    permissions: ["kyc_review", "aml_monitoring", "view_audit_logs", "flag_transactions", "generate_reports"],
  },
  {
    key: "finance_manager",
    label: "Finance Manager",
    description: "Manage fees, rates, and financial settings",
    icon: DollarSign,
    color: "text-green-600",
    level: "high",
    permissions: ["manage_fees", "view_balances", "manage_rates", "approve_withdrawals", "financial_reports"],
  },
  {
    key: "treasury_manager",
    label: "Treasury Manager",
    description: "Oversee liquidity, float, and reserves",
    icon: TrendingUp,
    color: "text-teal-600",
    level: "high",
    permissions: ["manage_float", "liquidity_reports", "interbank_transfers", "reserve_management"],
  },
  {
    key: "merchant_manager",
    label: "Merchant Manager",
    description: "Manage vendor accounts and merchant integrations",
    icon: ShoppingBag,
    color: "text-purple-600",
    level: "medium",
    permissions: ["manage_vendors", "vendor_payouts", "merchant_analytics", "view_transactions"],
  },
  {
    key: "agent_manager",
    label: "Agent Manager",
    description: "Manage agent network and commissions",
    icon: UserCheck,
    color: "text-blue-600",
    level: "medium",
    permissions: ["manage_agents", "approve_agents", "agent_commissions", "agent_reports"],
  },
  {
    key: "customer_support_manager",
    label: "Support Manager",
    description: "Manage support team and escalations",
    icon: HeadphonesIcon,
    color: "text-indigo-600",
    level: "medium",
    permissions: ["manage_support_agents", "view_tickets", "resolve_disputes", "view_customer_data"],
  },
  {
    key: "customer_support_agent",
    label: "Support Agent",
    description: "Handle customer inquiries and basic disputes",
    icon: HeadphonesIcon,
    color: "text-cyan-600",
    level: "low",
    permissions: ["view_tickets", "basic_customer_data", "escalate_issues"],
  },
  {
    key: "risk_analyst",
    label: "Risk Analyst",
    description: "Analyze risk patterns and fraud signals",
    icon: AlertTriangle,
    color: "text-orange-500",
    level: "medium",
    permissions: ["view_risk_scores", "flag_accounts", "risk_reports", "aml_monitoring"],
  },
  {
    key: "fraud_investigator",
    label: "Fraud Investigator",
    description: "Investigate flagged accounts and transactions",
    icon: Search,
    color: "text-red-500",
    level: "medium",
    permissions: ["view_fraud_queue", "freeze_accounts", "view_audit_logs", "generate_reports"],
  },
  {
    key: "auditor",
    label: "Auditor",
    description: "Read-only access to all audit trails",
    icon: Eye,
    color: "text-slate-600",
    level: "low",
    permissions: ["view_audit_logs", "generate_reports", "view_transactions"],
  },
  {
    key: "developer",
    label: "Developer",
    description: "System configuration and API management",
    icon: Code,
    color: "text-violet-600",
    level: "medium",
    permissions: ["system_config", "api_management", "view_logs", "manage_webhooks"],
  },
  {
    key: "readonly_analyst",
    label: "Read-Only Analyst",
    description: "View dashboards and analytics — no write access",
    icon: BarChart2,
    color: "text-gray-600",
    level: "low",
    permissions: ["view_dashboards", "view_reports", "view_transactions"],
  },
];

interface AssignedUser {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
  sub_role?: string;
}

const PERMISSION_LABELS: Record<string, string> = {
  all_access: "Full System Access",
  system_config: "System Configuration",
  user_management: "User Management",
  financial_ops: "Financial Operations",
  audit_access: "Audit Access",
  view_transactions: "View Transactions",
  approve_transactions: "Approve Transactions",
  manage_agents: "Manage Agents",
  view_reports: "View Reports",
  manage_limits: "Manage Limits",
  kyc_review: "KYC Review",
  aml_monitoring: "AML Monitoring",
  view_audit_logs: "View Audit Logs",
  flag_transactions: "Flag Transactions",
  generate_reports: "Generate Reports",
  manage_fees: "Manage Fees",
  view_balances: "View Balances",
  manage_rates: "Manage Rates",
  approve_withdrawals: "Approve Withdrawals",
  financial_reports: "Financial Reports",
  manage_float: "Manage Float",
  liquidity_reports: "Liquidity Reports",
  interbank_transfers: "Interbank Transfers",
  reserve_management: "Reserve Management",
  manage_vendors: "Manage Vendors",
  vendor_payouts: "Vendor Payouts",
  merchant_analytics: "Merchant Analytics",
  approve_agents: "Approve Agents",
  agent_commissions: "Agent Commissions",
  agent_reports: "Agent Reports",
  manage_support_agents: "Manage Support Team",
  view_tickets: "View Support Tickets",
  resolve_disputes: "Resolve Disputes",
  view_customer_data: "View Customer Data",
  escalate_issues: "Escalate Issues",
  basic_customer_data: "Basic Customer Data",
  view_risk_scores: "View Risk Scores",
  flag_accounts: "Flag Accounts",
  risk_reports: "Risk Reports",
  view_fraud_queue: "View Fraud Queue",
  freeze_accounts: "Freeze Accounts",
  api_management: "API Management",
  view_logs: "View System Logs",
  manage_webhooks: "Manage Webhooks",
  view_dashboards: "View Dashboards",
};

const LEVEL_COLORS: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const RoleManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<AssignedUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedUser, setSelectedUser] = useState<AssignedUser | null>(null);
  const [subRole, setSubRole] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number, role")
      .order("created_at", { ascending: false })
      .limit(50);
    setUsers((data as any) || []);
  };

  const assignRole = async () => {
    if (!selectedUser || !subRole) return;
    setAssigning(true);
    try {
      await supabase
        .from("profiles")
        .update({ sub_role: subRole } as never)
        .eq("id", selectedUser.id);
      toast({ title: "Role assigned", description: `${selectedUser.full_name} is now a ${ROLES.find(r => r.key === subRole)?.label}` });
      loadUsers();
      setSelectedUser(null);
      setSubRole("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setAssigning(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone_number?.includes(search)
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" /> Role Management
          </h1>
          <p className="text-xs text-primary-foreground/70">Assign and manage sub-roles</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: "roles", label: "Role Library" },
            { key: "users", label: "Assign Roles" },
          ].map(t => (
            <button key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "roles" ? (
          <div className="space-y-3">
            {ROLES.map(role => (
              <Card key={role.key} className="cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => setSelectedRole(selectedRole?.key === role.key ? null : role)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center shrink-0">
                      <role.icon className={`h-5 w-5 ${role.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{role.label}</p>
                        <Badge variant={LEVEL_COLORS[role.level] as any} className="text-xs capitalize">
                          {role.level}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedRole?.key === role.key ? "rotate-90" : ""}`} />
                  </div>
                  {selectedRole?.key === role.key && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Permissions</p>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.map(p => (
                          <Badge key={p} variant="outline" className="text-[10px]">
                            <CheckCircle className="h-2 w-2 mr-1 text-green-500" />
                            {PERMISSION_LABELS[p] || p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search users..." value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>

            {filteredUsers.map(user => (
              <Card key={user.id} className={`cursor-pointer transition-all ${selectedUser?.id === user.id ? "border-primary" : ""}`}
                onClick={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">
                        {(user.full_name || "U").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{user.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{user.phone_number}</p>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs capitalize">{user.role}</Badge>
                      {(user as any).sub_role && (
                        <Badge variant="secondary" className="text-xs capitalize">{(user as any).sub_role}</Badge>
                      )}
                    </div>
                  </div>

                  {selectedUser?.id === user.id && (
                    <div className="mt-3 border-t pt-3 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign Sub-Role</label>
                        <Select value={subRole} onValueChange={setSubRole}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role to assign" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r.key} value={r.key}>
                                <span className="flex items-center gap-2">
                                  <r.icon className={`h-3 w-3 ${r.color}`} />
                                  {r.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {subRole && (
                        <div className="bg-muted rounded-lg p-2 text-xs text-muted-foreground">
                          {ROLES.find(r => r.key === subRole)?.permissions.length} permissions will be granted
                        </div>
                      )}
                      <Button className="w-full" onClick={assignRole} disabled={!subRole || assigning}>
                        {assigning ? "Assigning..." : "Assign Role"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleManagement;
