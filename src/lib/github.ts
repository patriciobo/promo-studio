// Acceso a los repositorios de las apps por la API de GitHub (token fine-grained).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getSecret } from './settings'

const API = 'https://api.github.com'

async function gh(path: string, init: RequestInit = {}) {
  const token = await getSecret('GITHUB_TOKEN')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GithubError(res.status, `${init.method ?? 'GET'} ${path}: ${res.status} ${msg.message ?? ''}`.trim())
  }
  return res.status === 204 ? null : res.json()
}

export class GithubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Repos locales ("file:/ruta/al/repo"): para desarrollar y probar sin GitHub.
const local = (repo: string) => (repo.startsWith('file:') ? repo.slice(5) : null)

/** "https://github.com/owner/name(.git)" o "owner/name" → "owner/name". "file:/ruta" queda igual. */
export function normalizeRepo(input: string): string {
  if (input.trim().startsWith('file:')) return input.trim()
  const m = input.trim().match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  if (!m) throw new Error(`Repositorio no reconocido: ${input}`)
  return `${m[1]}/${m[2]}`
}

export async function getFile(repo: string, path: string, ref?: string): Promise<{ text: string; sha: string } | null> {
  const dir = local(repo)
  if (dir) return existsSync(join(dir, path)) ? { text: readFileSync(join(dir, path), 'utf8'), sha: 'local' } : null
  try {
    const r = (await gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}${ref ? `?ref=${ref}` : ''}`)) as { content: string; sha: string; encoding: string }
    return { text: Buffer.from(r.content, 'base64').toString('utf8'), sha: r.sha }
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return null
    throw e
  }
}

export async function getRawBytes(repo: string, path: string, ref?: string): Promise<Buffer | null> {
  const dir = local(repo)
  if (dir) return existsSync(join(dir, path)) ? readFileSync(join(dir, path)) : null
  try {
    const r = (await gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}${ref ? `?ref=${ref}` : ''}`)) as { content?: string; download_url?: string }
    if (r.content) return Buffer.from(r.content, 'base64')
    if (r.download_url) return Buffer.from(await (await fetch(r.download_url)).arrayBuffer())
    return null
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return null
    throw e
  }
}

export async function getRepo(repo: string) {
  if (local(repo)) return { default_branch: 'local', description: null, homepage: null, topics: [], full_name: repo }
  return (await gh(`/repos/${repo}`)) as { default_branch: string; description: string | null; homepage: string | null; topics?: string[]; full_name: string }
}

export async function listTree(repo: string, ref: string): Promise<string[]> {
  const dir = local(repo)
  if (dir) {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        if (['node_modules', '.git', 'dist'].includes(f)) return []
        const p = join(d, f)
        return statSync(p).isDirectory() ? walk(p) : [relative(dir, p)]
      })
    return walk(dir)
  }
  const r = (await gh(`/repos/${repo}/git/trees/${ref}?recursive=1`)) as { tree: { path: string; type: string }[] }
  return r.tree.filter((t) => t.type === 'blob').map((t) => t.path)
}

/** Archivos bajo `prefix` con su sha (cambia cuando cambia el contenido). Repo local: sha256 del archivo. */
export async function treeShas(repo: string, ref: string, prefix: string): Promise<Map<string, string>> {
  const dir = local(repo)
  if (dir) {
    const paths = existsSync(join(dir, prefix)) ? (await listTree(repo, ref)).filter((p) => p.startsWith(prefix)) : []
    return new Map(paths.map((p) => [p, createHash('sha256').update(readFileSync(join(dir, p))).digest('hex')]))
  }
  const r = (await gh(`/repos/${repo}/git/trees/${ref}?recursive=1`)) as { tree: { path: string; type: string; sha: string }[] }
  return new Map(r.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix)).map((t) => [t.path, t.sha]))
}

export async function latestReleases(repo: string, n = 3) {
  if (local(repo)) return []
  try {
    return ((await gh(`/repos/${repo}/releases?per_page=${n}`)) as { name: string; tag_name: string; body: string; published_at: string }[]).map((r) => ({
      name: r.name || r.tag_name,
      body: (r.body ?? '').slice(0, 1500),
      date: r.published_at,
    }))
  } catch {
    return []
  }
}

/** Crea una rama con los archivos y abre un PR. Devuelve la URL del PR. */
export async function openPullRequest(repo: string, base: string, branch: string, files: { path: string; content: Buffer | string }[], title: string, body: string) {
  if (local(repo)) throw new Error('Los repos locales no admiten pull requests: descargá el archivo.')
  const ref = (await gh(`/repos/${repo}/git/ref/heads/${base}`)) as { object: { sha: string } }
  const baseCommit = (await gh(`/repos/${repo}/git/commits/${ref.object.sha}`)) as { tree: { sha: string } }
  const tree = await Promise.all(
    files.map(async (f) => {
      const blob = (await gh(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: Buffer.from(f.content).toString('base64'), encoding: 'base64' }),
      })) as { sha: string }
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha }
    }),
  )
  const newTree = (await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) })) as { sha: string }
  const commit = (await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: title, tree: newTree.sha, parents: [ref.object.sha] }) })) as { sha: string }
  await gh(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) })
  const pr = (await gh(`/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ title, body, head: branch, base }) })) as { html_url: string }
  return pr.html_url
}
