import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/* eslint-disable @typescript-eslint/no-explicit-any */
const md: any = {
  h1: ({ node: _n, ...p }: any) => <h2 className="text-base font-bold text-slate-900 mt-4 mb-2" {...p} />,
  h2: ({ node: _n, ...p }: any) => <h2 className="text-base font-bold text-slate-900 mt-4 mb-2" {...p} />,
  h3: ({ node: _n, ...p }: any) => <h3 className="text-sm font-bold text-slate-900 mt-3 mb-1" {...p} />,
  p: ({ node: _n, ...p }: any) => <p className="text-sm text-slate-700 leading-relaxed my-2" {...p} />,
  ul: ({ node: _n, ...p }: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-slate-700" {...p} />,
  ol: ({ node: _n, ...p }: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-slate-700" {...p} />,
  strong: ({ node: _n, ...p }: any) => <strong className="font-semibold text-slate-900" {...p} />,
  code: ({ node: _n, ...p }: any) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-xs" {...p} />,
};

export default function MarkdownView({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={md}>
      {text}
    </ReactMarkdown>
  );
}
