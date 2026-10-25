import { defineSim, num, str, bool, PG_ALL, UG_ENG, UG_SCI } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, circle, clamp, fmt, gauss, line, panel, plot, polyline, text, bars } from './draw';

const meta = (subject: SimSubject, levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const CSL: EducationLevel[] = ['B.Tech', 'B.Sc', 'BCA', 'M.Tech', 'M.Sc'] as EducationLevel[];
void UG_ENG; void UG_SCI; void PG_ALL; void bars;

/* ---------- RSA (toy) ---------- */
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const modpow = (b: number, e: number, m: number) => { let r = 1n, bb = BigInt(b) % BigInt(m), ee = BigInt(e); const mm = BigInt(m); while (ee > 0n) { if (ee & 1n) r = (r * bb) % mm; bb = (bb * bb) % mm; ee >>= 1n; } return Number(r); };
const modinv = (a: number, m: number) => { let [o, r] = [m, a % m], [s0, s1] = [0, 1]; while (r) { const q = Math.floor(o / r); [o, r] = [r, o - q * r]; [s0, s1] = [s1, s0 - q * s1]; } return ((s0 % m) + m) % m; };
const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
interface RsaS { t: number }
function rsaCalc(v: Record<string, number | string | boolean>) { const p = PRIMES[num(v, 'p')], q = PRIMES[(num(v, 'p') === num(v, 'q') ? (num(v, 'q') + 1) % PRIMES.length : num(v, 'q'))], n = p * q, phi = (p - 1) * (q - 1); let e = num(v, 'e') | 1; if (e < 3) e = 3; while (gcd(e, phi) !== 1) e += 2; const d = modinv(e, phi), msg = clamp(Math.round(num(v, 'm')), 2, n - 1), cipher = modpow(msg, e, n), back = modpow(cipher, d, n); return { p, q, n, phi, e, d, msg, cipher, back }; }
export const rsaToy = defineSim<RsaS>({
  id: 'rsa_toy_walkthrough', title: 'RSA Public-Key Cryptography: Toy Key Generation, Encrypt & Decrypt',
  ...meta('Security', CSL, 'Intermediate', 'Cryptography', 'Public-Key Cryptography', 'RSA key generation and modular exponentiation (toy sizes)'),
  covers: ['RSA algorithm', 'Modular exponentiation', "Euler's totient", 'Public and private key', 'Modular inverse'],
  tags: ['B.Tech', 'BCA', 'M.Tech', 'cryptography', 'GATE', 'number theory', 'extended Euclid'],
  learningObjectives: ['Follow every RSA step with small numbers: n=pq, φ, e, d.', 'Verify (m^e)^d ≡ m (mod n).', 'See why real RSA needs huge primes (factoring n gives d).'],
  assumptions: ['TOY numbers only (two-digit primes) — trivially breakable; no padding. Real RSA uses 2048+ bit moduli and OAEP padding.'],
  blurb: 'Pick two small primes and a message number. The page computes the keys, encrypts with the public key, decrypts with the private key and shows that the original message returns.',
  hint: 'n=pq, φ=(p−1)(q−1), e coprime to φ, d=e⁻¹ mod φ. c=mᵉ mod n, m=cᵈ mod n.',
  params: [
    { kind: 'number', id: 'p', label: 'Prime p (index)', min: 0, max: 20, step: 1, value: 5, digits: 0 },
    { kind: 'number', id: 'q', label: 'Prime q (index)', min: 0, max: 20, step: 1, value: 9, digits: 0 },
    { kind: 'number', id: 'e', label: 'Public exponent e (≥3)', min: 3, max: 101, step: 2, value: 17, digits: 0 },
    { kind: 'number', id: 'm', label: 'Message m (number < n)', min: 2, max: 9000, step: 1, value: 1234, digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const r = rsaCalc(v); const rows: [string, string, string][] = [
      ['1. choose primes', `p = ${r.p},  q = ${r.q}`, C.cyan], ['2. modulus n = p·q', `n = ${r.n}`, C.cyan], ['3. φ(n) = (p−1)(q−1)', `φ = ${r.phi}`, C.cyan], ['4. public exponent e (gcd(e,φ)=1)', `e = ${r.e}`, C.green], ['5. private d = e⁻¹ mod φ', `d = ${r.d}   (e·d mod φ = ${(r.e * r.d) % r.phi})`, C.purple], ['6. encrypt c = m^e mod n', `m = ${r.msg}  →  c = ${r.cipher}`, C.amber], ['7. decrypt m = c^d mod n', `c = ${r.cipher}  →  m = ${r.back}`, r.back === r.msg ? C.green : C.red]];
    const rh = (h - 60) / rows.length; rows.forEach((row, i) => { const y = 12 + i * rh; panel(c, { x: 10, y, w: w - 20, h: rh - 6 }); text(c, row[0], 20, y + rh * 0.4, C.dim, 11); text(c, row[1], 20, y + rh * 0.4 + 18, row[2], 14, 'left', 'alphabetic', true); });
    text(c, r.back === r.msg ? 'decryption recovered the message ✓  (toy size: factor n to break it)' : 'MISMATCH — message must be < n', 14, h - 18, r.back === r.msg ? C.green : C.red, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { const r = rsaCalc(v); return [{ label: 'n = p·q', value: r.n, digits: 0 }, { label: 'φ(n)', value: r.phi, digits: 0 }, { label: 'Public key (e, n)', value: `(${r.e}, ${r.n})` }, { label: 'Private key (d, n)', value: `(${r.d}, ${r.n})` }, { label: 'Ciphertext', value: r.cipher, digits: 0 }, { label: 'Decrypted', value: r.back, digits: 0 }]; },
  equations(_s, v) { const r = rsaCalc(v); return ['c \\equiv m^{e} \\pmod n,\\quad m \\equiv c^{d} \\pmod n', `ed \\equiv 1 \\pmod{\\varphi(n)}:\\ ${r.e}\\cdot${r.d} \\equiv 1 \\pmod{${r.phi}}`]; },
});

/* ---------- Diffie-Hellman (toy) ---------- */
interface DhS { t: number }
export const diffieHellman = defineSim<DhS>({
  id: 'diffie_hellman_toy', title: 'Diffie–Hellman Key Exchange: Shared Secret Over a Public Channel',
  ...meta('Security', CSL, 'Intermediate', 'Cryptography', 'Key Exchange', 'Diffie–Hellman with small modular numbers'),
  covers: ['Diffie–Hellman key exchange', 'Discrete logarithm problem', 'Primitive root', 'Man-in-the-middle awareness'],
  tags: ['B.Tech', 'BCA', 'M.Tech', 'cryptography', 'GATE', 'TLS', 'key agreement'],
  learningObjectives: ['See both parties compute the same secret without sending it.', 'Understand what the eavesdropper sees and why the discrete log is hard at real sizes.', 'Notice that without authentication a man-in-the-middle can interfere.'],
  assumptions: ['TOY prime p < 200; the eavesdropper can brute-force instantly here. Real DH uses 2048-bit groups or elliptic curves, with authentication.'],
  blurb: 'Alice and Bob each keep a private number and publish only g^x mod p. Both arrive at the same shared secret; the panel shows exactly which values travel over the public channel.',
  hint: 'A=g^a mod p, B=g^b mod p, secret = B^a = A^b = g^{ab} mod p.',
  params: [
    { kind: 'select', id: 'p', label: 'Public prime p', value: '151', options: ['23', '47', '101', '151', '197'].map(x => ({ value: x, label: x })) },
    { kind: 'number', id: 'g', label: 'Generator g', min: 2, max: 20, step: 1, value: 6, digits: 0 },
    { kind: 'number', id: 'a', label: "Alice's secret a", min: 2, max: 60, step: 1, value: 23, digits: 0 },
    { kind: 'number', id: 'b', label: "Bob's secret b", min: 2, max: 60, step: 1, value: 37, digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const p = Number(str(v, 'p')), g = num(v, 'g'), a = num(v, 'a'), b = num(v, 'b'), A = modpow(g, a, p), B = modpow(g, b, p), K1 = modpow(B, a, p), K2 = modpow(A, b, p);
    const bw = w * 0.28, by = 20, bh = h * 0.62; const box = (x: number, name: string, col: string, lines: string[]) => { panel(c, { x, y: by, w: bw, h: bh }); text(c, name, x + 10, by + 22, col, 14, 'left', 'alphabetic', true); lines.forEach((l, i) => text(c, l, x + 10, by + 50 + i * 24, i === lines.length - 1 ? C.amber : C.text, 12)); };
    box(10, 'Alice', C.cyan, [`secret a = ${a}`, `A = ${g}^${a} mod ${p}`, `A = ${A}`, `K = B^a mod p`, `K = ${K1}`]); box(w - bw - 10, 'Bob', C.pink, [`secret b = ${b}`, `B = ${g}^${b} mod ${p}`, `B = ${B}`, `K = A^b mod p`, `K = ${K2}`]);
    const mx = w / 2, my = by + bh / 2, ph = (s.t * 0.8) % 1; panel(c, { x: bw + 24, y: by + 30, w: w - 2 * bw - 48, h: bh - 60 }); text(c, 'PUBLIC CHANNEL', mx, by + 52, C.dim, 10, 'center'); text(c, `p = ${p}, g = ${g}`, mx, by + 72, C.text, 11, 'center'); text(c, `A = ${A}  →`, mx, my - 8, C.cyan, 13, 'center', 'alphabetic', true); text(c, `←  B = ${B}`, mx, my + 18, C.pink, 13, 'center', 'alphabetic', true);
    circle(c, bw + 30 + ph * (w - 2 * bw - 60), my + 36, 4, C.cyan); circle(c, w - bw - 30 - ph * (w - 2 * bw - 60), my + 48, 4, C.pink);
    text(c, K1 === K2 ? `shared secret = ${K1} ✓ (never sent)` : 'mismatch', w / 2, h - 32, K1 === K2 ? C.green : C.red, 14, 'center', 'alphabetic', true); text(c, 'an eavesdropper sees p, g, A, B only', w / 2, h - 12, C.dim, 11, 'center');
  },
  readouts(_s, v) { const p = Number(str(v, 'p')), g = num(v, 'g'), a = num(v, 'a'), b = num(v, 'b'); let steps = 0; const A = modpow(g, a, p); for (let x = 1; x < p; x++) { steps++; if (modpow(g, x, p) === A) break; } return [{ label: "Alice's public A", value: A, digits: 0 }, { label: "Bob's public B", value: modpow(g, b, p), digits: 0 }, { label: 'Shared secret', value: modpow(modpow(g, b, p), a, p), digits: 0 }, { label: 'Brute-force tries to find a', value: steps, digits: 0 }, { label: 'Real-world group size', value: '2²⁰⁴⁸ (infeasible)' }]; },
  equations(_s, v) { return ['A = g^a \\bmod p,\\quad B = g^b \\bmod p', `K = B^a \\equiv A^b \\equiv g^{ab} \\pmod{${str(v, 'p')}}`]; },
});

/* ---------- Hash avalanche ---------- */
function mix32(str: string, seed = 0x9e3779b9) { let h = seed >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; } h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return h >>> 0; }
interface HaS { t: number }
export const hashAvalanche = defineSim<HaS>({
  id: 'hash_avalanche_effect', title: 'Hash Functions: Avalanche Effect and Collisions (32-bit Toy Hash)',
  ...meta('Security', CSL, 'Beginner', 'Cryptography', 'Hash Functions', 'Avalanche effect, birthday paradox for collisions'),
  covers: ['Hash function', 'Avalanche effect', 'Birthday paradox', 'Collision resistance', 'Hash length vs security'],
  tags: ['B.Tech', 'BCA', 'cryptography', 'SHA', 'checksum', 'integrity', 'birthday attack'],
  learningObjectives: ['See a one-character change flip about half the output bits.', 'Estimate collision probability with the birthday formula.', 'Understand why 32-bit hashes are far too short for security.'],
  assumptions: ['A 32-bit mixing function (MurmurHash-style) is used for demonstration; it is NOT cryptographically secure.'],
  blurb: 'Type any message, then flip one bit or letter. The 32-bit hash before and after is compared bit by bit, and the birthday curve shows how fast collisions appear for shorter hashes.',
  hint: 'Good hashes flip ~50% of output bits for any 1-bit input change. For n-bit hashes a collision needs about 2^(n/2) samples: P≈1−exp(−k²/2^(n+1)).',
  params: [
    { kind: 'select', id: 'msg', label: 'Message', value: 'Pay Alice 100 rupees', options: ['Pay Alice 100 rupees', 'Pay Alice 900 rupees', 'hello world', 'Notes Maker AI'].map(x => ({ value: x, label: x })) },
    { kind: 'number', id: 'pos', label: 'Character index to alter', min: 0, max: 19, step: 1, value: 10, digits: 0 },
    { kind: 'number', id: 'bits', label: 'Hash length n (bits) for birthday curve', min: 16, max: 64, step: 1, value: 32, digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const m1 = str(v, 'msg'), pos = Math.min(num(v, 'pos'), m1.length - 1), m2 = m1.slice(0, pos) + String.fromCharCode(m1.charCodeAt(pos) ^ 1) + m1.slice(pos + 1), h1 = mix32(m1), h2 = mix32(m2), x = (h1 ^ h2) >>> 0;
    text(c, `"${m1}" → ${h1.toString(16).padStart(8, '0')}`, 10, 18, C.cyan, 12, 'left', 'alphabetic', true); text(c, `"${m2}" → ${h2.toString(16).padStart(8, '0')}`, 10, 38, C.pink, 12, 'left', 'alphabetic', true);
    const cw = (w - 20) / 32; for (let i = 0; i < 32; i++) { const bit = (x >>> (31 - i)) & 1; c.fillStyle = bit ? C.amber : '#1e293b'; c.fillRect(10 + i * cw + 1, 50, cw - 2, 26); text(c, String((h1 >>> (31 - i)) & 1), 10 + i * cw + cw / 2, 68, bit ? '#0f172a' : C.dim, 10, 'center'); }
    const flips = x.toString(2).split('1').length - 1; text(c, `${flips} of 32 output bits changed (${fmt((flips / 32) * 100, 0)} %) — ideal ≈ 50 %`, 10, 98, flips > 10 && flips < 22 ? C.green : C.amber, 12, 'left', 'alphabetic', true);
    const R = { x: 8, y: 110, w: w - 16, h: h - 120 }, n = num(v, 'bits'), N = 2 ** n; const mp = plot(c, R, [0, Math.min(Math.sqrt(N) * 4, 1e12)], [0, 1], { title: `Collision probability vs number of hashes (n = ${n} bits)`, xlabel: 'hashes computed', ystep: 0.25 });
    const pts: [number, number][] = []; const xm = Math.min(Math.sqrt(N) * 4, 1e12); for (let k = 0; k <= 100; k++) { const kk = (k / 100) * xm; pts.push([mp.X(kk), mp.Y(1 - Math.exp(-(kk * kk) / (2 * N)))]); } polyline(c, pts, C.green, 2.4); const k50 = 1.1774 * Math.sqrt(N); circle(c, mp.X(k50), mp.Y(0.5), 5, C.amber, C.white, 1.5); text(c, `50 % at ≈ ${k50.toExponential(1)}`, mp.X(k50) + 8, mp.Y(0.5) + 16, C.amber, 11);
  },
  readouts(_s, v) { const m1 = str(v, 'msg'), pos = Math.min(num(v, 'pos'), m1.length - 1), m2 = m1.slice(0, pos) + String.fromCharCode(m1.charCodeAt(pos) ^ 1) + m1.slice(pos + 1), x = (mix32(m1) ^ mix32(m2)) >>> 0, n = num(v, 'bits'); return [{ label: 'Bits flipped', value: x.toString(2).split('1').length - 1, unit: '/ 32', digits: 0 }, { label: 'Hashes for 50 % collision', value: 1.1774 * Math.sqrt(2 ** n), digits: 0 }, { label: 'Security vs brute force', value: n / 2, unit: 'bits (birthday)', digits: 0 }]; },
  equations(_s, v) { return ['P_{coll} \\approx 1 - e^{-k^2 / 2^{n+1}}', `k_{50\\%} \\approx 1.18\\sqrt{2^{${num(v, 'bits')}}}`]; },
});

/* ---------- Frequency analysis ---------- */
const TEXT = 'THE ANCIENT ROMANS USED SIMPLE SUBSTITUTION CODES TO PROTECT MESSAGES FROM ENEMIES BUT SUCH CODES CAN BE BROKEN EASILY BY COUNTING HOW OFTEN EACH LETTER APPEARS BECAUSE ENGLISH TEXT HAS A VERY UNEVEN LETTER DISTRIBUTION WITH E AND T AT THE TOP';
const ENG = [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15, 2.0, 0.074];
interface FaS { t: number }
function caesar(t: string, k: number) { return [...t].map(ch => (ch >= 'A' && ch <= 'Z' ? String.fromCharCode(((ch.charCodeAt(0) - 65 + k) % 26 + 26) % 26 + 65) : ch)).join(''); }
export const freqAnalysis = defineSim<FaS>({
  id: 'caesar_frequency_analysis', title: 'Classical Ciphers: Caesar Cipher and Breaking It by Frequency Analysis',
  ...meta('Security', ['B.Tech', 'B.Sc', 'BCA', 'Class 11', 'Class 12'] as EducationLevel[], 'Beginner', 'Cryptography', 'Classical Ciphers', 'Substitution cipher and letter-frequency attack'),
  covers: ['Caesar cipher', 'Frequency analysis', 'Key space', 'Chi-squared goodness of fit', 'Why classical ciphers are insecure'],
  tags: ['B.Tech', 'BCA', 'cryptography', 'history', 'substitution', 'cryptanalysis', 'CS'],
  learningObjectives: ['Encrypt with a shift key and see the letter histogram shift with it.', 'Break the cipher by matching the histogram to English frequencies.', 'Understand that a key space of 25 is trivial to search.'],
  assumptions: ['Caesar shift only on a short English sample; frequency fit works best on longer texts.'],
  blurb: 'Choose a secret shift, watch the ciphertext histogram slide, then let the attacker find the key by sliding English letter frequencies until the fit (chi-squared) is minimal.',
  hint: 'E(x)=x+k mod 26. English letter frequencies are very uneven (E≈12.7 %). The shift minimising χ² between observed and expected counts is the key.',
  params: [{ kind: 'number', id: 'k', label: 'Secret shift k', min: 0, max: 25, step: 1, value: 7, digits: 0 }, { kind: 'toggle', id: 'eng', label: 'Overlay expected English frequencies', value: true }],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const k = num(v, 'k'), ct = caesar(TEXT, k), cnt = Array(26).fill(0); for (const ch of ct) if (ch >= 'A' && ch <= 'Z') cnt[ch.charCodeAt(0) - 65]++; const tot = cnt.reduce((a, b) => a + b, 0);
    const chi = (s: number) => { let x = 0; for (let i = 0; i < 26; i++) { const o = cnt[(i + s) % 26], e = (ENG[i] / 100) * tot; x += (o - e) ** 2 / Math.max(e, 0.01); } return x; }; let best = 0, bc = Infinity; for (let s = 0; s < 26; s++) { const x = chi(s); if (x < bc) { bc = x; best = s; } }
    const R = { x: 8, y: 8, w: w - 16, h: h * 0.52 }; const m = plot(c, R, [0, 26], [0, 16], { title: 'Ciphertext letter frequencies (%)', ystep: 4 }); const cw = (m.X(1) - m.X(0)) * 0.7;
    for (let i = 0; i < 26; i++) { const x = m.X(i) + (m.X(1) - m.X(0)) * 0.15, hh = (cnt[i] / tot) * 100; c.fillStyle = C.cyan; c.fillRect(x, m.Y(hh), cw, m.Y(0) - m.Y(hh)); text(c, String.fromCharCode(65 + i), x + cw / 2, m.Y(0) + 11, C.dim, 9, 'center'); if (num(v, 'eng') ? true : false) { const j = (i - best + 26) % 26; circle(c, x + cw / 2, m.Y(ENG[j]), 3, C.amber); } }
    text(c, 'amber dots = English frequencies shifted by the best guess', R.x + R.w - 8, R.y + 16, C.amber, 10, 'right');
    const B = { x: 8, y: R.y + R.h + 10, w: w - 16, h: h - R.h - 26 }; panel(c, B); text(c, `Attacker's best shift: ${best}  (true key ${k}) ${best === k ? '✓ broken' : '✗ not enough text'}`, B.x + 10, B.y + 20, best === k ? C.green : C.red, 12, 'left', 'alphabetic', true); text(c, caesar(ct, -best).slice(0, 62) + '…', B.x + 10, B.y + 42, C.text, 11); text(c, ct.slice(0, 62) + '…', B.x + 10, B.y + 62, C.dim, 11);
  },
  readouts(_s, v) { const k = num(v, 'k'), ct = caesar(TEXT, k), cnt = Array(26).fill(0); for (const ch of ct) if (ch >= 'A' && ch <= 'Z') cnt[ch.charCodeAt(0) - 65]++; const tot = cnt.reduce((a, b) => a + b, 0); let best = 0, bc = Infinity; for (let s = 0; s < 26; s++) { let x = 0; for (let i = 0; i < 26; i++) { const o = cnt[(i + s) % 26], e = (ENG[i] / 100) * tot; x += (o - e) ** 2 / Math.max(e, 0.01); } if (x < bc) { bc = x; best = s; } } return [{ label: 'Secret key', value: k, digits: 0 }, { label: 'Recovered key', value: best, digits: 0 }, { label: 'Key space', value: 25, digits: 0 }, { label: 'Best χ²', value: bc, digits: 1 }, { label: 'Letters analysed', value: tot, digits: 0 }]; },
  equations() { return ['E_k(x) = (x + k) \\bmod 26', '\\chi^2 = \\sum_i \\dfrac{(O_i - E_i)^2}{E_i}']; },
});

/* ---------- Sorting ---------- */
interface SoS { a: number[]; i: number; j: number; cmp: number; swaps: number; done: boolean; algo: string; gen: number[]; stack: [number, number][]; phase: number }
function* sortGen(a: number[], algo: string, tick: (i: number, j: number) => void): Generator<void> {
  const n = a.length; const cmp = (i: number, j: number) => { tick(i, j); return a[i] - a[j]; };
  if (algo === 'bubble') { for (let i = 0; i < n; i++) for (let j = 0; j < n - 1 - i; j++) { if (cmp(j, j + 1) > 0) [a[j], a[j + 1]] = [a[j + 1], a[j]]; yield; } }
  else if (algo === 'insertion') { for (let i = 1; i < n; i++) { let j = i; while (j > 0 && cmp(j - 1, j) > 0) { [a[j - 1], a[j]] = [a[j], a[j - 1]]; j--; yield; } yield; } }
  else if (algo === 'selection') { for (let i = 0; i < n; i++) { let m = i; for (let j = i + 1; j < n; j++) { if (cmp(j, m) < 0) m = j; yield; } [a[i], a[m]] = [a[m], a[i]]; yield; } }
  else { const qs = function* (lo: number, hi: number): Generator<void> { if (lo >= hi) return; const p = a[hi]; let i = lo; for (let j = lo; j < hi; j++) { tick(j, hi); if (a[j] < p) { [a[i], a[j]] = [a[j], a[i]]; i++; } yield; } [a[i], a[hi]] = [a[hi], a[i]]; yield; yield* qs(lo, i - 1); yield* qs(i + 1, hi); }; yield* qs(0, n - 1); }
}
export const sorting = defineSim<SoS>({
  id: 'sorting_algorithms_race', title: 'Sorting Algorithms Visualised: Bubble, Insertion, Selection, Quick Sort',
  ...meta('Computer Science', [...CSL, 'Class 11', 'Class 12'] as EducationLevel[], 'Beginner', 'Algorithms', 'Sorting', 'Comparisons, swaps and O(n²) vs O(n log n)'),
  covers: ['Bubble sort', 'Insertion sort', 'Selection sort', 'Quick sort', 'Time complexity', 'Comparisons and swaps'],
  tags: ['BCA', 'B.Tech', 'Class 11', 'Class 12', 'CS', 'DSA', 'GATE', 'algorithms', 'complexity'],
  learningObjectives: ['Watch how each algorithm rearranges the bars.', 'Count comparisons and compare growth with n.', 'See why quick sort needs far fewer comparisons on large arrays.'],
  assumptions: ['Random permutation input; quick sort uses the last element as pivot (worst case on sorted input).'],
  blurb: 'Run a sorting algorithm on a random array and watch every comparison (amber) and move. Change the algorithm or the array size and compare the comparison counts.',
  hint: 'Bubble/insertion/selection do about n²/2 comparisons; quick sort averages 1.39 n log₂ n. Counts are measured live, not assumed.',
  params: [
    { kind: 'select', id: 'algo', label: 'Algorithm', value: 'quick', options: [{ value: 'bubble', label: 'Bubble sort' }, { value: 'insertion', label: 'Insertion sort' }, { value: 'selection', label: 'Selection sort' }, { value: 'quick', label: 'Quick sort' }], resetOnChange: true },
    { kind: 'number', id: 'n', label: 'Array size', min: 8, max: 80, step: 1, value: 40, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'spd', label: 'Steps per frame', min: 1, max: 40, step: 1, value: 3, digits: 0 },
  ],
  actions: [{ id: 'shuffle', label: 'Shuffle & restart' }],
  dt: 1 / 30, previewSeconds: 6,
  init(v) { const n = num(v, 'n'), a = Array.from({ length: n }, (_, i) => i + 1); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } const s: SoS = { a, i: -1, j: -1, cmp: 0, swaps: 0, done: false, algo: str(v, 'algo'), gen: [], stack: [], phase: 0 }; (s as unknown as { g: Generator<void> }).g = sortGen(a, str(v, 'algo'), (x, y) => { s.i = x; s.j = y; s.cmp++; }); return s; },
  action(s, v) { const n = num(v, 'n'); s.a.length = 0; const a = Array.from({ length: n }, (_, i) => i + 1); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } s.a.push(...a); s.cmp = 0; s.done = false; s.i = s.j = -1; (s as unknown as { g: Generator<void> }).g = sortGen(s.a, str(v, 'algo'), (x, y) => { s.i = x; s.j = y; s.cmp++; }); },
  step(s, v) { if (s.done) return; const g = (s as unknown as { g: Generator<void> }).g; for (let k = 0; k < num(v, 'spd'); k++) if (g.next().done) { s.done = true; s.i = s.j = -1; return; } },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const n = s.a.length, bw = (w - 20) / n, base = h - 30; for (let i = 0; i < n; i++) { const bh = (s.a[i] / n) * (h - 70); c.fillStyle = s.done ? C.green : i === s.i || i === s.j ? C.amber : C.cyan; c.fillRect(10 + i * bw + 1, base - bh, bw - 2, bh); }
    text(c, `${s.cmp} comparisons${s.done ? ' — sorted ✓' : ''}`, 10, 18, s.done ? C.green : C.text, 13, 'left', 'alphabetic', true); text(c, `n log₂ n = ${fmt(n * Math.log2(n), 0)}   n²/2 = ${fmt((n * n) / 2, 0)}`, w - 10, 18, C.dim, 11, 'right');
  },
  readouts(s) { const n = s.a.length; return [{ label: 'Array size n', value: n, digits: 0 }, { label: 'Comparisons so far', value: s.cmp, digits: 0 }, { label: 'n²/2 reference', value: (n * n) / 2, digits: 0 }, { label: '1.39 n log₂ n reference', value: 1.39 * n * Math.log2(n), digits: 0 }, { label: 'Status', value: s.done ? 'sorted' : 'running' }]; },
  equations() { return ['T_{bubble},\\ T_{insertion},\\ T_{selection} = O(n^2)', 'T_{quick} = O(n\\log n)\\ \\text{(average)}']; },
});

/* ---------- M/M/1 queue ---------- */
interface QuS { t: number; q: number[]; busy: number; next: number; done: number; sumWait: number; arrived: number; hist: number[]; svcEnd: number; len: { t: number; n: number }[]; areaN: number }
const expo = (r: number) => -Math.log(1 - Math.random()) / r;
export const mm1 = defineSim<QuS>({
  id: 'mm1_queue', title: 'M/M/1 Queue: Arrivals, Service and Waiting Time vs Utilisation',
  ...meta('Computer Science', [...CSL] as EducationLevel[], 'Intermediate', 'Operations & Systems', 'Queueing Theory', 'M/M/1 queue, Little’s law, utilisation'),
  covers: ['M/M/1 queue', "Little's law", 'Utilisation ρ', 'Poisson arrivals', 'Exponential service time'],
  tags: ['B.Tech', 'BBA', 'operations research', 'GATE', 'networks', 'bank counter', 'simulation'],
  learningObjectives: ['See that queue length explodes as utilisation ρ approaches 1.', 'Compare simulated averages with the formula L = ρ/(1−ρ).', 'Apply Little’s law L = λW.'],
  assumptions: ['Poisson arrivals, exponential service, single server, infinite buffer; averages need a long run to converge.'],
  blurb: 'Customers arrive randomly at one server. Watch the queue build up, then move the arrival rate towards the service rate and see waits grow without bound.',
  hint: 'ρ=λ/μ<1. L=ρ/(1−ρ), Lq=ρ²/(1−ρ), W=1/(μ−λ), Wq=ρ/(μ−λ). Simulation estimates converge to these.',
  params: [
    { kind: 'number', id: 'lam', label: 'Arrival rate λ', min: 0.1, max: 2, step: 0.05, value: 0.7, unit: '/s', digits: 2 },
    { kind: 'number', id: 'mu', label: 'Service rate μ', min: 0.5, max: 2.5, step: 0.05, value: 1.0, unit: '/s', digits: 2 },
  ],
  actions: [{ id: 'reset', label: 'Reset statistics' }],
  dt: 1 / 20, previewSeconds: 120,
  init() { return { t: 0, q: [], busy: 0, next: expo(0.7), done: 0, sumWait: 0, arrived: 0, hist: [], svcEnd: Infinity, len: [], areaN: 0 }; },
  action(s) { s.t = 0; s.q = []; s.busy = 0; s.done = 0; s.sumWait = 0; s.arrived = 0; s.hist = []; s.svcEnd = Infinity; s.len = []; s.areaN = 0; s.next = 1; },
  step(s, v, dt) {
    const lam = num(v, 'lam'), mu = num(v, 'mu'); const N = () => s.q.length + s.busy; s.areaN += N() * dt; s.t += dt; if (s.t >= s.next) { s.arrived++; s.q.push(s.t); s.next = s.t + expo(lam); }
    if (s.busy && s.t >= s.svcEnd) { s.busy = 0; s.done++; } if (!s.busy && s.q.length) { const arr = s.q.shift()!; s.sumWait += s.t - arr; s.busy = 1; s.svcEnd = s.t + expo(mu); }
    if (Math.round(s.t / dt) % 10 === 0) { s.hist.push(N()); if (s.hist.length > 300) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const rho = num(v, 'lam') / num(v, 'mu'); const y = 60; text(c, 'queue →', 10, y - 16, C.dim, 10); const show = Math.min(s.q.length, 24); for (let i = 0; i < show; i++) circle(c, 24 + i * 20, y + 10, 7, C.amber, C.white, 1); if (s.q.length > show) text(c, `+${s.q.length - show}`, 24 + show * 20, y + 14, C.amber, 11);
    c.fillStyle = s.busy ? C.green : '#1e293b'; c.fillRect(w - 70, y - 12, 56, 44); text(c, s.busy ? 'serving' : 'idle', w - 42, y + 14, C.white, 10, 'center');
    const R = { x: 8, y: 100, w: w - 16, h: h - 110 }; const m = plot(c, R, [0, 300], [0, Math.max(8, ...s.hist) + 1], { title: 'Customers in system over time', ystep: 4 }); polyline(c, s.hist.map((n, i) => [m.X(i), m.Y(n)] as [number, number]), C.cyan, 1.8);
    if (rho < 1) { const L = rho / (1 - rho); line(c, R.x + 30, m.Y(L), R.x + R.w - 8, m.Y(L), C.pink, 1.4, [4, 3]); text(c, `theory L = ${fmt(L, 2)}`, R.x + R.w - 10, m.Y(L) - 5, C.pink, 10, 'right'); } else text(c, 'ρ ≥ 1: queue grows without limit', R.x + R.w / 2, R.y + 40, C.red, 13, 'center', 'alphabetic', true);
  },
  readouts(s, v) { const lam = num(v, 'lam'), mu = num(v, 'mu'), rho = lam / mu; return [{ label: 'Utilisation ρ = λ/μ', value: rho, digits: 2 }, { label: 'Theory L', value: rho < 1 ? rho / (1 - rho) : 'unbounded', digits: 2 }, { label: 'Simulated avg in system', value: s.t > 1 ? s.areaN / s.t : 0, digits: 2 }, { label: 'Theory W', value: rho < 1 ? 1 / (mu - lam) : 'unbounded', unit: rho < 1 ? 's' : '', digits: 2 }, { label: 'Simulated avg wait in queue', value: s.done ? s.sumWait / Math.max(s.done, 1) : 0, unit: 's', digits: 2 }, { label: 'Served so far', value: s.done, digits: 0 }]; },
  equations(_s, v) { const rho = num(v, 'lam') / num(v, 'mu'); return ['\\rho = \\lambda/\\mu,\\quad L = \\dfrac{\\rho}{1-\\rho},\\quad L = \\lambda W', `\\rho = ${fmt(rho, 2)}`]; },
});

/* ---------- CLT + hypothesis ---------- */
interface CltS { means: number[]; n: number; total: number }
export const clt = defineSim<CltS>({
  id: 'central_limit_theorem', title: 'Central Limit Theorem: Sample Means of Any Distribution Become Normal',
  ...meta('Math', ['Class 11', 'Class 12', 'B.Sc', 'B.Tech', 'BBA', 'BCA', 'M.Sc', 'M.Tech'] as EducationLevel[], 'Intermediate', 'Probability & Statistics', 'Sampling Distributions', 'CLT, standard error, effect of sample size'),
  covers: ['Central limit theorem', 'Sampling distribution', 'Standard error', 'Skewed distributions', 'Law of large numbers'],
  tags: ['Class 12', 'B.Sc', 'BBA', 'statistics', 'GATE', 'normal distribution', 'confidence interval'],
  learningObjectives: ['See sample means pile up in a bell curve even for skewed data.', 'Check that the spread shrinks as σ/√n.', 'Compare the simulated histogram with the normal curve.'],
  assumptions: ['Independent samples from the chosen population; means collected up to 4000 samples.'],
  blurb: 'Draw many samples from a uniform, exponential or two-peak population and plot the histogram of sample means. As the sample size n grows the histogram turns into a narrow normal curve.',
  hint: 'Mean of sample means → μ; standard deviation → σ/√n. Exponential(1): μ=1, σ=1. Uniform(0,1): μ=0.5, σ=0.289.',
  params: [
    { kind: 'select', id: 'dist', label: 'Population', value: 'exp', options: [{ value: 'exp', label: 'Exponential (skewed)' }, { value: 'uni', label: 'Uniform' }, { value: 'bi', label: 'Two-peak' }], resetOnChange: true },
    { kind: 'number', id: 'n', label: 'Sample size n', min: 1, max: 100, step: 1, value: 10, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'rate', label: 'New samples per frame', min: 1, max: 60, step: 1, value: 10, digits: 0 },
  ],
  actions: [{ id: 'clear', label: 'Clear' }],
  dt: 1 / 30, previewSeconds: 8,
  init() { return { means: [], n: 0, total: 0 }; }, action(s) { s.means = []; s.total = 0; },
  step(s, v) { const n = num(v, 'n'), d = str(v, 'dist'); if (s.n !== n) { s.n = n; s.means = []; } for (let k = 0; k < num(v, 'rate') && s.means.length < 4000; k++) { let a = 0; for (let i = 0; i < n; i++) a += d === 'exp' ? expo(1) : d === 'uni' ? Math.random() : Math.random() < 0.5 ? 0.2 + 0.05 * gauss() : 0.8 + 0.05 * gauss(); s.means.push(a / n); } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const d = str(v, 'dist'), n = num(v, 'n'), mu = d === 'exp' ? 1 : 0.5, sg = d === 'exp' ? 1 : d === 'uni' ? Math.sqrt(1 / 12) : Math.sqrt(0.09 + 0.0025), se = sg / Math.sqrt(n), lo = Math.max(0, mu - 4 * Math.max(se, 0.05)), hi = mu + 4 * Math.max(se, 0.05) * (d === 'exp' ? 1.6 : 1);
    const R = { x: 8, y: 8, w: w - 16, h: h - 16 }, nb = 40, cnt = Array(nb).fill(0); for (const x of s.means) { const b = Math.floor(((x - lo) / (hi - lo)) * nb); if (b >= 0 && b < nb) cnt[b]++; } const tot = Math.max(s.means.length, 1), dens = cnt.map(q => q / tot / ((hi - lo) / nb)); const pk = Math.max(...dens, 1 / (se * 2.5) * 1.1, 0.1);
    const m = plot(c, R, [lo, hi], [0, pk * 1.1], { title: `Distribution of sample means (n = ${n}, ${s.means.length} samples)`, xlabel: 'sample mean', ystep: pk / 3 });
    dens.forEach((q, i) => { const x0 = m.X(lo + (i / nb) * (hi - lo)), x1 = m.X(lo + ((i + 1) / nb) * (hi - lo)); c.fillStyle = 'rgba(34,211,238,0.6)'; c.fillRect(x0, m.Y(q), x1 - x0 - 1, m.Y(0) - m.Y(q)); });
    const pts: [number, number][] = []; for (let k = 0; k <= 200; k++) { const x = lo + (k / 200) * (hi - lo); pts.push([m.X(x), m.Y(Math.exp(-((x - mu) ** 2) / (2 * se * se)) / (se * Math.sqrt(TAU)))]); } polyline(c, pts, C.amber, 2.4); text(c, 'normal N(μ, σ²/n)', R.x + R.w - 10, R.y + 36, C.amber, 11, 'right');
  },
  readouts(s, v) { const d = str(v, 'dist'), n = num(v, 'n'), mu = d === 'exp' ? 1 : 0.5, sg = d === 'exp' ? 1 : d === 'uni' ? Math.sqrt(1 / 12) : Math.sqrt(0.0925), N = s.means.length, m = N ? s.means.reduce((a, b) => a + b, 0) / N : 0, sd = N > 1 ? Math.sqrt(s.means.reduce((a, b) => a + (b - m) ** 2, 0) / (N - 1)) : 0; return [{ label: 'Population mean μ', value: mu, digits: 3 }, { label: 'Mean of sample means', value: m, digits: 3 }, { label: 'Theory σ/√n', value: sg / Math.sqrt(n), digits: 3 }, { label: 'Simulated std of means', value: sd, digits: 3 }, { label: 'Samples drawn', value: N, digits: 0 }]; },
  equations(_s, v) { return ['\\bar X \\sim N\\!\\left(\\mu,\\ \\dfrac{\\sigma^2}{n}\\right),\\quad SE = \\dfrac{\\sigma}{\\sqrt n}', `n = ${num(v, 'n')}`]; },
});

/* ---------- Break-even & EOQ ---------- */
interface BeS { t: number }
export const breakEven = defineSim<BeS>({
  id: 'break_even_eoq', title: 'Business Economics: Break-even Point and Economic Order Quantity (EOQ)',
  ...meta('Math', ['BBA', 'B.Sc', 'B.Tech', 'Class 11', 'Class 12'] as EducationLevel[], 'Beginner', 'Business Mathematics', 'Cost–Volume–Profit and Inventory', 'Break-even analysis and inventory cost minimisation'),
  covers: ['Break-even point', 'Fixed and variable cost', 'Contribution margin', 'Economic order quantity', 'Total inventory cost'],
  tags: ['BBA', 'commerce', 'Class 12', 'operations', 'inventory', 'CVP analysis', 'accountancy'],
  learningObjectives: ['Find the quantity where revenue equals total cost.', 'See how price, fixed and variable cost shift the break-even.', 'Find the order size that minimises ordering plus holding cost.'],
  assumptions: ['Linear costs and constant demand (Wilson EOQ model); no discounts, shortages or lead-time uncertainty.'],
  blurb: 'Change price and costs and watch profit turn positive at the break-even quantity. The second chart finds the order quantity where ordering and holding costs balance.',
  hint: 'BEP = F/(p−v). EOQ = √(2DS/H); at the optimum ordering cost = holding cost.',
  params: [
    { kind: 'number', id: 'p', label: 'Selling price p', min: 5, max: 100, step: 1, value: 40, unit: '₹', digits: 0 },
    { kind: 'number', id: 'v', label: 'Variable cost v', min: 1, max: 90, step: 1, value: 22, unit: '₹', digits: 0 },
    { kind: 'number', id: 'F', label: 'Fixed cost F', min: 1000, max: 100000, step: 500, value: 36000, unit: '₹', digits: 0 },
    { kind: 'number', id: 'D', label: 'Annual demand D', min: 500, max: 20000, step: 100, value: 6000, digits: 0 },
    { kind: 'number', id: 'S', label: 'Order cost S', min: 10, max: 1000, step: 10, value: 150, unit: '₹', digits: 0 },
    { kind: 'number', id: 'H', label: 'Holding cost H /unit/yr', min: 1, max: 60, step: 1, value: 8, unit: '₹', digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const p = num(v, 'p'), vc = num(v, 'v'), F = num(v, 'F'), D = num(v, 'D'), S = num(v, 'S'), H = num(v, 'H'), bep = p > vc ? F / (p - vc) : Infinity, qmax = Math.max(Math.min(bep * 2, 4e4), 100);
    const L = { x: 8, y: 8, w: w * 0.5 - 12, h: h - 16 }; const m1 = plot(c, L, [0, qmax], [0, Math.max(p * qmax, F + vc * qmax) * 1.05], { title: 'Revenue vs total cost (₹)', xlabel: 'units sold', ystep: Math.max(p * qmax, F + vc * qmax) / 4 });
    polyline(c, [[m1.X(0), m1.Y(F)], [m1.X(qmax), m1.Y(F + vc * qmax)]], C.red, 2.4); polyline(c, [[m1.X(0), m1.Y(0)], [m1.X(qmax), m1.Y(p * qmax)]], C.green, 2.4); line(c, m1.X(0), m1.Y(F), m1.X(qmax), m1.Y(F), C.dim, 1, [3, 3]); if (isFinite(bep) && bep < qmax) { circle(c, m1.X(bep), m1.Y(p * bep), 6, C.amber, C.white, 1.5); text(c, `BEP ${fmt(bep, 0)} units`, m1.X(bep) + 8, m1.Y(p * bep) + 18, C.amber, 11); } else text(c, 'p ≤ v: never breaks even', L.x + L.w / 2, L.y + 40, C.red, 12, 'center');
    const Q = Math.sqrt((2 * D * S) / H), R = { x: w * 0.5 + 4, y: 8, w: w * 0.5 - 12, h: h - 16 }, qm = Q * 3; const tc = (q: number) => (D / q) * S + (q / 2) * H; const m2 = plot(c, R, [Q * 0.1, qm], [0, tc(Q * 0.1) * 0.8 + tc(Q) * 0.4], { title: 'Annual inventory cost vs order size', xlabel: 'order quantity Q', ystep: tc(Q) });
    const mk = (f: (q: number) => number, col: string, wd: number) => { const pts: [number, number][] = []; for (let k = 0; k <= 100; k++) { const q = Q * 0.1 + (k / 100) * (qm - Q * 0.1); pts.push([m2.X(q), m2.Y(clamp(f(q), 0, tc(Q) * 3))]); } polyline(c, pts, col, wd); }
    mk(q => (D / q) * S, C.pink, 1.6); mk(q => (q / 2) * H, C.purple, 1.6); mk(tc, C.cyan, 2.6); circle(c, m2.X(Q), m2.Y(tc(Q)), 6, C.amber, C.white, 1.5); text(c, `EOQ ≈ ${fmt(Q, 0)}`, m2.X(Q) + 8, m2.Y(tc(Q)) - 8, C.amber, 11); text(c, 'ordering', R.x + R.w - 8, R.y + 36, C.pink, 10, 'right'); text(c, 'holding', R.x + R.w - 8, R.y + 50, C.purple, 10, 'right'); text(c, 'total', R.x + R.w - 8, R.y + 64, C.cyan, 10, 'right');
  },
  readouts(_s, v) { const p = num(v, 'p'), vc = num(v, 'v'), F = num(v, 'F'), D = num(v, 'D'), S = num(v, 'S'), H = num(v, 'H'), Q = Math.sqrt((2 * D * S) / H); return [{ label: 'Contribution margin p−v', value: p - vc, unit: '₹/unit', digits: 0 }, { label: 'Break-even quantity', value: p > vc ? F / (p - vc) : 'none', unit: p > vc ? 'units' : '', digits: 0 }, { label: 'Break-even revenue', value: p > vc ? (F / (p - vc)) * p : 'none', unit: p > vc ? '₹' : '', digits: 0 }, { label: 'Economic order quantity', value: Q, unit: 'units', digits: 0 }, { label: 'Orders per year', value: D / Q, digits: 1 }, { label: 'Min. inventory cost', value: (D / Q) * S + (Q / 2) * H, unit: '₹/yr', digits: 0 }]; },
  equations(_s, v) { const Q = Math.sqrt((2 * num(v, 'D') * num(v, 'S')) / num(v, 'H')); return ['Q_{BEP} = \\dfrac{F}{p - v}', `Q^* = \\sqrt{\\dfrac{2DS}{H}} = ${fmt(Q, 0)}`]; },
});

export const CS_SEC_BUS_SIMS = [rsaToy, diffieHellman, hashAvalanche, freqAnalysis, sorting, mm1, clt, breakEven];
void bool;
