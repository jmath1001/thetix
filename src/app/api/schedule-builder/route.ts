import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { studentsToSchedule, availableSeats, weekStart, weekEnd, studentExistingBookings } = await req.json()

  if (!studentsToSchedule?.length || !availableSeats?.length) {
    return NextResponse.json({ assignments: [] })
  }

  const existingBookingsByStudent: Record<string, Set<string>> = {}
  ;(studentExistingBookings ?? []).forEach((entry: any) => {
    if (!entry?.studentId || !Array.isArray(entry.existingSlots)) return
    existingBookingsByStudent[entry.studentId] = new Set(entry.existingSlots)
  })

  // ── Server-side capacity tracking ────────────────────────────────────────
  // This is the source of truth — GPT just picks subjects, we enforce capacity
  const capacityMap: Record<number, number> = {}
  availableSeats.forEach((s: any) => { capacityMap[s.index] = s.seatsLeft })
  const assigned: Record<number, number> = {}

  const getRemainingCapacity = (index: number) =>
    (capacityMap[index] ?? 0) - (assigned[index] ?? 0)

  const claimSlot = (index: number) => {
    assigned[index] = (assigned[index] ?? 0) + 1
  }

  // ── Subject matching — done in JS, not by GPT ────────────────────────────
  function subjectMatches(subject: string, tutorSubjects: string[]): boolean {
    if (!subject) return false
    const s = subject.toLowerCase().trim()
    return tutorSubjects.some(ts => {
      const t = ts.toLowerCase().trim()
      return t === s || t.includes(s) || s.includes(t)
    })
  }

  function studentAvailable(availabilityBlocks: string[], dayNum: number, time: string): boolean {
    if (!availabilityBlocks || availabilityBlocks.length === 0) return true
    return availabilityBlocks.includes(`${dayNum}-${time}`)
  }

  // ── Ask GPT only for subject preference ranking ───────────────────────────
  // GPT picks the best slot INDEX per student — we verify capacity
  const systemPrompt = `
You are a scheduling engine for a tutoring center.
Week: ${weekStart ?? 'this week'} to ${weekEnd ?? 'end of week'}.

For each student, pick the best slot index from the available seats.

Rules:
1. Tutor subjects must match student subject
2. Prefer slots matching student availabilityBlocks (format: "dayNum-HH:MM", dayNum: 1=Mon 2=Tue 3=Wed 4=Thu 6=Sat)
3. If availabilityBlocks is empty, any slot works
4. Do not assign a student to any slot that conflicts with an existing booking on the same date and time
5. Prefer a balanced distribution across the week and avoid scheduling everyone on Monday
6. Prefer partially filled slots (lower seatsLeft means more students already there)

Subject matching:
- Algebra/Geometry/Precalculus/Calculus/Statistics/SAT Math/ACT Math/Physics/Chemistry/Biology → math tutors
- English/Writing/Literature/History/ACT English/SAT Reading → english tutors
- Match exact subject name to tutor subjects array first, then by category

Return ONLY valid JSON, no markdown:
{
  "assignments": [
    { "studentId": "<id>", "slotIndex": <number or null>, "reason": "<one sentence>" }
  ]
}
`

  const userMessage = `
Students (${studentsToSchedule.length}):
${JSON.stringify(studentsToSchedule.map((s: any) => ({
  id: s.id,
  name: s.name,
  subject: s.subject,
  availabilityBlocks: s.availabilityBlocks ?? [],
})), null, 2)}

Available slots (${availableSeats.length}):
${JSON.stringify(availableSeats.map((s: any) => ({
  index: s.index,
  tutorName: s.tutorName,
  tutorSubjects: s.tutorSubjects,
  day: s.day,
  date: s.date,
  time: s.time,
  seatsLeft: s.seatsLeft,
  label: s.label,
})), null, 2)}

Return JSON only.
`

  let gptAssignments: { studentId: string; slotIndex: number | null; reason: string }[] = []

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    })

    const text = response.choices[0].message.content?.trim() ?? ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    gptAssignments = parsed.assignments ?? []
  } catch (err) {
    console.error('GPT call failed or returned invalid JSON:', err)
    // Fall through — server-side fallback below will handle all students
  }

  // ── Server-side validation + capacity enforcement ─────────────────────────
  const finalAssignments = studentsToSchedule.map((student: any) => {
    const gpt = gptAssignments.find((a: any) => a.studentId === student.id)

    // Try GPT's pick first
    if (gpt && gpt.slotIndex != null) {
      const seat = availableSeats.find((s: any) => s.index === gpt.slotIndex)
      if (
        seat &&
        subjectMatches(student.subject, seat.tutorSubjects) &&
        getRemainingCapacity(gpt.slotIndex) > 0 &&
        !(existingBookingsByStudent[student.id]?.has(`${seat.date}-${seat.time}`))
      ) {
        claimSlot(gpt.slotIndex)
        const hasAvail = studentAvailable(student.availabilityBlocks, seat.dayNum, seat.time)
        return { studentId: student.id, slotIndex: gpt.slotIndex, status: hasAvail ? 'matched' : 'fallback', reason: gpt.reason ?? (hasAvail ? 'Subject and availability match' : 'Subject match — availability not ideal') }
      }
    }

    // GPT's pick was invalid or over capacity — find next best server-side
    const dayPriority: Record<number, number> = { 1: 2, 2: 1, 3: 0, 4: 1, 6: 2 }

    const candidates = availableSeats
      .filter((s: any) =>
        subjectMatches(student.subject, s.tutorSubjects) &&
        getRemainingCapacity(s.index) > 0 &&
        !(existingBookingsByStudent[student.id]?.has(`${s.date}-${s.time}`))
      )
      .map((s: any) => ({
        ...s,
        hasAvail: studentAvailable(student.availabilityBlocks, s.dayNum, s.time),
        remaining: getRemainingCapacity(s.index),
      }))
      .sort((a: any, b: any) => {
        // Prefer availability match
        if (a.hasAvail !== b.hasAvail) return a.hasAvail ? -1 : 1
        // Prefer partially filled
        const fillA = (capacityMap[a.index] ?? 0) - a.remaining
        const fillB = (capacityMap[b.index] ?? 0) - b.remaining
        if (fillB !== fillA) return fillB - fillA
        // Prefer mid-week consistency rather than always Monday
        if ((dayPriority[a.dayNum] ?? 0) !== (dayPriority[b.dayNum] ?? 0)) {
          return (dayPriority[a.dayNum] ?? 0) - (dayPriority[b.dayNum] ?? 0)
        }
        // Prefer more even distribution by date/time after balance
        return (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? '')
      })

    if (candidates.length > 0) {
      const best = candidates[0]
      claimSlot(best.index)
      return {
        studentId: student.id,
        slotIndex: best.index,
        status: best.hasAvail ? 'matched' : 'fallback',
        reason: gpt ? 'GPT slot was full — reassigned to next best' : (best.hasAvail ? 'Subject and availability match' : 'Subject match — availability not considered'),
      }
    }

    return { studentId: student.id, slotIndex: null, status: 'unmatched', reason: `No ${student.subject} tutor available with capacity this week` }
  })

  return NextResponse.json({ assignments: finalAssignments })
}