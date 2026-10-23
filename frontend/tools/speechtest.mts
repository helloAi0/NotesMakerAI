import { convertLatexToSpokenWords as c, toSpeakableText as t } from '../src/lib/latexSpeech.ts';
for (const x of ["F=ma","\\int_0^1 x^2 dx = \\frac{1}{3}","∫₀¹ x² dx = 1/3","\\frac{\\partial u}{\\partial t}","\\frac{dy}{dx}","x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}","\\sum_{i=1}^{n} i^2","\\lim_{x\\to 0}\\frac{\\sin x}{x}","e^{-x^2}","\\vec{F}=m\\vec{a}","\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}","\\nabla \\cdot \\vec{E}=\\frac{\\rho}{\\epsilon_0}","a_1+a_2"]) console.log(x,'\n  =>',c(x));
console.log(t("The area is $\\int_0^1 x^2dx = 1/3$ and F=ma holds. Also x² + y² = 1."));
