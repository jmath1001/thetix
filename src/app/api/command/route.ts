import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Simple optimization logic
function generateOptimizationProposal(context: any) {
  const { students = [], tutors = [], upcomingSessions = [], availableSeats = [] } = context
  const changes: any[] = []

  // Find students not assigned to any upcoming sessions
  const assignedStudentIds = new Set()
  upcomingSessions.forEach((session: any) => {
    session.students?.forEach((student: any) => {
      assignedStudentIds.add(student.id)
    })
  })

  const unassignedStudents = students.filter((s: any) => !assignedStudentIds.has(s.id))

  console.log(`Total students: ${students.length}`)
  console.log(`Total tutors: ${tutors.length}`)
  console.log(`Total upcoming sessions: ${upcomingSessions.length}`)
  console.log(`Total available seats: ${availableSeats.length}`)
  console.log(`Assigned student IDs:`, Array.from(assignedStudentIds))
  console.log(`Unassigned students:`, unassignedStudents.map((s: any) => ({ id: s.id, name: s.name, subject: s.subject, hoursLeft: s.hoursLeft })))

  // For each unassigned student, find best tutor match
  unassignedStudents.forEach((student: any) => {
    const studentSubject = student.subject?.toLowerCase() || ''
    console.log(`Processing ${student.name} with subject: ${studentSubject}`)

    // Find tutors who teach this student's subject (case-insensitive partial match)
    const matchingTutors = tutors.filter((tutor: any) =>
      tutor.subjects?.some((subject: string) =>
        subject.toLowerCase().includes(studentSubject) ||
        studentSubject.includes(subject.toLowerCase())
      )
    )

    console.log(`Found ${matchingTutors.length} matching tutors for ${student.name}:`, matchingTutors.map((t: any) => t.name))

    if (matchingTutors.length === 0) {
      // If no exact match, use any available tutor (fallback)
      console.log(`No subject match for ${student.name}, using fallback`)
      if (tutors.length > 0) {
        matchingTutors.push(tutors[0])
      }
    }

    if (matchingTutors.length === 0) return // No tutors available

    // Find available seats for matching tutors
    const availableSlots = availableSeats.filter((seat: any) =>
      matchingTutors.some((tutor: any) => tutor.name === seat.tutor)
    )

    console.log(`Found ${availableSlots.length} available slots for ${student.name}`)

    if (availableSlots.length === 0) return // No available slots

    // Prefer slots that are already partially filled (efficiency) or earliest time
    const bestSlot = availableSlots.find((slot: any) => slot.seatsLeft < 3) ||
                    availableSlots.sort((a: any, b: any) => a.time.localeCompare(b.time))[0]

    if (bestSlot) {
      changes.push({
        studentName: student.name,
        oldTime: 'Unassigned',
        newSlot: {
          time: bestSlot.time,
          tutorName: bestSlot.tutor,
          date: bestSlot.date
        },
        explanation: `Book ${student.name} with ${bestSlot.tutor} for ${student.subject || 'tutoring'}`
      })
      console.log(`Assigned ${student.name} to ${bestSlot.tutor} at ${bestSlot.time} on ${bestSlot.date}`)
    }
  })

  console.log(`Generated ${changes.length} optimization changes`)

  if (changes.length === 0) {
    const reason = unassignedStudents.length === 0
      ? `All ${students.length} students are already booked in upcoming sessions.`
      : tutors.length === 0
      ? 'No tutors available for optimization.'
      : availableSeats.length === 0
      ? 'No available seats for optimization.'
      : `Found ${unassignedStudents.length} unassigned students but no suitable matches.`
    return {
      type: 'answer',
      text: `${reason} No optimization needed.`
    }
  }

  return {
    type: 'proposal',
    title: 'Book Unassigned Students',
    reasoning: `Found ${unassignedStudents.length} students who need booking. Assigned them to ${new Set(changes.map(c => c.newSlot.tutorName)).size} tutors based on subject matching and availability.`,
    changes
  }
}

