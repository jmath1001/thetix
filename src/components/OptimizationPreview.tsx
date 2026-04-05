'use client'
import React from 'react'
import { Check, X, Zap, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react'

export default function OptimizationPreview({ proposal, onConfirm, onCancel, isApplying }: any) {
  if (!proposal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.6)] ring-1 ring-slate-100">

        <div className="border-b border-slate-200 bg-white/90 px-6 py-5 backdrop-blur-md sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
                  <Zap size={20} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-indigo-500">Session Preview</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{proposal.title || 'Booking Preview'}</h2>
                </div>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 shadow-sm">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 text-indigo-500" />
              <p>{proposal.reasoning}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[68vh] overflow-y-auto p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Proposed bookings</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Review the upcoming week before confirming</h3>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {proposal.changes?.length ?? 0} change{proposal.changes?.length === 1 ? '' : 's'} suggested
            </div>
          </div>

          <div className="space-y-4">
            {proposal.changes?.map((change: any, i: number) => (
              <div key={i} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 font-semibold">
                      {change.studentName?.[0] ?? 'S'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{change.studentName || 'Student'}</p>
                      <p className="text-xs text-slate-500">{change.oldTime ? `Current: ${change.oldTime}` : 'Currently unassigned'}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-50 p-3 text-sm text-slate-600">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">New slot</p>
                      <p className="mt-1 font-semibold text-slate-900">{change.newSlot?.time ?? 'TBD'}</p>
                      <p className="mt-1 text-slate-500">{change.newSlot?.tutorName ?? 'Tutor not set'}</p>
                      {change.newSlot?.date && <p className="mt-1 text-slate-500">{change.newSlot.date}</p>}
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-3 text-sm text-slate-600">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Why</p>
                      <p className="mt-1 text-slate-700">{change.explanation || 'Better balance and capacity'}</p>
                    </div>
                  </div>
                </div>

                <div className="hidden items-center justify-end sm:flex">
                  <div className="rounded-3xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                    Preview
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white/90 px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Review the session bookings above before confirming. The changes are only applied after you commit.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onCancel}
                disabled={isApplying}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Discard
              </button>
              <button
                onClick={() => onConfirm(proposal.changes)}
                disabled={isApplying}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isApplying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirm bookings</>
                ) : (
                  <><Check size={16} className="mr-2" /> Confirm bookings</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
