import Image from "next/image";

export type ProductFocus = { number: string; title: string; copy: string };

export function ProductVisual({ src, alt, caption, focus = [], className = "" }: { src: string; alt: string; caption: string; focus?: ProductFocus[]; className?: string }) {
  return <figure className={`product-visual ${className}`}>
    <div className="product-window"><div className="product-window-bar"><i /><i /><i /><span>ConphiDent · product preview</span></div><Image src={src} alt={alt} width={1440} height={980} sizes="(max-width: 760px) 100vw, 62vw" /></div>
    <figcaption>{caption}</figcaption>
    {focus.length > 0 && <div className="product-focus-list">{focus.map(item => <div key={item.number}><b>{item.number}</b><span><strong>{item.title}</strong>{item.copy}</span></div>)}</div>}
  </figure>;
}

export function ProductSteps({ items }: { items: Array<{ step: string; title: string; copy: string }> }) {
  return <ol className="product-steps">{items.map(item => <li key={item.step}><b>{item.step}</b><div><strong>{item.title}</strong><p>{item.copy}</p></div></li>)}</ol>;
}
