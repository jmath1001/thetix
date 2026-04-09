'use client'
import { useState, useCallback, useMemo } from 'react'
import { X, Sparkles, Loader2, Check, AlertTriangle, ChevronDown, RotateCcw, Calendar, User, Clock, ArrowRight, Plus, Trash2 } from 'lucide-react'
import type { Student, Tutor } from '@/lib/useScheduleData'
import { SchedulePreviewGrid } from '@/components/SchedulePreviewGrid'
import { SESSION_BLOCKS } from '@/components/constants'

interface AvailableSeat {
  tutor: { id: string; name: string; subjects: string[]; cat: string }
  dayName: string
  date: string
  time: string
  seatsLeft: number
  block?: { label: string; display: string }
  dayNum: number
}

// One subject need per student — a student with 2 subjects = 2 needs
interface StudentNeed {
  student: Student
  subject: string
  needId: string  // local unique key: studentId + index
  allowSameDayDouble: boolean
}

type ProposalStatus = 'matched' | 'fallback' | 'unmatched'

interface Proposal {
  needId: string
  student: Student
  subject: string
  slot: AvailableSeat | null
  status: ProposalStatus
  reason: string
}

interface ScheduleBuilderProps {
  students: Student[]
  tutors: Tutor[]
  sessions: any[]
  allAvailableSeats: AvailableSeat[]
  weekStart: string
  weekEnd: string
  onConfirm: (bookings: { student: Student; slot: AvailableSeat; topic: string }[]) => Promise<void>
  onClose: () => void
}

const ALL_SUBJECTS = [
  'Algebra', 'Geometry', 'Precalculus', 'Calculus', 'Statistics',
  'SAT Math', 'ACT Math', 'Physics', 'Chemistry', 'Biology', 'ACT Science',
  'English/Writing', 'Literature', 'History', 'ACT English', 'SAT Reading',
]

const AVAILABILITY_DAYS = [
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 6, label: 'Sat' },
]

function subjectMatchesTutor(subject: string, tutor: { subjects: string[] }): boolean {
  if (!subject) return false
  const s = subject.toLowerCase().trim()
  return tutor.subjects.some(ts => {
    const t = ts.toLowerCase().trim()
    return t === s || t.includes(s) || s.includes(t)
  })
}

function bookingConflict(
  studentId: string,
  slot: AvailableSeat,
  bookedSlots: Record<string, Set<string>>
): boolean {
  return bookedSlots[studentId]?.has(`${slot.date}-${slot.time}`) ?? false
}

