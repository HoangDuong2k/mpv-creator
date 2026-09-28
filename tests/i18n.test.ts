import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { LAYER_LABELS, RESOLUTION_PRESETS, createDefaultProject } from '../src/shared/defaults'
import { FILTER_PRESETS } from '../src/shared/filterPresets'
import { EN } from '../src/shared/i18n-en'
import { setLang, tr } from '../src/shared/i18n'
import { FIELDS } from '../src/renderer/src/fields'

const SRC = join(__dirname, '..', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

/** Mọi câu được dịch: tham số chuỗi của tr('…') trong code + dữ liệu hiển thị qua tr() */
export function translationKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  const add = (k: string, where: string): void => {
    if (k && !keys.has(k)) keys.set(k, where)
  }
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\btr(?:Key)?\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'), file.slice(SRC.length + 1))
  }
  for (const label of Object.values(LAYER_LABELS)) add(label, 'LAYER_LABELS')
  for (const p of RESOLUTION_PRESETS) add(p.label, 'RESOLUTION_PRESETS')
  for (const p of FILTER_PRESETS) add(p.name, 'FILTER_PRESETS')
  const project = createDefaultProject()
  add(project.name, 'createDefaultProject')
  for (const l of project.layers) add(l.name, 'createDefaultProject')
  for (const fields of Object.values(FIELDS))
    for (const f of fields) {
      add(f.label, 'FIELDS')
      if ('options' in f) for (const [, label] of f.options) add(label, 'FIELDS')
      if ('unit' in f && f.unit) add(f.unit, 'FIELDS')
      if ('hint' in f && f.hint) add(f.hint, 'FIELDS')
      if ('placeholder' in f && f.placeholder) add(f.placeholder, 'FIELDS')
    }
  return keys
}

const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('giao diện tiếng Anh', () => {
  const keys = translationKeys()

  it('mọi câu tiếng Việt trên giao diện đều có bản tiếng Anh', () => {
    const missing = [...keys].filter(([k]) => VN.test(k) && !EN[k]).map(([k, where]) => `${where}: ${k}`)
    expect(missing, `Thiếu bản dịch:\n${missing.join('\n')}`).toEqual([])
  })

  it('bản dịch giữ đúng các biến {…} và không còn chữ tiếng Việt', () => {
    // Chữ tiếng Việt chỉ được giữ khi cố ý (có sẵn trong câu gốc, vd. chữ ĐĂNG KÝ trên nút)
    const leftoverVi = (vi: string, en: string): boolean => en.split(/[\s/()]+/).some((w) => VN.test(w) && !vi.includes(w))
    const bad = Object.entries(EN).filter(([vi, en]) => placeholders(vi).join() !== placeholders(en).join() || leftoverVi(vi, en))
    expect(bad).toEqual([])
  })

  it('không có bản dịch thừa (câu đã bỏ khỏi code)', () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k))
    expect(unused).toEqual([])
  })

  it('tr() đổi theo ngôn ngữ và thay biến', () => {
    setLang('en')
    expect(tr('{n} bài', { n: 3 })).toBe(EN['{n} bài'].replace('{n}', '3'))
    expect(tr('Câu chưa có trong từ điển')).toBe('Câu chưa có trong từ điển')
    setLang('vi')
    expect(tr('{n} bài', { n: 3 })).toBe('3 bài')
  })
})
