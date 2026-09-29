// Mẫu phong cách người dùng tự lưu: mỗi mẫu một file JSON trong thư mục dữ liệu của app
// (không mất khi xoá cache, dùng được cho mọi project).
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { createDefaultProject, normalizeProject } from '../shared/defaults'
import { isTemplateId, type StyleTemplate } from '../shared/templates'

/** Giới hạn số mẫu đọc ra (tránh thư mục bị chép nhầm hàng nghìn file) */
const MAX_TEMPLATES = 200

export class TemplateStore {
  constructor(readonly dir: string) {}

  private file(id: string): string {
    if (!isTemplateId(id)) throw new Error(`Invalid template id: ${String(id)}`)
    return join(this.dir, `${id}.json`)
  }

  /** Các mẫu đã lưu, mới nhất trước; bỏ qua file hỏng */
  async list(): Promise<StyleTemplate[]> {
    if (!existsSync(this.dir)) return []
    const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json')).slice(0, MAX_TEMPLATES)
    const out: StyleTemplate[] = []
    for (const name of names) {
      try {
        const t = parseTemplate(JSON.parse(await readFile(join(this.dir, name), 'utf8')))
        if (t && `${t.id}.json` === name) out.push(t)
      } catch {
        // file hỏng / không phải mẫu: bỏ qua
      }
    }
    return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  }

  async save(template: StyleTemplate): Promise<void> {
    const t = parseTemplate(template)
    if (!t) throw new Error('Invalid template')
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(t.id), JSON.stringify(t, null, 2), 'utf8')
  }

  async remove(id: string): Promise<void> {
    await rm(this.file(id), { force: true })
  }
}

/** Kiểm tra và chuẩn hoá dữ liệu mẫu (thêm thuộc tính mới của các lớp như khi mở project cũ) */
export function parseTemplate(v: unknown): StyleTemplate | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<StyleTemplate>
  if (!isTemplateId(o.id) || typeof o.name !== 'string' || !o.name.trim() || !Array.isArray(o.layers)) return null
  const layers = normalizeProject({ ...createDefaultProject(), layers: o.layers }).layers
  if (layers.length === 0) return null
  return {
    id: o.id,
    name: o.name.trim().slice(0, 80),
    description: typeof o.description === 'string' ? o.description.slice(0, 200) : '',
    custom: true,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
    layers
  }
}
