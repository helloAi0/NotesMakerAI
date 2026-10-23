import katex from 'katex';
import 'katex/dist/katex.min.css';

/** Renders text with $inline$ and $$display$$ math. Falls back to the raw text if KaTeX rejects it. */
export default function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\$\$([^$]+)\$\$$/.exec(p) ?? /^\$([^$\n]+)\$$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        try {
          const html = katex.renderToString(m[1], { throwOnError: true, displayMode: p.startsWith('$$'), strict: 'ignore' });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch { return <span key={i} className="text-red-600">{p}</span>; }
      })}
    </>
  );
}