// Client-side fallback — mirrors engine logic, with improved gap-filling
function clientSideMatch(
  needs: StudentNeed[],
  allAvailableSeats: AvailableSeat[],
  existingBooked: Record<string, Set<string>>
): Proposal[] {
  const assignedCounts: Record<number, number> = {}
  const studentDaysThisRun: Record<string, Set<number>> = {}
  const studentSlotsThisRun: Record<string, Set<string>> = {}
  // Track consecutive times per day per student (for adjacency bonus)
  const studentTimesPerDay: Record<string, Record<number, string[]>> = {}

  const getRem = (i: number, seat: AvailableSeat) =>
    seat.seatsLeft - (assignedCounts[i] ?? 0)

  return needs.map(need => {
    const daysBooked = studentDaysThisRun[need.student.id] ?? new Set<number>()
    const slotsBooked = studentSlotsThisRun[need.student.id] ?? new Set<string>()
    const existing = existingBooked[need.student.id] ?? new Set<string>()

    const baseCandidates = allAvailableSeats
      .map((s, i) => ({ seat: s, index: i }))
      .filter(({ seat, index }) =>
        subjectMatchesTutor(need.subject, seat.tutor) &&
        getRem(index, seat) > 0 &&
        !existing.has(`${seat.date}-${seat.time}`) &&
        !slotsBooked.has(`${seat.date}-${seat.time}`)
      )

    const candidates = baseCandidates.filter(({ seat }) => {
      if (!need.student.availabilityBlocks?.length) return true
      return need.student.availabilityBlocks.includes(`${seat.dayNum}-${seat.time}`)
    })

    if (candidates.length === 0) {
      const hasAvailability = (need.student.availabilityBlocks?.length ?? 0) > 0
      const reason = hasAvailability && baseCandidates.length > 0
        ? `No ${need.subject} slot matches student availability this week`
        : `No ${need.subject} tutor available with capacity this week`
      return { needId: need.needId, student: need.student, subject: need.subject, slot: null, status: 'unmatched' as ProposalStatus, reason }
    }

    const scored = candidates
      .map(({ seat, index }) => {
        let score = 0
        const filled = seat.seatsLeft - getRem(index, seat)
        score += filled * 5
        
        if (!daysBooked.has(seat.dayNum)) score += 8
        else score -= 15
        
        const dayBalance: Record<number, number> = { 1: 0, 2: 3, 3: 4, 4: 3, 6: 1 }
        score += dayBalance[seat.dayNum] ?? 0

        // Adjacency bonus: if student already has a time on this day, prefer adjacent session times
        const dayKey = `${need.student.id}-${seat.date}`
        if (!studentTimesPerDay[dayKey]) studentTimesPerDay[dayKey] = {}
        if (!studentTimesPerDay[dayKey][seat.dayNum]) studentTimesPerDay[dayKey][seat.dayNum] = []
        const timesOnDay = studentTimesPerDay[dayKey][seat.dayNum]
        if (timesOnDay.length > 0) {
          // Prefer consecutive session times (less gaps)
          const sessionOrder = ['11:00', '13:30', '15:30', '17:30', '19:30']
          const currIdx = sessionOrder.indexOf(seat.time)
          const lastIdx = sessionOrder.indexOf(timesOnDay[timesOnDay.length - 1])
          if (currIdx > 0 && lastIdx >= 0 && Math.abs(currIdx - lastIdx) === 1) {
            score += 12 // Consecutive time bonus
          } else if (currIdx > 0 && lastIdx >= 0) {
            score -= (Math.abs(currIdx - lastIdx) - 1) * 3 // Gap penalty
          }
        }

        return { seat, index, score }
      })
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    assignedCounts[best.index] = (assignedCounts[best.index] ?? 0) + 1

    if (!studentDaysThisRun[need.student.id]) studentDaysThisRun[need.student.id] = new Set()
    studentDaysThisRun[need.student.id].add(best.seat.dayNum)

    if (!studentSlotsThisRun[need.student.id]) studentSlotsThisRun[need.student.id] = new Set()
    studentSlotsThisRun[need.student.id].add(`${best.seat.date}-${best.seat.time}`)

    // Track time for adjacency
    const dayKey = `${need.student.id}-${best.seat.date}`
    if (!studentTimesPerDay[dayKey]) studentTimesPerDay[dayKey] = {}
    if (!studentTimesPerDay[dayKey][best.seat.dayNum]) studentTimesPerDay[dayKey][best.seat.dayNum] = []
    studentTimesPerDay[dayKey][best.seat.dayNum].push(best.seat.time)

    return {
      needId: need.needId,
      student: need.student,
      subject: need.subject,
      slot: best.seat,
      status: 'matched' as ProposalStatus,
      reason: 'Subject and availability match',
    }
  })
}

