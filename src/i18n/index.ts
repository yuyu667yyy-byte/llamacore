/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

// Normalize codes like 'zh', 'zh-TW', 'en', 'en-GB' to one of our supported codes
function normalizeLang(code: string | undefined): LanguageCode {
  if (!code) return 'zh-CN'
  const lower = code.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'
  return 'zh-CN'
}

// Detect initial language synchronously from localStorage (set by us) or navigator
function detectInitial(): LanguageCode {
  try {
    const saved = localStorage.getItem('llama_desktop_lang')
    if (saved) return normalizeLang(saved)
  } catch {}
  if (typeof navigator !== 'undefined') {
    return normalizeLang(navigator.language)
  }
  return 'zh-CN'
}

const initialLang = detectInitial()

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: initialLang,
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US'],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'llama_desktop_lang',
    },
  })

// Sync language to electron settings (persisted to disk for multi-machine portability)
export async function syncLanguageFromSettings() {
  const api = (window as any).electronAPI
  if (!api) return
  const saved = await api.settings.get('language')
  if (saved) {
    const normalized = normalizeLang(saved)
    if (normalized !== i18n.language) {
      await i18n.changeLanguage(normalized)
    }
  }
}

export async function setLanguage(code: LanguageCode) {
  await i18n.changeLanguage(code)
  try {
    localStorage.setItem('llama_desktop_lang', code)
  } catch {}
  const api = (window as any).electronAPI
  if (api) await api.settings.set('language', code)
}

export default i18n
