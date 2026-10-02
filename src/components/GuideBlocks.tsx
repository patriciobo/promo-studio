import { ERRORS, type GuideStep } from '@/lib/guide'

export function StepsList({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="steps">
      {steps.map((s) => (
        <li key={s.id}>
          <strong>
            {s.id} · {s.title}
          </strong>
          <ul>
            {s.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export function ErrorsTable() {
  return (
    <table>
      <thead>
        <tr>
          <th>Síntoma o código</th>
          <th>Causa probable</th>
          <th>Arreglo</th>
        </tr>
      </thead>
      <tbody>
        {ERRORS.map(([a, b, c]) => (
          <tr key={a}>
            <td>
              <strong className="small">{a}</strong>
            </td>
            <td className="small">{b}</td>
            <td className="small">{c}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
