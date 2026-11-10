import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Store, emptyState } from '../src/store.js'

test('Store 空目录读出空状态', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wk-store-'))
  try {
    const store = new Store(dir)
    assert.deepEqual(await store.read(), emptyState())
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Store 写入后可读回，且 update 能改字段', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wk-store-'))
  try {
    const store = new Store(dir)
    await store.write({ ...emptyState(), ideas: [{ id: '1', text: 'hi' }] })
    assert.equal((await store.read()).ideas[0].text, 'hi')
    await store.update(s => { s.contents.push({ id: 'c1' }) })
    assert.equal((await store.read()).contents.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Store 并发 update 串行执行，不丢写入', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wk-store-'))
  try {
    const store = new Store(dir)
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      store.update(s => { s.ideas.push({ id: String(i) }) })))
    assert.equal((await store.read()).ideas.length, 20)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
