import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, GitBranch, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type GitStatus = "idle" | "pulling" | "success" | "failed";

const SystemSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [gitRemote, setGitRemote] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitStatus, setGitStatus] = useState<GitStatus>("idle");
  const [gitLog, setGitLog] = useState<string[]>([]);
  const [rebuildAfterPull, setRebuildAfterPull] = useState(false);

  const runGitPull = async (alsoRebuild = false) => {
    setGitStatus("pulling");
    setGitLog([]);
    setRebuildAfterPull(alsoRebuild);

    try {
      const r = await fetch("/api/git-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote: gitRemote || undefined, branch: gitBranch }),
      });

      const data = await r.json();
      const lines: string[] = Array.isArray(data.output)
        ? data.output
        : (data.output || "").split("\n");

      setGitLog(lines);

      if (!r.ok || data.error) {
        setGitStatus("failed");
        toast({ title: "Git pull failed", description: data.error || "Check the log", variant: "destructive" });
        return;
      }

      setGitStatus("success");

      if (alsoRebuild) {
        toast({ title: "Pull succeeded — starting APK rebuild…" });
        await fetch("/api/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: "auto", buildType: "release", includeRpcNode: true }),
        });
        toast({ title: "Rebuild triggered", description: "Go to APK Builder to watch progress." });
      } else {
        toast({ title: "Git pull complete" });
      }
    } catch (err: any) {
      setGitStatus("failed");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const statusBadge = () => {
    if (gitStatus === "pulling") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Pulling…</Badge>;
    if (gitStatus === "success") return <Badge className="gap-1 bg-green-600 text-white"><CheckCircle2 className="h-3 w-3" /> Success</Badge>;
    if (gitStatus === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate("/admin")} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Git Pull & Rebuild */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <GitBranch className="h-5 w-5 text-primary" />
            <CardTitle>Git — Pull & Rebuild</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pull the latest code from the Git remote, then optionally trigger an APK rebuild.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Remote URL (optional — leave blank to use existing origin)</Label>
                <Input
                  value={gitRemote}
                  onChange={(e) => setGitRemote(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  disabled={gitStatus === "pulling"}
                />
              </div>
              <div className="space-y-1">
                <Label>Branch</Label>
                <Input
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  disabled={gitStatus === "pulling"}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => runGitPull(false)}
                disabled={gitStatus === "pulling"}
                variant="outline"
                className="gap-2"
              >
                {gitStatus === "pulling" && !rebuildAfterPull
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Pulling…</>
                  : <><RefreshCw className="h-4 w-4" /> Pull Latest</>}
              </Button>
              <Button
                onClick={() => runGitPull(true)}
                disabled={gitStatus === "pulling"}
                className="gap-2"
              >
                {gitStatus === "pulling" && rebuildAfterPull
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</>
                  : <><GitBranch className="h-4 w-4" /> Pull &amp; Rebuild APK</>}
              </Button>
              {statusBadge()}
            </div>

            {gitLog.length > 0 && (
              <div className="bg-black rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">
                {gitLog.join("\n")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">System Name</h3>
                <p className="text-sm text-muted-foreground">Virtual Banking Services</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Currency</h3>
                <p className="text-sm text-muted-foreground">USD</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">Disabled</p>
              </div>
              <Button variant="outline">Enable</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Session Timeout</h3>
                <p className="text-sm text-muted-foreground">30 minutes</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SystemSettings;
