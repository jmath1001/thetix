import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TABLE_PREFIX = process.env.NEXT_PUBLIC_TABLE_PREFIX ?? 'slake'
const STUDENTS_TABLE = `${TABLE_PREFIX}_students`

export async function POST(req: NextRequest) {
  try {
    const { studentId, availabilityBlocks } = await req.json()

    if (!studentId || !Array.isArray(availabilityBlocks)) {
      return NextResponse.json(
        { error: 'Missing studentId or invalid availabilityBlocks' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from(STUDENTS_TABLE)
      .update({ availability_blocks: availabilityBlocks })
      .eq('id', studentId)
      .select()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Error updating availability:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