export async function POST(req: NextRequest) {
  const { query, context } = await req.json()

  // Check if this is an optimization query - be more specific to avoid false positives
  const optimizationKeywords = ['optimize', 'rebalance', 'improve schedule', 'auto-assign', 'smart assign']
  const isOptimizationQuery = optimizationKeywords.some(keyword =>
    query.toLowerCase().includes(keyword)
  ) || query.toLowerCase().startsWith('optimize')

  console.log(`Query: "${query}", isOptimizationQuery: ${isOptimizationQuery}`)

  if (isOptimizationQuery) {
    const proposal = generateOptimizationProposal(context)
    return NextResponse.json(proposal)
  }

  const systemPrompt = `
You are an AI assistant built into Thetix, a scheduling app for a tutoring center.
You have access to the center's live schedule data split into pastSessions and upcomingSessions.

CRITICAL: Return ONLY valid JSON in one of these exact formats. No extra text, no explanations, no markdown.

1. For slot/opening queries ("open slots", "available", "find a slot", "Physics slots", "who can I book"):
{"type":"slots","slotIndices":[0,1,2],"reason":"Short explanation of what matched"}

2. For list queries (students, sessions, attendance, upcoming sessions, etc.):
{"type":"list","title":"Descriptive title","items":["Item 1","Item 2","Item 3"]}

3. For booking requests ("book Maya for Physics Tuesday evening"):
{"type":"action","action":"open_booking","studentId":"<id>","slotDate":"<YYYY-MM-DD>","slotTime":"<HH:MM>","tutorId":"<id>","topic":"<subject>"}

4. For any other question:
{"type":"answer","text":"Plain English answer"}

ATTENDANCE RULES:
- For attendance queries, find relevant past sessions and return: {"type":"list","title":"Attendance for [date/session]","items":["Student Name: Present","Student Name: Absent",...]}
- Use the 'status' field from session student data
- If no attendance data found, return: {"type":"answer","text":"No attendance records found for that date"}

SESSIONS RULES:
- For "upcoming sessions" or "sessions this week": {"type":"list","title":"Upcoming Sessions","items":["Date Time - Tutor: Student1, Student2","..."]}
- For "past sessions" or "sessions last week": {"type":"list","title":"Past Sessions","items":["Date Time - Tutor: Student1 (Present), Student2 (Absent)","..."]}

GENERAL RULES:
- Use 12hr time format (3:30pm not 15:30)
- Be flexible - if user asks for students/sessions/anything that returns multiple items, use list type
- Don't be strict about format, just return useful data
- If uncertain, return answer type with your best guess
- For attendance, ALWAYS use list format with "Student: Status" format
- For sessions, include attendance status in past sessions
`

  const userMessage = `
Today: ${context.today}

Available seats this week:
${JSON.stringify(context.availableSeats?.map((s: any, i: number) => ({
  index: i,
  tutor: s.tutor.name,
  subjects: s.tutor.subjects,
  day: s.dayName,
  date: s.date,
  time: s.time,
  seatsLeft: s.seatsLeft,
  label: s.block?.label,
  display: s.block?.display,
})), null, 2)}

Past sessions:
${JSON.stringify(context.pastSessions, null, 2)}

Upcoming sessions:
${JSON.stringify(context.upcomingSessions, null, 2)}

Students:
${JSON.stringify(context.students, null, 2)}

Tutors:
${JSON.stringify(context.tutors, null, 2)}

User query: "${query}"
`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.2,
    })

    const text = response.choices[0].message.content?.trim() ?? ''

    try {
      const parsed = JSON.parse(text)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ type: 'answer', text })
    }
  } catch (err: any) {
    console.error('Command route error:', err)
    return NextResponse.json({ type: 'error', text: 'Something went wrong. Try again.' }, { status: 500 })
  }
}