import type { Asset, Post } from '@prisma/client'
import { mediaSrc } from '@/lib/media'
import { Gallery } from './Gallery'
import { fmtDate, postCost, STATUS, TYPE, usdSmall } from '@/lib/view'

export function PostThumbs({ post }: { post: Post & { assets: Asset[] } }) {
  const video = post.assets.find((a) => a.kind === 'VIDEO')
  const slides = post.assets.filter((a) => a.kind === 'SLIDE').sort((a, b) => a.position - b.position)
  const vertical = post.type === 'REEL' || post.type === 'STORY'
  if (!video && !slides.length) return <div className="notice small">{post.status === 'DRAFT' ? 'Generando…' : 'Todavía no se renderizó.'}</div>
  // Reel: la miniatura es la portada; al tocarla se abre el reproductor en grande.
  const items = video ? [{ src: mediaSrc(video.path), video: true, poster: slides[0] ? mediaSrc(slides[0].path) : undefined }] : slides.map((s) => ({ src: mediaSrc(s.path) }))
  return <Gallery items={items} vertical={vertical} />
}

/** `showCost`: sólo donde `post.assets` trae todos los assets (si no, el costo saldría incompleto). */
export function PostMeta({ post, tz, showCost = true }: { post: Post & { assets?: Asset[] }; tz: string; showCost?: boolean }) {
  const s = STATUS[post.status]
  const cost = showCost && post.assets ? postCost({ textCostUsd: post.textCostUsd, assets: post.assets }) : null
  return (
    <div className="post-meta">
      <span className={`badge ${s.tone}`}>{s.label}</span>
      <span>{TYPE[post.type]}</span>
      {post.pillar && <span>· {post.pillar}</span>}
      <span>· {fmtDate(post.publishedAt ?? post.scheduledAt, tz)}</span>
      {cost && (cost.total > 0 || post.textCostUsd !== null) && (
        <span className="badge" title={`Texto ${usdSmall(cost.text)} · ${cost.images} ilustraciones ${usdSmall(cost.image)}`}>
          {usdSmall(cost.total)}
        </span>
      )}
      {post.permalink && (
        <a className="small" href={post.permalink} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
          Ver en Instagram ↗
        </a>
      )}
    </div>
  )
}