export function ScheduleBuilder({
  students, tutors, sessions, allAvailableSeats, weekStart, weekEnd, onConfirm, onClose
}: ScheduleBuilderProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select')
  // Map of studentId → list of subjects needed (with local needId)
  const [studentNeeds, setStudentNeeds] = useState<Record<string, { subject: string; needId: string; allowSameDayDouble: boolean }[]>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [search, setSearch] = useState('')
  const [studentAvailability, setStudentAvailability] = useState<Record<string, string[]>>({})
  const [availabilityOpenFor, setAvailabilityOpenFor] = useState<string | null>(null)
  const [savingAvailability, setSavingAvailability] = useState<Set<string>>(new Set())

  // Existing bookings this week by student
  const bookedSlotsByStudent = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    sessions.forEach(s =>
      s.students?.forEach((st: any) => {
        if (st.status === 'cancelled' || !st.id) return
        map[st.id] = map[st.id] ?? new Set()
        map[st.id].add(`${s.date}-${s.time}`)
      })
    )
    return map
  }, [sessions])

  const bookedStudentIds = useMemo(() => {
    const ids = new Set<string>()
    sessions.forEach(s =>
      s.students?.forEach((st: any) => {
        if (st.status !== 'cancelled' && st.id) ids.add(st.id)
      })
    )
    return ids
  }, [sessions])

  const filteredStudents = useMemo(() =>
    students.filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
    [students, search]
  )

  const toggleStudent = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setStudentNeeds(sn => { const n = { ...sn }; delete n[id]; return n })
        setStudentAvailability(sa => { const n = { ...sa }; delete n[id]; return n })
        if (availabilityOpenFor === id) setAvailabilityOpenFor(null)
      } else {
        next.add(id)
        const selectedStudent = students.find(s => s.id === id)
        // Init with one empty subject row
        setStudentNeeds(sn => ({
          ...sn,
          [id]: [{ subject: '', needId: `${id}-0`, allowSameDayDouble: false }]
        }))
        setStudentAvailability(sa => ({
          ...sa,
          [id]: [...(selectedStudent?.availabilityBlocks ?? [])],
        }))
      }
      return next
    })
  }, [students, availabilityOpenFor])

  const toggleAvailabilityBlock = useCallback((studentId: string, dow: number, time: string) => {
    const key = `${dow}-${time}`
    setStudentAvailability(prev => {
      const current = prev[studentId] ?? []
      const next = current.includes(key)
        ? current.filter(b => b !== key)
        : [...current, key]
      
      // Save to DB with loading state
      setSavingAvailability(s => new Set([...s, studentId]))
      ;(async () => {
        try {
          await fetch('/api/student-availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, availabilityBlocks: next })
          })
        } catch (err) {
          console.error('Failed to save availability:', err)
        } finally {
          setSavingAvailability(s => {
            const next = new Set(s)
            next.delete(studentId)
            return next
          })
        }
      })()
      
      return { ...prev, [studentId]: next }
    })
  }, [])

  const resetAvailability = useCallback((studentId: string) => {
    const s = students.find(st => st.id === studentId)
    const originalBlocks = [...(s?.availabilityBlocks ?? [])]
    
    setStudentAvailability(prev => ({
      ...prev,
      [studentId]: originalBlocks,
    }))

    // Save reset to DB with loading state
    setSavingAvailability(sa => new Set([...sa, studentId]))
    ;(async () => {
      try {
        await fetch('/api/student-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, availabilityBlocks: originalBlocks })
        })
      } catch (err) {
        console.error('Failed to save availability:', err)
      } finally {
        setSavingAvailability(sa => {
          const next = new Set(sa)
          next.delete(studentId)
          return next
        })
      }
    })()
  }, [students])

  const addSubjectRow = useCallback((studentId: string) => {
    setStudentNeeds(prev => {
      const existing = prev[studentId] ?? []
      if (existing.length >= 3) return prev
      return {
        ...prev,
        [studentId]: [...existing, {
          subject: '',
          needId: `${studentId}-${existing.length}`,
          allowSameDayDouble: false,
        }]
      }
    })
  }, [])

  const removeSubjectRow = useCallback((studentId: string, needId: string) => {
    setStudentNeeds(prev => {
      const filtered = (prev[studentId] ?? []).filter(n => n.needId !== needId)
      return { ...prev, [studentId]: filtered }
    })
  }, [])

  const setSubject = useCallback((studentId: string, needId: string, subject: string) => {
    setStudentNeeds(prev => ({
      ...prev,
      [studentId]: (prev[studentId] ?? []).map(n => n.needId === needId ? { ...n, subject } : n)
    }))
  }, [])

  // Build flat list of needs for the engine
  const allNeeds: StudentNeed[] = useMemo(() => {
    const out: StudentNeed[] = []
    for (const id of selectedIds) {
      const s = students.find(st => st.id === id)
      if (!s) continue
      const effectiveAvailability = studentAvailability[id] ?? s.availabilityBlocks ?? []
      for (const n of (studentNeeds[id] ?? [])) {
        if (n.subject) {
          out.push({
            student: { ...s, availabilityBlocks: effectiveAvailability },
            subject: n.subject,
            needId: n.needId,
            allowSameDayDouble: n.allowSameDayDouble,
          })
        }
      }
    }
    return out
  }, [selectedIds, studentNeeds, students, studentAvailability])

  const selectedCount = selectedIds.size
  const missingSubject = [...selectedIds].some(id =>
    (studentNeeds[id] ?? []).some(n => !n.subject) ||
    (studentNeeds[id] ?? []).length === 0
  )
  const canGenerate = selectedCount > 0 && !missingSubject && !generating

  const generate = useCallback(async () => {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const res = await fetch('/api/schedule-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needs: allNeeds.map(n => ({
            studentId: n.student.id,
            studentName: n.student.name,
            subject: n.subject,
            needId: n.needId,
            availabilityBlocks: n.student.availabilityBlocks ?? [],
            allowSameDayDouble: n.allowSameDayDouble,
          })),
          availableSeats: allAvailableSeats.map((s, i) => ({
            index: i,
            tutorId: s.tutor.id,
            tutorName: s.tutor.name,
            tutorSubjects: s.tutor.subjects,
            tutorCat: s.tutor.cat,
            day: s.dayName,
            dayNum: s.dayNum,
            date: s.date,
            time: s.time,
            seatsLeft: s.seatsLeft,
            label: s.block?.label,
          })),
          existingBookings: [...selectedIds].map(id => ({
            studentId: id,
            existingSlots: Array.from(bookedSlotsByStudent[id] ?? []),
          })),
          weekStart,
          weekEnd,
        }),
      })

      if (!res.ok) throw new Error('API error')
      const data = await res.json()

      const built: Proposal[] = allNeeds.map(need => {
        const a = data.assignments?.find((x: any) => x.studentId === need.student.id && x.subject === need.subject)
        if (!a || a.slotIndex == null) {
          return { needId: need.needId, student: need.student, subject: need.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: a?.reason ?? 'No valid slot found' }
        }
        const slot = allAvailableSeats[a.slotIndex]
        if (!slot) {
          return { needId: need.needId, student: need.student, subject: need.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: 'Slot index invalid' }
        }
        return { needId: need.needId, student: need.student, subject: need.subject, slot, status: a.status ?? 'matched', reason: a.reason ?? '' }
      })

      setProposals(built)
      setStep('preview')
    } catch {
      setProposals(clientSideMatch(allNeeds, allAvailableSeats, bookedSlotsByStudent))
      setStep('preview')
    } finally {
      setGenerating(false)
    }
  }, [canGenerate, allNeeds, allAvailableSeats, weekStart, weekEnd, selectedIds, bookedSlotsByStudent])

  const swapSlot = useCallback((needId: string, slotIndex: number) => {
    const slot = allAvailableSeats[slotIndex]
    if (!slot) return { success: false, reason: 'Slot not found' }

    const proposal = proposals.find(p => p.needId === needId)
    if (!proposal) return { success: false, reason: 'Proposal not found' }

    // Check if student is already booked at this time (existing or other proposals)
    const isBooked = (
      bookedSlotsByStudent[proposal.student.id]?.has(`${slot.date}-${slot.time}`) ?? false
    ) || (
      proposals.some(
        p => p.student.id === proposal.student.id && p.needId !== needId && p.slot &&
        p.slot.date === slot.date && p.slot.time === slot.time
      )
    )

    if (isBooked) {
      return { success: false, reason: 'Student already booked at this time' }
    }

    // Check if slot has remaining capacity
    const currentBookings = proposals.filter(
      p => p.slot && p.slot.date === slot.date && p.slot.time === slot.time && p.slot.tutor.id === slot.tutor.id
    ).length + (sessions ?? []).filter((s: any) => 
      s.date === slot.date && s.time === slot.time && s.tutorId === slot.tutor.id
    ).flatMap((s: any) => s.students ?? []).filter((st: any) => st.status !== 'cancelled').length

    if (currentBookings >= slot.seatsLeft) {
      return { success: false, reason: 'No capacity available' }
    }

    // Swap is valid
    setProposals(prev => prev.map(p => p.needId === needId ? { ...p, slot, status: 'matched', reason: 'Manually selected' } : p))
    return { success: true }
  }, [allAvailableSeats, proposals, bookedSlotsByStudent, sessions])

  const removeProposal = useCallback((needId: string) => {
    setProposals(prev => prev.filter(p => p.needId !== needId))
  }, [])

  const handleConfirm = async () => {
    const bookings = proposals.filter(p => p.slot).map(p => ({ student: p.student, slot: p.slot!, topic: p.subject }))
    if (!bookings.length) return
    setConfirming(true)
    try { await onConfirm(bookings) } finally { setConfirming(false) }
  }

  const placedCount    = proposals.filter(p => p.slot).length
  const unmatchedCount = proposals.filter(p => !p.slot).length

  const statusStyle = (s: ProposalStatus) =>
    s === 'matched'  ? { bg: '#f0fdf4', border: '#86efac', dot: '#16a34a', tag: '#dcfce7', tagText: '#166534', label: 'Matched' } :
    s === 'fallback' ? { bg: '#fffbeb', border: '#fde68a', dot: '#d97706', tag: '#fef3c7', tagText: '#92400e', label: 'Fallback' } :
                       { bg: '#fff1f2', border: '#fecdd3', dot: '#e11d48', tag: '#ffe4e6', tagText: '#9f1239', label: 'No slot' }

  const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1.5px solid #94a3b8', fontSize: 13, outline: 'none', background: 'white', color: '#0f172a' }
  const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1.5px solid #94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#0f172a' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {generating && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(248,250,252,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 28, background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 24px 80px rgba(15,23,42,0.12)', padding: '32px', color: '#0f172a' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#64748b', margin: 0 }}>Schedule builder</p>
                <h2 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 0', lineHeight: 1.05 }}>Generating schedule…</h2>
              </div>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.75 }}>Running constraint engine — matching subjects, checking capacity, spreading across days.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: '100%', background: '#8b5cf6', animation: `growBar 1.2s ease-in-out ${i * 120}ms infinite alternate` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <style>{`@keyframes growBar { from { transform: scaleX(0.3); } to { transform: scaleX(1); } }`}</style>
        </div>
      )}

      <div style={{ width: '95vw', maxWidth: 1200, maxHeight: '92vh', background: 'white', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #cbd5e1', boxShadow: '0 36px 90px rgba(2,6,23,0.28)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', border: '1px solid #c4b5fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} style={{ color: '#5b21b6' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Schedule Builder</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '3px 0 0' }}>Week of {weekStart} · {allAvailableSeats.length} open seats</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 10, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
              {(['Select', 'Preview'] as const).map((label, i) => {
                const isActive = (i === 0 && step === 'select') || (i === 1 && step === 'preview')
                const isDone   = i === 0 && step === 'preview'
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: isActive ? 'white' : 'transparent', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: isDone || isActive ? '#7c3aed' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'white' }}>
                      {isDone ? <Check size={9} /> : i + 1}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#0f172a' : '#94a3b8' }}>{label}</span>
                  </div>
                )
              })}
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: '#f8fafc', border: '1px solid #cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Step 1 — Select */}
        {step === 'select' && (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => { students.forEach(s => { if (!selectedIds.has(s.id)) toggleStudent(s.id) }) }} style={btnSecondary}>All</button>
              <button onClick={() => { setSelectedIds(new Set()); setStudentNeeds({}) }} style={btnSecondary}>None</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredStudents.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No students found</div>
              ) : filteredStudents.map(student => {
                const isSelected = selectedIds.has(student.id)
                const isBooked   = bookedStudentIds.has(student.id)
                const needs      = studentNeeds[student.id] ?? []
                const hasEmpty   = needs.some(n => !n.subject)
                const activeAvailability = studentAvailability[student.id] ?? student.availabilityBlocks ?? []

                return (
                  <div key={student.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? 'white' : 'white', transition: 'background 0.1s', borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent' }}>
                    {/* Student row */}
                    <div
                      onClick={() => toggleStudent(student.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', cursor: 'pointer', opacity: isBooked ? 0.82 : 1, background: isSelected ? '#fafafa' : 'white' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${isSelected ? '#7c3aed' : '#cbd5e1'}`, background: isSelected ? '#7c3aed' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                        {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                      </div>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: isSelected ? '#7c3aed' : '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                        {student.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{student.name}</p>
                        {student.grade && <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Grade {student.grade}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isBooked && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>Booked</span>}
                        {activeAvailability.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>{activeAvailability.length} avail blocks</span>}
                        {isSelected && hasEmpty && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}>Pick subject</span>}
                        {isSelected && !hasEmpty && needs.length > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                            {needs.length} session{needs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subject rows — shown when selected */}
                    {isSelected && (
                      <div style={{ padding: '0 24px 14px 62px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setAvailabilityOpenFor(prev => prev === student.id ? null : student.id) }}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            {availabilityOpenFor === student.id ? 'Hide availability' : 'Edit availability'}
                          </button>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); resetAvailability(student.id) }}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            Reset
                          </button>
                        </div>

                        {availabilityOpenFor === student.id && (
                          <div style={{ borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#64748b', padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Session</span>
                                    {savingAvailability.has(student.id) && (
                                      <span style={{ fontSize: 9, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1.5s infinite' }} />
                                        saving
                                      </span>
                                    )}
                                  </th>
                                  {AVAILABILITY_DAYS.map(d => (
                                    <th key={d.dow} style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#64748b', padding: '7px 6px' }}>{d.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {SESSION_BLOCKS.map((block, i) => (
                                  <tr key={block.id} style={{ borderBottom: i < SESSION_BLOCKS.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <td style={{ padding: '7px 10px' }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{block.label}</div>
                                      <div style={{ fontSize: 10, color: '#64748b' }}>{block.display}</div>
                                    </td>
                                    {AVAILABILITY_DAYS.map(d => {
                                      const applicable = block.days.includes(d.dow)
                                      const active = applicable && activeAvailability.includes(`${d.dow}-${block.time}`)
                                      return (
                                        <td key={d.dow} style={{ padding: 6, textAlign: 'center' }}>
                                          {applicable ? (
                                            <button
                                              type="button"
                                              onClick={e => { e.stopPropagation(); toggleAvailabilityBlock(student.id, d.dow, block.time) }}
                                              style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 7,
                                                border: `1.5px solid ${active ? '#7c3aed' : '#cbd5e1'}`,
                                                background: active ? '#7c3aed' : 'white',
                                                color: active ? 'white' : '#94a3b8',
                                                fontSize: 11,
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                              }}>
                                              {active ? '✓' : ''}
                                            </button>
                                          ) : (
                                            <div style={{ width: 24, height: 24, margin: '0 auto', borderRadius: 7, background: '#f1f5f9' }} />
                                          )}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {needs.map((need, idx) => (
                          <div key={need.needId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#64748b', flexShrink: 0 }}>
                              {idx + 1}
                            </div>
                            <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
                              <select
                                value={need.subject}
                                onChange={e => setSubject(student.id, need.needId, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: '100%', padding: '7px 28px 7px 12px', borderRadius: 10, border: `1.5px solid ${!need.subject ? '#ef4444' : '#7c3aed'}`, fontSize: 13, fontWeight: 600, color: need.subject ? '#0f172a' : '#334155', background: 'white', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                              >
                                <option value="">Pick subject…</option>
                                {ALL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                            </div>
                            {needs.length > 1 && (
                              <button
                                onClick={e => { e.stopPropagation(); removeSubjectRow(student.id, need.needId) }}
                                style={{ width: 28, height: 28, borderRadius: 8, border: '1.5px solid #fecdd3', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48', flexShrink: 0 }}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                        {needs.length < 3 && (
                          <button
                            onClick={e => { e.stopPropagation(); addSubjectRow(student.id) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1.5px dashed #c4b5fd', background: 'transparent', color: '#7c3aed', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}
                          >
                            <Plus size={11} /> Add subject
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, color: missingSubject ? '#e11d48' : '#64748b', margin: 0 }}>
                {selectedCount === 0
                  ? 'Select students to schedule'
                  : missingSubject
                  ? 'Some students are missing a subject'
                  : `${allNeeds.length} session${allNeeds.length !== 1 ? 's' : ''} to book across ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`}
              </p>
              <button
                onClick={generate}
                disabled={!canGenerate}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: canGenerate ? 'pointer' : 'not-allowed', background: canGenerate ? '#7c3aed' : '#e2e8f0', color: canGenerate ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 700, boxShadow: canGenerate ? '0 4px 16px rgba(124,58,237,0.3)' : 'none', transition: 'all 0.2s' }}
              >
                {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <>Generate <ArrowRight size={13} /></>}
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Preview */}
        {step === 'preview' && (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>{placedCount} placed</span>
              {unmatchedCount > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fff1f2', color: '#e11d48' }}>{unmatchedCount} unmatched</span>}
              <span style={{ fontSize: 11, color: '#334155', fontWeight: 600, marginLeft: 4 }}>Week of {weekStart}</span>
              <button onClick={() => setStep('select')} style={{ ...btnSecondary, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={11} /> Back
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              <SchedulePreviewGrid
                proposals={proposals}
                allAvailableSeats={allAvailableSeats}
                existingSessions={sessions.map((s: any) => ({
                  date: s.date,
                  tutorId: s.tutorId,
                  time: s.time,
                  students: (s.students ?? [])
                    .filter((st: any) => st.status !== 'cancelled')
                    .map((st: any) => ({
                      studentName: st.name,
                      topic: st.topic,
                      status: st.status,
                      seriesId: st.seriesId ?? null,
                    })),
                }))}
                onSwap={swapSlot}
                onRemove={removeProposal}
              />
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 11, color: unmatchedCount > 0 ? '#e11d48' : '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                {unmatchedCount > 0 && <AlertTriangle size={11} />}
                {unmatchedCount > 0 ? `${unmatchedCount} couldn't be placed — book manually` : 'All sessions placed successfully'}
              </p>
              <button
                onClick={handleConfirm}
                disabled={placedCount === 0 || confirming}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: placedCount === 0 ? 'not-allowed' : 'pointer', background: placedCount > 0 ? '#0f172a' : '#e2e8f0', color: placedCount > 0 ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 700, boxShadow: placedCount > 0 ? '0 4px 12px rgba(0,0,0,0.15)' : 'none' }}
              >
                {confirming ? <><Loader2 size={14} className="animate-spin" /> Booking…</> : <><Check size={14} /> Confirm {placedCount} Booking{placedCount !== 1 ? 's' : ''}</>}
              </button>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}