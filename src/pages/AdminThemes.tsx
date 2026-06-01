import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Palette, CheckCircle2, Loader2, Save, Star } from "lucide-react";
import { THEME_PRESETS, type ThemeId } from "@/lib/themes";

const SETTINGS_KEY_DEFAULT = "default_theme";
const SETTINGS_KEY_ENABLED = "enabled_themes";
const SETTINGS_KEY_LOCK = "lock_theme"; // prevent users from changing

export default function AdminThemes() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState<ThemeId>("midnight-gold");
  const [enabledThemes, setEnabledThemes] = useState<ThemeId[]>(
    THEME_PRESETS.map((p) => p.id as ThemeId)
  );
  const [lockTheme, setLockTheme] = useState(false);

  useEffect(() => {
    if (!authLoading && role !== "admin") navigate("/admin");
  }, [role, authLoading, navigate]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [SETTINGS_KEY_DEFAULT, SETTINGS_KEY_ENABLED, SETTINGS_KEY_LOCK]);

    if (data) {
      for (const row of data) {
        if (row.key === SETTINGS_KEY_DEFAULT) setDefaultTheme(String(row.value) as ThemeId);
        if (row.key === SETTINGS_KEY_ENABLED) {
          try { setEnabledThemes(JSON.parse(String(row.value))); } catch { /* keep default */ }
        }
        if (row.key === SETTINGS_KEY_LOCK) setLockTheme(String(row.value) === "true");
      }
    }
    setLoading(false);
  };

  const upsert = async (key: string, value: string) => {
    const { error } = await supabase.from("app_settings").upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    return error;
  };

  const handleSave = async () => {
    setSaving(true);
    const errs = await Promise.all([
      upsert(SETTINGS_KEY_DEFAULT, defaultTheme),
      upsert(SETTINGS_KEY_ENABLED, JSON.stringify(enabledThemes)),
      upsert(SETTINGS_KEY_LOCK, String(lockTheme)),
    ]);
    if (errs.some(Boolean)) {
      toast({ variant: "destructive", title: "Save failed", description: "Check your app_settings table exists." });
    } else {
      toast({ title: "Theme settings saved", description: "Changes will apply to all users on next load." });
    }
    setSaving(false);
  };

  const toggleEnabled = (id: ThemeId) => {
    if (id === defaultTheme) {
      toast({ variant: "destructive", title: "Can't disable the default theme" });
      return;
    }
    setEnabledThemes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const makeDefault = (id: ThemeId) => {
    setDefaultTheme(id);
    if (!enabledThemes.includes(id)) setEnabledThemes((prev) => [...prev, id]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Palette className="w-7 h-7 text-primary" />
          App Themes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose which themes users can pick from, set a default, and optionally lock everyone to one look.
        </p>
      </div>

      {/* Lock toggle */}
      <Card className="mb-5 border-primary/20">
        <CardContent className="pt-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Lock theme for all users</p>
            <p className="text-xs text-muted-foreground">
              When on, users cannot change the theme — they all use the default below.
            </p>
          </div>
          <Switch
            checked={lockTheme}
            onCheckedChange={setLockTheme}
            data-testid="switch-lock-theme"
          />
        </CardContent>
      </Card>

      {/* Theme grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {THEME_PRESETS.map((preset) => {
          const isEnabled = enabledThemes.includes(preset.id as ThemeId);
          const isDefault = defaultTheme === preset.id;

          return (
            <Card
              key={preset.id}
              className={`relative overflow-hidden transition-all border-2 ${
                isDefault ? "border-primary shadow-lg" : isEnabled ? "border-border" : "border-dashed border-muted opacity-60"
              }`}
              data-testid={`theme-card-${preset.id}`}
            >
              {/* Large swatch header */}
              <div
                className="h-24 w-full flex items-center justify-center gap-2"
                style={{ background: preset.swatch.bg }}
              >
                <div
                  className="w-10 h-10 rounded-full border-2 border-white/40 shadow-md"
                  style={{ background: preset.swatch.primary }}
                />
                <div
                  className="w-6 h-6 rounded-full border-2 border-white/30 shadow-sm"
                  style={{ background: preset.swatch.accent }}
                />
                <span
                  className="text-sm font-bold px-2 py-0.5 rounded"
                  style={{
                    color: preset.swatch.primary,
                    background: preset.swatch.bg,
                    border: `1px solid ${preset.swatch.primary}40`,
                  }}
                >
                  Aa
                </span>
              </div>

              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{preset.name}</CardTitle>
                    <CardDescription className="text-[11px] mt-0.5">{preset.description}</CardDescription>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    {isDefault && (
                      <Badge className="text-[10px] bg-primary text-primary-foreground">
                        <Star className="w-2.5 h-2.5 mr-1" /> Default
                      </Badge>
                    )}
                    {isEnabled && !isDefault && (
                      <Badge variant="outline" className="text-[10px]">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-green-500" /> Enabled
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0 flex gap-2">
                <Button
                  size="sm"
                  variant={isDefault ? "default" : "outline"}
                  className="flex-1 text-xs h-8"
                  onClick={() => makeDefault(preset.id as ThemeId)}
                  disabled={isDefault}
                  data-testid={`set-default-${preset.id}`}
                >
                  {isDefault ? "✓ Default" : "Set as default"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`text-xs h-8 ${isEnabled && !isDefault ? "text-destructive hover:text-destructive" : ""}`}
                  onClick={() => toggleEnabled(preset.id as ThemeId)}
                  disabled={isDefault}
                  data-testid={`toggle-${preset.id}`}
                >
                  {isEnabled ? (isDefault ? "On" : "Disable") : "Enable"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2" data-testid="button-save-themes">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save theme settings"}
      </Button>

      <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">First-time setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            If saving fails, run this SQL once in your Supabase SQL editor:
          </p>
          <pre className="text-[11px] bg-muted p-3 rounded overflow-auto">{`create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "anyone reads settings" on public.app_settings
  for select using (true);
create policy "admins manage settings" on public.app_settings
  for all using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- seed defaults
insert into public.app_settings (key, value) values
  ('default_theme', 'midnight-gold'),
  ('enabled_themes', '["midnight-gold","indigo-emerald","cash-green","royal-cyan","vintage-yellow"]'),
  ('lock_theme', 'false')
on conflict (key) do nothing;`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
