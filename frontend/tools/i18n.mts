import assert from 'node:assert/strict';
import { t, setUiLang, getUiLang, initLang, DICT_KEYS, UI_LANGS } from '../src/lib/i18n';
import { memKV } from '../src/lib/kv';
const kv = memKV(); initLang(kv); assert.equal(getUiLang(), 'en'); assert.equal(t('Dashboard'), 'Dashboard');
for (const [c] of UI_LANGS) { if (c === 'en') continue; for (const k of DICT_KEYS) { const v = t(k, c); assert.ok(v && v.length > 0, c + ':' + k); if (!/^(Sims|Practice)$/.test(k)) assert.notEqual(v, k, `${c} missing: ${k}`); } }
assert.equal(t('Not in dictionary', 'ta'), 'Not in dictionary', 'falls back to English');
setUiLang('hi', kv); assert.equal(getUiLang(), 'hi'); assert.equal(t('Dashboard'), 'डैशबोर्ड'); assert.equal(kv.get('nm_ui_lang'), 'hi'); setUiLang('xx', kv); assert.equal(getUiLang(), 'hi', 'invalid code ignored');
const kv2 = memKV(); kv2.set('nm_ui_lang', 'te'); initLang(kv2); assert.equal(getUiLang(), 'te'); kv2.set('nm_ui_lang', 'zz'); initLang(kv2); assert.equal(getUiLang(), 'en');
console.log('i18n OK');
