'use client'
import { useState, useCallback, useMemo } from 'react'
import { X, Sparkles, Loader2, Check, AlertTriangle, ChevronDown, RotateCcw, Calendar, User, Clock, ArrowRight } from 'lucide-react'
import type { Student, Tutor } from '@/lib/useScheduleData'

interface AvailableSeat {
  tutor: { id: string; name: string; subjects: string[]; cat: string }
  dayName: string
  date: string
  time: string
  seatsLeft: number
  block?: { label: string; display: string }
  dayNum: number
}

interface StudentRow {
  student: Student
  subject: string
  checked: boolean
}

type ProposalStatus = 'matched' | 'fallback' | 'unmatched'

interface Proposal {
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

const SUBJECT_FREQUENCY: Record<string, string> = {
  Algebra: 'Weekly',
  Geometry: 'Weekly',
  Precalculus: 'Weekly',
  Calculus: 'Twice weekly',
  Statistics: 'Weekly',
  'SAT Math': 'Biweekly',
  'ACT Math': 'Biweekly',
  Physics: 'Weekly',
  Chemistry: 'Weekly',
  Biology: 'Weekly',
  'ACT Science': 'Biweekly',
  'English/Writing': 'Weekly',
  Literature: 'Weekly',
  History: 'Weekly',
  'ACT English': 'Biweekly',
  'SAT Reading': 'Biweekly',
}

function subjectFrequency(subject: string) {
  return SUBJECT_FREQUENCY[subject] ?? 'Weekly'
}

function subjectMatchesTutor(subject: string, tutor: { subjects: string[] }): boolean {
  if (!subject) return false
  const s = subject.toLowerCase().trim()
  return tutor.subjects.some(ts => {
    const t = ts.toLowerCase().trim()
    return t === s || t.includes(s) || s.includes(t)
  })
}

function studentAvailableForSlot(student: Student, slot: AvailableSeat): boolean {
  if (!student.availabilityBlocks || student.availabilityBlocks.length === 0) return true
  return student.availabilityBlocks.includes(`${slot.dayNum}-${slot.time}`)
}

function bookingConflict(studentId: string, slot: AvailableSeat, bookedSlotsByStudent: Record<string, Set<string>>): boolean {
  return bookedSlotsByStudent[studentId]?.has(`${slot.date}-${slot.time}`) ?? false
}

// Client-side fallback with capacity tracking
function clientSideMatch(
  checkedRows: StudentRow[],
  allAvailableSeats: AvailableSeat[],
  bookedSlotsByStudent: Record<string, Set<string>>
): Proposal[] {
  const assignedCounts: Record<number, number> = {}
  const remaining = (i: number, seat: AvailableSeat) => seat.seatsLeft - (assignedCounts[i] ?? 0)
  const dayPriority: Record<number, number> = { 1: 2, 2: 1, 3: 0, 4: 1, 6: 2 }

  return checkedRows.map(r => {
    const candidates = allAvailableSeats
      .map((s, i) => ({ seat: s, index: i }))
      .filter(({ seat, index }) =>
        !bookingConflict(r.student.id, seat, bookedSlotsByStudent) &&
        subjectMatchesTutor(r.subject, seat.tutor) &&
        remaining(index, seat) > 0
      )

    const withAvail = candidates.filter(({ seat }) => studentAvailableForSlot(r.student, seat))
    const pool = withAvail.length > 0 ? withAvail : candidates

    if (pool.length === 0) {
      return { student: r.student, subject: r.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: `No ${r.subject} tutor available with capacity and no booking conflicts this week` }
    }

    const best = pool.sort((a, b) => {
      const fillA = a.seat.seatsLeft - remaining(a.index, a.seat)
      const fillB = b.seat.seatsLeft - remaining(b.index, b.seat)
      if (fillB !== fillA) return fillB - fillA
      if ((dayPriority[a.seat.dayNum] ?? 0) !== (dayPriority[b.seat.dayNum] ?? 0)) {
        return (dayPriority[a.seat.dayNum] ?? 0) - (dayPriority[b.seat.dayNum] ?? 0)
      }
      return a.seat.date.localeCompare(b.seat.date) || a.seat.time.localeCompare(b.seat.time)
    })[0]

    assignedCounts[best.index] = (assignedCounts[best.index] ?? 0) + 1
    const status: ProposalStatus = withAvail.length > 0 ? 'matched' : 'fallback'
    return { student: r.student, subject: r.subject, slot: best.seat, status, reason: status === 'matched' ? 'Subject and availability match' : 'Subject match — availability not considered' }
  })
}

export function ScheduleBuilder({ students, tutors, sessions, allAvailableSeats, weekStart, weekEnd, onConfirm, onClose }: ScheduleBuilderProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [rows, setRows] = useState<StudentRow[]>(() =>
    students.map(s => ({ student: s, subject: '', checked: false }))
  )
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [search, setSearch] = useState('')

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

  const checkedRows = rows.filter(r => r.checked)
  const missingSubject = checkedRows.filter(r => !r.subject).length
  const canGenerate = checkedRows.length > 0 && missingSubject === 0 && !generating

  const filteredRows = useMemo(() =>
    rows.filter(r => r.student.name.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  )

  const toggleRow = useCallback((id: string) => {
    setRows(prev => prev.map(r => r.student.id === id ? { ...r, checked: !r.checked } : r))
  }, [])

  const setSubject = useCallback((id: string, subject: string) => {
    setRows(prev => prev.map(r => r.student.id === id ? { ...r, subject } : r))
  }, [])

  const selectAll = useCallback(() => setRows(prev => prev.map(r => ({ ...r, checked: true }))), [])
  const clearAll  = useCallback(() => setRows(prev => prev.map(r => ({ ...r, checked: false }))), [])

  const generate = useCallback(async () => {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const res = await fetch('/api/schedule-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          studentsToSchedule: checkedRows.map(r => ({
            id: r.student.id,
            name: r.student.name,
            subject: r.subject,
            grade: r.student.grade,
            availabilityBlocks: r.student.availabilityBlocks ?? [],
          })),
          availableSeats: allAvailableSeats.map((s, i) => ({
            index: i,
            tutorId: s.tutor.id,
            tutorName: s.tutor.name,
            tutorSubjects: s.tutor.subjects,
            day: s.dayName,
            dayNum: s.dayNum,
            date: s.date,
            time: s.time,
            seatsLeft: s.seatsLeft,
            label: s.block?.label,
          })),
          studentExistingBookings: checkedRows.map(r => ({
            studentId: r.student.id,
            existingSlots: Array.from(bookedSlotsByStudent[r.student.id] ?? []),
          })),
        }),
      })

      if (!res.ok) throw new Error('API error')
      const data = await res.json()

      const built: Proposal[] = checkedRows.map(r => {
        const a = data.assignments?.find((x: any) => x.studentId === r.student.id)
        if (!a || a.slotIndex == null) {
          return { student: r.student, subject: r.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: a?.reason ?? 'No valid slot found' }
        }
        const slot = allAvailableSeats[a.slotIndex]
        if (!slot) {
          return { student: r.student, subject: r.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: 'Slot index invalid' }
        }
        if (bookingConflict(r.student.id, slot, bookedSlotsByStudent)) {
          return { student: r.student, subject: r.subject, slot: null, status: 'unmatched' as ProposalStatus, reason: 'Already booked at this same date and time' }
        }
        return { student: r.student, subject: r.subject, slot, status: a.status ?? 'matched', reason: a.reason ?? '' }
      })

      setProposals(built)
      setStep('preview')
    } catch {
      // Full client-side fallback
      setProposals(clientSideMatch(checkedRows, allAvailableSeats, bookedSlotsByStudent))
      setStep('preview')
    } finally {
      setGenerating(false)
    }
  }, [checkedRows, allAvailableSeats, weekStart, weekEnd, canGenerate, bookedSlotsByStudent])

  const swapSlot = useCallback((studentId: string, slotIndex: number) => {
    const slot = allAvailableSeats[slotIndex]
    if (!slot) return
    setProposals(prev => prev.map(p => p.student.id === studentId ? { ...p, slot, status: 'matched', reason: 'Manually selected' } : p))
  }, [allAvailableSeats])

  const removeProposal = useCallback((studentId: string) => {
    setProposals(prev => prev.filter(p => p.student.id !== studentId))
  }, [])

  const handleConfirm = async () => {
    const bookings = proposals.filter(p => p.slot).map(p => ({ student: p.student, slot: p.slot!, topic: p.subject }))
    if (!bookings.length) return

    const conflicts = bookings.filter(b => bookingConflict(b.student.id, b.slot, bookedSlotsByStudent))
    if (conflicts.length > 0) {
      alert('Some proposed bookings conflict with existing student sessions. Please remove or swap them before confirming.')
      return
    }

    setConfirming(true)
    try { await onConfirm(bookings) } finally { setConfirming(false) }
  }

  const placedCount    = proposals.filter(p => p.slot).length
  const unmatchedCount = proposals.filter(p => !p.slot).length

  const statusStyle = (s: ProposalStatus) =>
    s === 'matched'  ? { bg: '#f0fdf4', border: '#86efac', dot: '#16a34a', tag: '#dcfce7', tagText: '#166534', label: 'Matched' } :
    s === 'fallback' ? { bg: '#fffbeb', border: '#fde68a', dot: '#d97706', tag: '#fef3c7', tagText: '#92400e', label: 'Fallback' } :
                       { bg: '#fff1f2', border: '#fecdd3', dot: '#e11d48', tag: '#ffe4e6', tagText: '#9f1239', label: 'No slot' }

  const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', background: 'white', color: '#0f172a' }
  const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'white', color: '#334155' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {generating && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(248,250,252,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 28, background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 24px 80px rgba(15,23,42,0.12)', padding: '32px', color: '#0f172a', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#64748b', margin: 0 }}>Schedule builder</p>
                <h2 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 0', lineHeight: 1.05, color: '#0f172a' }}>Generating your schedule</h2>
              </div>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.75 }}>Matching students, validating capacity, and checking conflicts so you only see clean proposals.</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'stretch' }}>
                {[0, 1, 2, 3].map(index => (
                  <div key={index} style={{ flex: 1, height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: '100%', background: '#8b5cf6', animation: `growBar 1.2s ease-in-out ${index * 120}ms infinite alternate` }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#334155' }}>Capacity validation</span>
                <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#334155' }}>Conflict check</span>
                <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#334155' }}>Finalizing proposals</span>
              </div>
            </div>
          </div>
          <style>{`@keyframes growBar { from { transform: scaleX(0.3); } to { transform: scaleX(1); } }`}</style>
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 780, maxHeight: '88vh', background: 'white', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'white', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1 }}>Schedule Builder</p>
              <p style={{ fontSize: 11, color: '#475569', margin: '3px 0 0' }}>
                Week of {weekStart} · {allAvailableSeats.length} slots available
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
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
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Step 1 — Select */}
        {step === 'select' && (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={selectAll} style={btnSecondary}>All</button>
              <button onClick={clearAll} style={btnSecondary}>None</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 100px', padding: '8px 24px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', flexShrink: 0 }}>
              <div />
              <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Student</p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Subject needed</p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Availability</p>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredRows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No students found</div>
              ) : filteredRows.map(row => {
                const isBooked     = bookedStudentIds.has(row.student.id)
                const needsSubject = row.checked && !row.subject
                return (
                  <div
                    key={row.student.id}
                    onClick={() => toggleRow(row.student.id)}
                    style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 100px', padding: '11px 24px', alignItems: 'center', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: row.checked ? '#faf5ff' : 'white', transition: 'background 0.1s', opacity: isBooked ? 0.4 : 1 }}
                    onMouseEnter={e => { if (!row.checked) e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { if (!row.checked) e.currentTarget.style.background = 'white' }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${row.checked ? '#7c3aed' : '#cbd5e1'}`, background: row.checked ? '#7c3aed' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {row.checked && <Check size={11} color="white" strokeWidth={3} />}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#5b21b6', flexShrink: 0 }}>
                        {row.student.name.charAt(0)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.student.name}</p>
                        {row.student.grade && <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>Grade {row.student.grade}</p>}
                      </div>
                    </div>

                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <select
                        value={row.subject}
                        onChange={e => setSubject(row.student.id, e.target.value)}
                        style={{ width: '100%', padding: '8px 28px 8px 12px', borderRadius: 10, border: `1.5px solid ${needsSubject ? '#ef4444' : row.checked ? '#8b5cf6' : '#d1d5db'}`, fontSize: 13, fontWeight: 500, color: row.subject ? '#0f172a' : '#475569', background: 'white', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                      >
                        <option value="">Pick subject…</option>
                        {ALL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                      {row.subject && (
                        <div style={{ position: 'absolute', right: 8, bottom: -22, fontSize: 10, fontWeight: 700, color: '#334155', background: '#eef2ff', borderRadius: 999, padding: '3px 8px' }}>
                          {subjectFrequency(row.subject)} frequency
                        </div>
                      )}
                    </div>

                    <div>
                      {isBooked ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>Booked</span>
                      ) : row.student.availabilityBlocks?.length > 0 ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed' }}>Has avail.</span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: '#f8fafc', color: '#475569' }}>Any time</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, color: missingSubject > 0 ? '#e11d48' : '#64748b', margin: 0 }}>
                {checkedRows.length === 0 ? 'Select students to schedule'
                  : missingSubject > 0 ? `${missingSubject} student${missingSubject !== 1 ? 's' : ''} need a subject`
                  : `${checkedRows.length} student${checkedRows.length !== 1 ? 's' : ''} ready · ${weekStart} → ${weekEnd}`}
              </p>
              <button
                onClick={generate}
                disabled={!canGenerate}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: canGenerate ? 'pointer' : 'not-allowed', background: canGenerate ? '#7c3aed' : '#e2e8f0', color: canGenerate ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 700, boxShadow: canGenerate ? '0 4px 16px rgba(124,58,237,0.3)' : 'none', transition: 'all 0.2s' }}
              >
                {generating
                  ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  : <>Generate <ArrowRight size={13} /></>}
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Preview */}
        {step === 'preview' && (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>{placedCount} placed</span>
              {unmatchedCount > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fff1f2', color: '#e11d48' }}>{unmatchedCount} unmatched</span>}
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Week of {weekStart}</span>
              <button onClick={() => setStep('select')} style={{ ...btnSecondary, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={11} /> Back
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {proposals.map(p => {
                const sc = statusStyle(p.status)
                const swapOptions = allAvailableSeats.filter(s =>
                  subjectMatchesTutor(p.subject, s.tutor) &&
                  s !== p.slot &&
                  !bookingConflict(p.student.id, s, bookedSlotsByStudent)
                )
                return (
                  <div key={p.student.id} style={{ borderRadius: 12, border: `1.5px solid ${sc.border}`, background: sc.bg, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                    <div style={{ minWidth: 150 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{p.student.name}</p>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{p.subject}</p>
                    </div>
                    {p.slot ? (
                      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#334155' }}>
                          <User size={11} style={{ color: '#94a3b8' }} />{p.slot.tutor.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}>
                          <Calendar size={11} style={{ color: '#94a3b8' }} />{p.slot.dayName} {p.slot.date}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}>
                          <Clock size={11} style={{ color: '#94a3b8' }} />{p.slot.block?.label ?? p.slot.time}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.tag, color: sc.tagText }}>{sc.label}</span>
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={13} style={{ color: '#e11d48', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#e11d48', fontWeight: 500 }}>{p.reason}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {swapOptions.length > 0 && (
                        <div style={{ position: 'relative' }}>
                          <select
                            value=""
                            onChange={e => { if (e.target.value !== '') swapSlot(p.student.id, parseInt(e.target.value)) }}
                            style={{ padding: '5px 24px 5px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 11, color: '#475569', background: 'white', cursor: 'pointer', outline: 'none', appearance: 'none' }}
                          >
                            <option value="">Swap</option>
                            {swapOptions.slice(0, 10).map((s, i) => (
                              <option key={i} value={allAvailableSeats.indexOf(s)}>
                                {s.dayName} {s.block?.label ?? s.time} · {s.tutor.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={10} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                        </div>
                      )}
                      <button onClick={() => removeProposal(p.student.id)} style={{ width: 28, height: 28, borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 11, color: unmatchedCount > 0 ? '#e11d48' : '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                {unmatchedCount > 0 && <AlertTriangle size={11} />}
                {unmatchedCount > 0 ? `${unmatchedCount} couldn't be placed — book manually` : 'All students placed successfully'}
              </p>
              <button
                onClick={handleConfirm}
                disabled={placedCount === 0 || confirming}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: placedCount === 0 ? 'not-allowed' : 'pointer', background: placedCount > 0 ? '#0f172a' : '#e2e8f0', color: placedCount > 0 ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 700, boxShadow: placedCount > 0 ? '0 4px 12px rgba(0,0,0,0.15)' : 'none' }}
              >
                {confirming
                  ? <><Loader2 size={14} className="animate-spin" /> Booking…</>
                  : <><Check size={14} /> Confirm {placedCount} Booking{placedCount !== 1 ? 's' : ''}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}