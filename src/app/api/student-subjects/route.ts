import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const tablePrefix = process.env.NEXT_PUBLIC_TABLE_PREFIX ?? 'slake'
const STUDENTS_TABLE = `${tablePrefix}_students`

export async function POST(req: NextRequest) {
  try {
    const { studentId, subjects } = await req.json()

    if (!studentId || !Array.isArray(subjects)) {
      return NextResponse.json({ error: 'Missing studentId or subjects' }, { status: 400 })
    }

    // Update the subjects column in students table
    const { error } = await supabase
      .from(STUDENTS_TABLE)
      .update({ subjects })
      .eq('id', studentId)

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: 'Failed to update subjects' }, { status: 500 })
    }

    return NextResponse.json({ success: true, subjects })
  } catch (err) {
    console.error('Error in student-subjects route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
