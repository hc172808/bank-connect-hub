import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, User, QrCode } from "lucide-react";

const AddMoneyAgent = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, agentsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("id", user.id).single(),
      supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent"),
    ]);

    if (profileRes.data) setUserProfile(profileRes.data);

    if (agentsRes.data && agentsRes.data.length > 0) {
      const agentIds = agentsRes.data.map((a) => a.user_id);
      const { data: agentProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, address, city")
        .in("id", agentIds);

      if (agentProfiles) setAgents(agentProfiles);
    }
  };

  const copyUserId = async () => {
    if (userProfile?.id) {
      await navigator.clipboard.writeText(userProfile.id);
      toast({ title: "Your User ID copied", description: "Share this with the agent to receive your deposit." });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/add-money")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-4">Deposit via Agent</h1>

        {/* User's ID Card */}
        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-2">Share your details with an agent:</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{userProfile?.full_name || "Loading..."}</p>
                <p className="text-xs text-muted-foreground font-mono">{userProfile?.id?.slice(0, 12)}...</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyUserId}>
                  Copy ID
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/my-qr")}>
                  <QrCode size={14} className="mr-1" /> QR
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>Visit any agent location below with your cash</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>Share your User ID or show your QR code</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>The agent will deposit funds to your wallet</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">4</span>
                <span>An admin will approve the deposit and your balance will update</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Agent List */}
        <h2 className="text-lg font-semibold mb-3">Available Agents</h2>
        <div className="space-y-3">
          {agents.length === 0 ? (
            <Card className="p-6 text-center">
              <User size={32} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">No agents available at this time</p>
            </Card>
          ) : (
            agents.map((agent) => (
              <Card key={agent.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <User size={20} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{agent.full_name || "Agent"}</p>
                    {agent.phone_number && (
                      <p className="text-sm text-muted-foreground">{agent.phone_number}</p>
                    )}
                    {(agent.address || agent.city) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin size={12} />
                        {[agent.address, agent.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AddMoneyAgent;
