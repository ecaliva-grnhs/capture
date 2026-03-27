import React from 'react'
import { useTasks } from '../hooks/useTasks'
import { todayStr, isRecurringOn, isCompletedOn } from '../utils/dates'

const NAV = [
  { id: 'today',     icon: '⚡', label: 'Today' },
  { id: 'week',      icon: '📅', label: 'This Week' },
  { id: 'recurring', icon: '🔁', label: 'Recurring' },
]

export default function Sidebar({ activeView, setActiveView }) {
  const { tasks } = useTasks()
  const today = todayStr()

  // Count incomplete tasks for today badge
  const todayCount = tasks.filter(t => {
    if (t.recurring) return isRecurringOn(t, today) && !isCompletedOn(t, today)
    return !t.completed && t.dueDate === today
  }).length

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">Focus<strong>Flow</strong></span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => setActiveView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.id === 'today' && todayCount > 0 && (
              <span className="nav-badge">{todayCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-tip">
          💡 <em>One task at a time.</em>
        </p>
      </div>
    </aside>
  )
}
