import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Megaphone, Clock } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
}

export const AnnouncementCarousel = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);

  const load = async () => {
    const { data } = await supabase
      .from("announcements" as never)
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(10);
    setItems((data as Announcement[]) || []);
  };

  if (items.length === 0) return null;
  const a = items[idx];

  return (
    <Card
      className="overflow-hidden bg-gradient-to-r from-primary/10 via-card to-primary/5 border-primary/30 cursor-pointer"
      onClick={() => a.link_url && window.open(a.link_url, "_blank")}
    >
      <div className="flex gap-3 p-4 items-start">
        {a.image_url ? (
          <img src={a.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Megaphone className="h-7 w-7 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{a.title}</h3>
          {a.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.body}</p>}
          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(a.starts_at).toLocaleDateString()}
            {a.ends_at && ` — ${new Date(a.ends_at).toLocaleDateString()}`}
          </div>
        </div>
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 pb-2">
          {items.map((_, i) => (
            <span key={i} className={`h-1 w-4 rounded-full ${i === idx ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      )}
    </Card>
  );
};

export default AnnouncementCarousel;