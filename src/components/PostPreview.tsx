import type { Asset, Post } from '@prisma/client'
import { mediaUrl } from '@/lib/media'
import { fmtDate, STATUS, TYPE } from '@/lib/view'

export function PostThumbs({ post }: { post: Post & { assets: Asset[] } }) {
  const video = post.assets.find((a) => a.kind === 'VIDEO')
  const slides = post.assets.filter((a) => a.kind === 'SLIDE').sort((a, b) => a.position - b.position)
  const vertical = post.type === 'REEL' || post.type === 'STORY'
  if (!video && !slides.length) return <div className="notice small">Todavía no se renderizó.</div>
  return (
    <div className={`thumbs${vertical ? ' vertical' : ''}`}>
      {video ? (
        <video src={mediaUrl(video.path)} poster={slides[0] ? mediaUrl(slides[0].path) : undefined} controls muted playsInline preload="none" />
      ) : (
        slides.map((s) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.id} src={mediaUrl(s.path)} alt="" loading="lazy" />
        ))
      )}
    </div>
  )
}

export function PostMeta({ post, tz }: { post: Post; tz: string }) {
  const s = STATUS[post.status]
  return (
    <div className="post-meta">
      <span className={`badge ${s.tone}`}>{s.label}</span>
      <span>{TYPE[post.type]}</span>
      {post.pillar && <span>· {post.pillar}</span>}
      <span>· {fmtDate(post.publishedAt ?? post.scheduledAt, tz)}</span>
      {post.permalink && (
        <a className="small" href={post.permalink} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
          Ver en Instagram ↗
        </a>
      )}
    </div>
  )
}
