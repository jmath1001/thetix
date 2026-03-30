
"use client"
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, BarChart2, Activity, Calendar, TrendingUp, TrendingDown, Users, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toISODate, dayOfWeek, getCentralTimeNow, getWeekStart } from '@/lib/useScheduleData';

// ── Types ─────────────────────────────────────────────────────────────────────
type Event = {
  id: string;
  event_name: string;
  properties: Record<string, any>;
  created_at: string;
};

type SessionStudent = {
  id: string;
  status: string;
  date: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const mon = getWeekStart(d);
  return toISODate(mon);
}

function formatWeekLabel(isoMonday: string): string {
  const d = new Date(isoMonday + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const EVENT_LABELS: Record<string, string> = {
  attendance_marked:     'Attendance marked',
  confirmation_updated:  'Confirmation updated',
  notes_saved:           'Notes saved',
  session_booked:        'Session booked',
  student_card_expanded: 'Student card opened',
  student_searched:      'Student searched',
  modal_opened:          'Session modal opened',
  modal_closed:          'Session modal closed',
  reassign_used:         'Student reassigned',
  student_removed:       'Student removed',
  day_view_changed:      'Day view changed',
  week_view_changed:     'Week navigation',
  tab_switched:          'Tab switched',
  booking_form_opened:   'Booking form opened',
  recurring_booking_used:'Recurring booking used',
  metrics_panel_opened:  'Metrics panel opened',
  contact_expanded:      'Contact info expanded',
  bluebook_opened:       'Bluebook opened',
  tutor_filter_used:     'Tutor filter used',
  student_created:       'Student created',
  student_deleted:       'Student deleted',
  student_edited:        'Student edited',
};

const EVENT_CATEGORY: Record<string, string> = {
  attendance_marked:     'Attendance',
  confirmation_updated:  'Attendance',
  notes_saved:           'Notes',
  session_booked:        'Booking',
  recurring_booking_used:'Booking',
  booking_form_opened:   'Booking',
  student_card_expanded: 'Navigation',
  student_searched:      'Navigation',
  modal_opened:          'Navigation',
  modal_closed:          'Navigation',
  day_view_changed:      'Navigation',
  week_view_changed:     'Navigation',
  tab_switched:          'Navigation',
  tutor_filter_used:     'Navigation',
  reassign_used:         'Session Mgmt',
  student_removed:       'Session Mgmt',
  contact_expanded:      'Contact',
  bluebook_opened:       'Contact',
  metrics_panel_opened:  'Analytics',
  student_created:       'Students',
  student_deleted:       'Students',
  student_edited:        'Students',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Attendance':    '#16a34a',
  'Booking':       '#dc2626',
  'Navigation':    '#2563eb',
  'Notes':         '#d97706',
  'Session Mgmt':  '#7c3aed',
  'Contact':       '#0891b2',
  'Analytics':     '#64748b',
  'Students':      '#db2777',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ border: '1.5px solid #f1f5f9' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}>
          {icon}
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">{label}</p>
      </div>
      <p className="text-3xl font-black leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-[#94a3b8] mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────
function Bar({ value, max, color, label, count }: {
  value: number; max: number; color: string; label: string; count: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[#475569] font-medium w-36 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
      </div>
      <span className="text-[11px] font-black w-8 text-right shrink-0" style={{ color }}>{count}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [sessionStudents, setSessionStudents] = useState<SessionStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [weekRange, setWeekRange] = useState<4 | 8 | 12>(8);

  const fetchData = async () => {
    setLoading(true);
    const [eventsRes, sessionsRes] = await Promise.all([
      supabase
        .from('slake_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('slake_sessions')
        .select('id, session_date, slake_session_students(id, status)')
        .order('session_date'),
    ]);

    setEvents(eventsRes.data ?? []);
    setSessionStudents(
      (sessionsRes.data ?? []).flatMap((s: any) =>
        (s.slake_session_students ?? []).map((ss: any) => ({
          id: ss.id, status: ss.status, date: s.session_date,
        }))
      )
    );
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Derived data ────────────────────────────────────────────────────────────
  const today = toISODate(getCentralTimeNow());

  const topLevelStats = useMemo(() => {
    const total = events.length;
    const last7days = new Date(); last7days.setDate(last7days.getDate() - 7);
    const recent = events.filter(e => new Date(e.created_at) > last7days).length;
    const bookings = events.filter(e => e.event_name === 'session_booked').length;
    const attendanceMarked = events.filter(e => e.event_name === 'attendance_marked').length;
    return { total, recent, bookings, attendanceMarked };
  }, [events]);

  // Feature usage counts
  const featureUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      counts[e.event_name] = (counts[e.event_name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name, count,
        label: EVENT_LABELS[name] ?? name,
        category: EVENT_CATEGORY[name] ?? 'Other',
        color: CATEGORY_COLORS[EVENT_CATEGORY[name] ?? 'Other'] ?? '#94a3b8',
      }));
  }, [events]);

  const maxFeatureCount = featureUsage[0]?.count ?? 1;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const cat = EVENT_CATEGORY[e.event_name] ?? 'Other';
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count, color: CATEGORY_COLORS[cat] ?? '#94a3b8' }));
  }, [events]);

  // Weekly operational metrics from session data
  const weeklyOpsMetrics = useMemo(() => {
    const past = sessionStudents.filter(s => s.date < today);
    const weeks: Record<string, { present: number; noShow: number; total: number; bookings: number }> = {};

    past.forEach(s => {
      const wk = getWeekKey(s.date);
      if (!weeks[wk]) weeks[wk] = { present: 0, noShow: 0, total: 0, bookings: 0 };
      weeks[wk].total++;
      if (s.status === 'present' || s.status === 'confirmed') weeks[wk].present++;
      if (s.status === 'no-show') weeks[wk].noShow++;
    });

    // Also add bookings from events
    events.filter(e => e.event_name === 'session_booked').forEach(e => {
      const wk = getWeekKey(e.created_at);
      if (!weeks[wk]) weeks[wk] = { present: 0, noShow: 0, total: 0, bookings: 0 };
      weeks[wk].bookings++;
    });

    return Object.entries(weeks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-weekRange)
      .map(([wk, data]) => ({
        week: wk,
        label: formatWeekLabel(wk),
        ...data,
        attendanceRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : null,
        noShowRate: data.total > 0 ? Math.round((data.noShow / data.total) * 100) : null,
      }));
  }, [sessionStudents, events, today, weekRange]);

  // Weekly event counts
  const weeklyEventCounts = useMemo(() => {
    const weeks: Record<string, number> = {};
    events.forEach(e => {
      const wk = getWeekKey(e.created_at);
      weeks[wk] = (weeks[wk] ?? 0) + 1;
    });
    return Object.entries(weeks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-weekRange);
  }, [events, weekRange]);

  const maxWeeklyEvents = Math.max(...weeklyEventCounts.map(([, c]) => c), 1);

  // Rate color
  const rateColor = (r: number | null) =>
    r === null ? '#94a3b8' : r >= 80 ? '#16a34a' : r >= 60 ? '#f59e0b' : '#dc2626';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin text-[#dc2626]"/>
        <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">Loading analytics…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20" style={{ background: '#f8fafc', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-[#f1f5f9]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#dc2626] flex items-center justify-center">
              <BarChart2 size={14} className="text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black text-[#0f172a] leading-none">Analytics</h1>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#dc2626]">Pilot Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[10px] text-[#94a3b8]">
              Updated {timeAgo(lastRefresh.toISOString())}
            </p>
            <button onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#64748b] transition-all"
              style={{ background: '#f1f5f9' }}>
              <RefreshCw size={11}/> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-6">

        {/* ── Top KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Events" value={topLevelStats.total} sub="all time"
            color="#dc2626" icon={<Activity size={13}/>}/>
          <StatCard label="Last 7 Days" value={topLevelStats.recent} sub="events logged"
            color="#2563eb" icon={<TrendingUp size={13}/>}/>
          <StatCard label="Sessions Booked" value={topLevelStats.bookings} sub="via app"
            color="#16a34a" icon={<Calendar size={13}/>}/>
          <StatCard label="Attendance Marked" value={topLevelStats.attendanceMarked} sub="via app"
            color="#d97706" icon={<CheckCircle2 size={13}/>}/>
        </div>

        {/* ── Weekly activity + ops metrics ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1.5px solid #f1f5f9' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
            <div>
              <h2 className="text-sm font-black text-[#0f172a]">Weekly Overview</h2>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">App usage + attendance outcomes by week</p>
            </div>
            <div className="flex items-center gap-1">
              {([4, 8, 12] as const).map(w => (
                <button key={w} onClick={() => setWeekRange(w)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  style={weekRange === w
                    ? { background: '#dc2626', color: 'white' }
                    : { background: '#f8fafc', color: '#94a3b8' }}>
                  {w}w
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                  {['Week of', 'App Events', 'Sessions', 'Attendance', 'No-show', 'Bookings'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeklyOpsMetrics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-xs text-[#94a3b8] italic">
                      No data yet — start using the app and data will appear here
                    </td>
                  </tr>
                )}
                {weeklyOpsMetrics.map((wk, i) => {
                  const eventCount = weeklyEventCounts.find(([w]) => w === wk.week)?.[1] ?? 0;
                  const isCurrentWeek = wk.week === toISODate(getWeekStart(getCentralTimeNow()));
                  return (
                    <tr key={wk.week}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        background: isCurrentWeek ? '#fffbf9' : i % 2 === 0 ? 'white' : '#fafafa',
                      }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1e293b]">{wk.label}</span>
                          {isCurrentWeek && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white"
                              style={{ background: '#dc2626' }}>NOW</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                            <div className="h-full rounded-full bg-[#2563eb]"
                              style={{ width: `${Math.round((eventCount / maxWeeklyEvents) * 100)}%` }}/>
                          </div>
                          <span className="text-xs font-bold text-[#475569]">{eventCount}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-bold text-[#475569]">
                        {wk.total > 0 ? wk.total : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {wk.attendanceRate !== null
                          ? <span className="text-xs font-black" style={{ color: rateColor(wk.attendanceRate) }}>{wk.attendanceRate}%</span>
                          : <span className="text-[#cbd5e1] text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {wk.noShowRate !== null
                          ? <span className="text-xs font-black" style={{ color: wk.noShowRate > 20 ? '#dc2626' : '#94a3b8' }}>{wk.noShowRate}%</span>
                          : <span className="text-[#cbd5e1] text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-bold text-[#475569]">
                        {wk.bookings > 0 ? wk.bookings : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Feature usage + category breakdown ── */}
        <div className="grid md:grid-cols-3 gap-4">

          {/* Feature usage — full breakdown */}
          <div className="md:col-span-2 bg-white rounded-2xl p-6" style={{ border: '1.5px solid #f1f5f9' }}>
            <h2 className="text-sm font-black text-[#0f172a] mb-1">Feature Usage</h2>
            <p className="text-[10px] text-[#94a3b8] mb-4">Every tracked action, all time</p>
            {featureUsage.length === 0
              ? <p className="text-xs text-[#94a3b8] italic">No events yet</p>
              : (
                <div className="space-y-2.5">
                  {featureUsage.map(f => (
                    <Bar key={f.name} label={f.label} value={f.count} max={maxFeatureCount} count={f.count} color={f.color}/>
                  ))}
                </div>
              )}
          </div>

          {/* Category summary */}
          <div className="bg-white rounded-2xl p-6" style={{ border: '1.5px solid #f1f5f9' }}>
            <h2 className="text-sm font-black text-[#0f172a] mb-1">By Category</h2>
            <p className="text-[10px] text-[#94a3b8] mb-4">Which area gets most use</p>
            {categoryBreakdown.length === 0
              ? <p className="text-xs text-[#94a3b8] italic">No events yet</p>
              : (
                <div className="space-y-3">
                  {categoryBreakdown.map(c => {
                    const pct = Math.round((c.count / topLevelStats.total) * 100);
                    return (
                      <div key={c.cat}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: c.color }}/>
                            <span className="text-[11px] font-bold text-[#475569]">{c.cat}</span>
                          </div>
                          <span className="text-[11px] font-black" style={{ color: c.color }}>{c.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        {/* ── Live event feed ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1.5px solid #f1f5f9' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
            <div>
              <h2 className="text-sm font-black text-[#0f172a]">Event Feed</h2>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">Most recent actions</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"/>
              <span className="text-[10px] text-[#94a3b8]">Live</span>
            </div>
          </div>

          <div>
            {events.length === 0 && (
              <div className="px-6 py-8 text-center text-xs text-[#94a3b8] italic">
                No events yet — start using the app
              </div>
            )}
            {(showAllEvents ? events : events.slice(0, 20)).map((e, i) => {
              const category = EVENT_CATEGORY[e.event_name] ?? 'Other';
              const color = CATEGORY_COLORS[category] ?? '#94a3b8';
              const label = EVENT_LABELS[e.event_name] ?? e.event_name;
              const props = e.properties && Object.keys(e.properties).length > 0;
              return (
                <div key={e.id}
                  className="flex items-start gap-3 px-6 py-3 transition-colors"
                  style={{
                    borderBottom: i < events.length - 1 ? '1px solid #f8fafc' : 'none',
                    background: i % 2 === 0 ? 'white' : '#fafafa',
                  }}>
                  {/* Color dot */}
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#1e293b]">{label}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${color}18`, color }}>
                        {category}
                      </span>
                    </div>
                    {props && (
                      <p className="text-[10px] text-[#94a3b8] mt-0.5 truncate">
                        {Object.entries(e.properties)
                          .filter(([k]) => !['tutorId','studentId','sessionId'].includes(k))
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-[#cbd5e1] shrink-0 mt-0.5">{timeAgo(e.created_at)}</span>
                </div>
              );
            })}
          </div>

          {events.length > 20 && (
            <div className="px-6 py-3 border-t border-[#f8fafc]">
              <button onClick={() => setShowAllEvents(s => !s)}
                className="flex items-center gap-1.5 text-xs font-bold text-[#64748b] transition-all">
                {showAllEvents ? <><ChevronUp size={12}/> Show less</> : <><ChevronDown size={12}/> Show all {events.length} events</>}
              </button>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-[10px] text-[#cbd5e1] text-center pb-4">
          Operational metrics (attendance, no-show) are only as accurate as how consistently attendance is marked · Event tracking requires logEvent() calls in components
        </p>
      </div>
    </div>
  );
}