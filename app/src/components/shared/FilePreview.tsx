import { useState, useEffect } from "react";
import { getSignedUrl } from "@/data/storageHelpers";
import { FileDown, FileText, Image, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreviewProps {
  url: string | null | undefined;
  label?: string;
  size?: "sm" | "md";
}

export default function FilePreview({ url, label, size = "sm" }: FilePreviewProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isImage, setIsImage] = useState(false);

  useEffect(() => {
    if (!url) { setResolvedUrl(null); return; }

    setLoading(true);
    getSignedUrl(url).then(signed => {
      setResolvedUrl(signed);
      const lower = (signed || url).toLowerCase();
      setIsImage(/\.(jpg|jpeg|png|webp|gif)/.test(lower) || lower.includes('image'));
    }).catch(() => {
      setResolvedUrl(url.startsWith('http') ? url : null);
    }).finally(() => setLoading(false));
  }, [url]);

  if (!url) return <span className="text-xs text-muted-foreground">—</span>;
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!resolvedUrl) return <span className="text-xs text-destructive">Error</span>;

  if (isImage) {
    return (
      <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={resolvedUrl}
          alt={label || "Preview"}
          className={`rounded border object-cover hover:opacity-80 transition-opacity ${size === 'sm' ? 'h-8 w-8' : 'h-16 w-16'}`}
        />
      </a>
    );
  }

  return (
    <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
        <FileDown className="h-3.5 w-3.5" />
        {label || "Ver"}
      </Button>
    </a>
  );
}
