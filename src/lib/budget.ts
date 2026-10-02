// Control de gasto en OpenRouter: tope mensual por app y tope global.
import { db } from './db'
import { env } from './env'

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

export async function spentThisMonth(appId?: string) {
  const r = await db.usageLedger.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart() }, ...(appId ? { appId } : {}) } })
  return r._sum.costUsd ?? 0
}

export class BudgetExceeded extends Error {}

/** Lanza BudgetExceeded si gastar `estimate` más pasaría algún tope. */
export async function assertBudget(appId: string | null, estimate = 0) {
  const global = await spentThisMonth()
  if (global + estimate > env.globalBudgetUsd) throw new BudgetExceeded(`Tope global alcanzado: US$ ${global.toFixed(2)} de ${env.globalBudgetUsd}`)
  if (!appId) return
  const app = await db.app.findUniqueOrThrow({ where: { id: appId }, select: { monthlyBudgetUsd: true, name: true } })
  const spent = await spentThisMonth(appId)
  if (spent + estimate > app.monthlyBudgetUsd) throw new BudgetExceeded(`${app.name}: tope mensual alcanzado (US$ ${spent.toFixed(2)} de ${app.monthlyBudgetUsd})`)
}
