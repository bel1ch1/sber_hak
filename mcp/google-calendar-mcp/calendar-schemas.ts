// yandex-calendar-schemas.ts
import { z } from "zod"

const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
const ISO_NAIVE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const SUPPORTED_TZIDS = new Set(["Europe/Moscow"])

const IsoString = z.string().refine(
  (v) => ISO_ZONED.test(v) || ISO_NAIVE.test(v),
  { message: "Must be ISO 8601 date-time (YYYY-MM-DDTHH:mm:ss with optional offset)" },
)

function refineTimePair(
  ctx: z.RefinementCtx,
  startField: string,
  endField: string,
  startValue: string,
  endValue: string,
  timezone: string | undefined,
) {
  const startZoned = ISO_ZONED.test(startValue)
  const endZoned = ISO_ZONED.test(endValue)
  if (startZoned !== endZoned) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${startField} and ${endField} must both be zoned ISO or both naive ISO (mixed forms not allowed)`,
    })
    return
  }
  if (!startZoned) {
    if (!timezone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "naive ISO requires an explicit timezone field" })
      return
    }
    if (!SUPPORTED_TZIDS.has(timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `timezone "${timezone}" not supported in v1; only "Europe/Moscow" works for naive ISO. For other zones use zoned ISO (e.g. ${startValue}+03:00).`,
      })
      return
    }
  }
  const startCmp = startZoned ? startValue : startValue + "+03:00"
  const endCmp = endZoned ? endValue : endValue + "+03:00"
  if (Date.parse(endCmp) <= Date.parse(startCmp)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${endField} must be strictly greater than ${startField}`,
    })
  }
}

export const TimeRangeInput = z
  .object({
    start: IsoString,
    end: IsoString,
    timezone: z.string().optional(),
  })
  .superRefine((v, ctx) => refineTimePair(ctx, "start", "end", v.start, v.end, v.timezone))

/**
 * Variant used by list_events / check_availability where the inputs are
 * named `from` / `to` (semantically a range query, not a single event).
 */
export const FromToRangeInput = z
  .object({
    from: IsoString,
    to: IsoString,
    timezone: z.string().optional(),
  })
  .superRefine((v, ctx) => refineTimePair(ctx, "from", "to", v.from, v.to, v.timezone))

export type TimeRangeInputT = z.infer<typeof TimeRangeInput>
export type FromToRangeInputT = z.infer<typeof FromToRangeInput>
