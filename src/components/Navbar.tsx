'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Calendar, Users, GraduationCap,
  Repeat, Mail, ChevronLeft, ChevronRight, Menu,
} from 'lucide-react';

const navItems = [
  { name: 'Schedule',  icon: Calendar,      href: '/' },
  { name: 'Recurring', icon: Repeat,        href: '/recurring' },
  { name: 'Tutors',    icon: Users,         href: '/tutor' },
  { name: 'Students',  icon: GraduationCap, href: '/students' },
  { name: 'Contact',   icon: Mail,          href: '/contact' },
];

export function Navbar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const current = pathname || '/';
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (collapsed) return;
      if (window.innerWidth < 768) return;
      const target = event.target as Node | null;
      if (target && sidebarRef.current && !sidebarRef.current.contains(target)) {
        setCollapsed(true);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [collapsed]);

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        className="hidden md:flex md:sticky md:top-0 md:h-screen md:shrink-0 flex-col z-40 transition-all duration-200"
        style={{
          width: collapsed ? 64 : 200,
          background: '#ffffff',
          borderRight: '1px solid #f1f5f9',
          boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 h-14 shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
            style={{ color: '#64748b', border: '1px solid #e2e8f0', background: '#f8fafc' }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eef2f7'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
          >
            {collapsed ? <Menu size={14} /> : <ChevronLeft size={14} />}
          </button>
          {!collapsed && (
            <a href="/" className="flex items-center gap-2.5 min-w-0 overflow-hidden">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] shrink-0"
                style={{ background: 'linear-gradient(135deg, #dc2626, #9f1239)' }}>
                C2
              </div>
              <span className="font-black text-[13px] text-[#0f172a] truncate tracking-tight">C2</span>
            </a>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-2 py-3 flex-1">
          {navItems.map(({ name, icon: Icon, href }) => {
            const active = current === href;
            return (
              <a key={name} href={href}
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all"
                style={{
                  background: active ? '#fef2f2' : 'transparent',
                  color: active ? '#dc2626' : '#64748b',
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Icon size={16} style={{ flexShrink: 0, color: active ? '#dc2626' : '#94a3b8' }} />
                {!collapsed && <span className="truncate">{name}</span>}
              </a>
            );
          })}
        </nav>

        {/* Bottom spacer */}
        <div className="h-2 shrink-0" />
      </aside>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-1"
        style={{ background: '#ffffff', borderTop: '1px solid #f1f5f9', boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' }}>
        {navItems.map(({ name, icon: Icon, href }) => {
          const active = current === href;
          return (
            <a key={name} href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
              style={{ textDecoration: 'none', color: active ? '#dc2626' : '#94a3b8' }}>
              <Icon size={18} />
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500 }}>{name}</span>
            </a>
          );
        })}
      </nav>

      {/* Content spacing is handled globally with --sidebar-width */}
    </>
  );
}