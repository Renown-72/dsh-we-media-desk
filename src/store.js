// 极简本地存储：把工作台状态存成一个 JSON 文件。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const DATA_DIR_NAME = 'we-media-desk'

export function defaultDataDir(env = process.env) {
  // 优先用 DSH_HOME，否则回落到用户目录下的 .dsh
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, DATA_DIR_NAME)
}

export function emptyState() {
  return {
    version: 1,
    ideas: [],       // 灵感
    scripts: [],     // 脚本
    contents: [],    // 内容（成稿）
    schedule: [],    // 排期
    styles: [],      // 风格
  }
}

export class Store {
  constructor(dir = defaultDataDir()) {
    this.dir = dir
    this.file = join(dir, 'state.json')
    this.queue = Promise.resolve() // 串行化写操作，避免并发请求互相覆盖
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

  // 先写临时文件再改名，写到一半崩溃也不会留下损坏的 state.json。
  async #writeNow(state) {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, this.file)
    return state
  }

  #enqueue(task) {
    const run = this.queue.then(task)
    this.queue = run.catch(() => {})
    return run
  }

  write(state) {
    return this.#enqueue(() => this.#writeNow(state))
  }

  update(mutator) {
    return this.#enqueue(async () => {
      const state = await this.read()
      const next = (await mutator(state)) || state
      return this.#writeNow(next)
    })
  }
}
