'use client'
import { useState } from 'react'
import { Save, X } from 'lucide-react'

const ALL_SUBJECTS = [
  'Algebra', 'Geometry', 'Precalculus', 'Calculus', 'Statistics',
  'IB Math', 'Physics', 'Chemistry', 'Biology', 'Psychology',
  'SAT Math', 'ACT Math', 'ACT Science', 'ACT English', 'SAT R/W',
  'English/Writing', 'Literature', 'History',
  'AP Physics C Mechanics', 'AP Physics C E&M', 'AP Environmental Science', 'AP Statistics',
]

interface StudentDetailsModalProps {
  student: any;
  onClose: () => void;
  onSave?: (updatedStudent: any) => void;
}

export default function StudentDetailsModal({ student, onClose, onSave }: StudentDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editSubjects, setEditSubjects] = useState<string[]>(
    Array.isArray(student.subjects) && student.subjects.length > 0 
      ? student.subjects 
      : (student.subject ? [student.subject] : [])
  )
  const [isSaving, setIsSaving] = useState(false)

  const currentSubjectsDisplay = Array.isArray(student.subjects) && student.subjects.length > 0
    ? student.subjects.join(', ')
    : (student.subject || 'Not set')

  const handleAddSubject = (subject: string) => {
    if (!editSubjects.includes(subject) && editSubjects.length < 3) {
      setEditSubjects([...editSubjects, subject])
    }
  }

  const handleRemoveSubject = (subject: string) => {
    setEditSubjects(editSubjects.filter(s => s !== subject))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/student-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, subjects: editSubjects })
      })
      if (!res.ok) throw new Error('Failed to save subjects')
      if (onSave) {
        onSave({ ...student, subjects: editSubjects })
      }
      setIsEditing(false)
    } catch (err) {
      console.error('Error saving subjects:', err)
      alert('Failed to save subjects.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{student.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Default Subjects</p>
            {!isEditing ? (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{currentSubjectsDisplay}</p>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-xs font-bold bg-purple-50 border border-purple-300 text-purple-700 rounded hover:bg-purple-100">
                  Edit
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {editSubjects.map(subject => (
                    <div key={subject} className="flex items-center gap-2 bg-purple-100 border border-purple-300 rounded-full px-3 py-1">
                      <span className="text-xs font-semibold text-purple-900">{subject}</span>
                      <button
                        onClick={() => handleRemoveSubject(subject)}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                {editSubjects.length < 3 && (
                  <div>
                    <select
                      value=""
                      onChange={e => { if (e.target.value) handleAddSubject(e.target.value); e.target.value = '' }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-gray-300 rounded bg-white text-gray-900">
                      <option value="">Add subject…</option>
                      {ALL_SUBJECTS.filter(s => !editSubjects.includes(s)).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 px-3 py-1.5 text-xs font-bold border border-gray-300 rounded bg-white text-gray-900 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
                    <Save size={13} /> {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 space-y-2">
            <p><strong className="text-xs font-bold text-gray-500 uppercase">Hours Left:</strong> <span className="text-sm text-gray-900">{student.hoursLeft}</span></p>
            {student.tutor && <p><strong className="text-xs font-bold text-gray-500 uppercase">Tutor:</strong> <span className="text-sm text-gray-900">{student.tutor}</span></p>}
            {student.day && <p><strong className="text-xs font-bold text-gray-500 uppercase">Day:</strong> <span className="text-sm text-gray-900">{student.day}</span></p>}
            {student.time && <p><strong className="text-xs font-bold text-gray-500 uppercase">Time:</strong> <span className="text-sm text-gray-900">{student.time}</span></p>}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
