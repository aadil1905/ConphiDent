import { Play } from "lucide-react";

type ProductVideoProps = { title: string; description: string; src?: string; poster?: string; captions?: string };

export default function ProductVideo({ title, description, src, poster, captions }: ProductVideoProps) {
  if (src) return <article className="cf-video">
    <video controls muted playsInline preload="metadata" poster={poster} aria-label={title}>
      <source src={src} type={src.endsWith(".webm") ? "video/webm" : "video/mp4"} />
      {captions ? <track kind="captions" src={captions} srcLang="en" label="English" default /> : null}
      Your browser does not support embedded video.
    </video>
    <p className="cf-eyebrow">PRODUCT WALKTHROUGH</p><h3>{title}</h3><p>{description}</p>
  </article>;
  return <article className="cf-video"><Play /><p className="cf-eyebrow">RECORDING READY</p><h3>{title}</h3><p>{description}</p><small>Add a sanitized MP4/WebM and poster image in <code>/public/product/videos</code>.</small></article>;
}
