// 极简本地存储：把工作台状态存成一个 JSON 文件。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export function defaultDataDir(env = process.env) {
  // 优先用 DSH_HOME，否则回落到用户目录下的 .dsh
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'we-media-desk')
}

export function emptyState() {
  return {
    version: 1,
    ideas: [],       // 灵感
    contents: [],    // 内容（成稿）
    schedule: [],    // 排期
    styles: [],      // 风格
  }
}

export class Store {
  constructor(dir = defaultDataDir()) {
    this.dir = dir
    this.file = join(dir, 'state.json')
  }

  async read() {
    try {
      const raw = await readFile(this.file, 'utf8')
      return { ...emptyState(), ...JSON.parse(raw) }
    } catch (err) {
      if (err.code === 'ENOENT') return emptyState()
      throw err
    }
  }

  async write(state) {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify(state, null, 2), 'utf8')
    return state
  }

  async update(mutator) {
    const state = await this.read()
    const next = (await mutator(state)) || state
    return this.write(next)
  }
}
