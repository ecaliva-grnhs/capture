import React, { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import {
  CATEGORIES, RECURRENCE_OPTIONS, DAYS, getStreak, todayStr, isCompletedOn, isRecurringOn
} from '../utils/dates'
import TaskCard from './TaskCard'

function recurrenceLabel(task) {
  if (!task.recurring) return 'One-time'
  const opt = RECURRENCE_OPTIONS.find(o => o.value === task.recurring)
  if (task.recurring === 'weekly' && task.recurringDays?.length) {
    const dayNames = task.recurringDays.map(d => DAYS[d]).join(', ')
    return `Weekly — ${dayNames}`
  }
  if (task.recurring === 'monthly' && task.recurringDays?.length) {
    return `Monthly — day ${task.recurringDays[0]}`
  }
  return opt?.label || task.recurring
}

export default function RecurringView({ onEditTask, onAddTask }) {
  const { tasks } = useTasks()
  const [filter, setFilter] = useState('all')
  const today = todayStr()

  const recurring = tasks.filter(t => t.recurring)

  const RECURRENCE_TYPES = ['all', 'daily', 'weekdays', 'weekly', 'monthly']

  const filtered = filter === 'all'
    ? recurring
    : recurring.filter(t => t.recurring === filter)

  const sortOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...filtered].sort((a, b) => {
    const sa = getStreak(a), sb = getStreak(b)
    return sb - sa || (sortOrder[a.priority] ?? 1) - (sortOrder[b.priority] ?? 1)
  })

  // Stats
  const totalStreaks = recurring.reduce((sum, t) => sum + getStreak(t), 0)
  const doneToday = recurring.filter(t => isCompletedOn(t, today)).length
  const activeToday = recurring.filter(t => isRecurringOn(t, today)).length

  return (
    <div className="view recurring-view">
      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{recurring.length}</span>
          <span className="stat-label">Recurring tasks</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{doneToday}</span>
          <span className="stat-label">Done today</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{totalStreaks}</span>
          <span className="stat-label">Total streak days 🔥</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {RECURRENCE_TYPES.map(type => (
          <button
            key={type}
            className={`filter-tab ${filter === type ? 'active' : ''}`}
            onClick={() => setFilter(type)}
          >
            {type === 'all' ? 'All' :
             type === 'daily' ? 'Daily' :
             type === 'weekdays' ? 'Weekdays' :
             type === 'weekly' ? 'Weekly' : 'Monthly'}
            <span className="filter-count">
              {type === 'all' ? recurring.length : recurring.filter(t => t.recurring === type).length}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔁</div>
          <p>No recurring tasks yet.</p>
          <p className="empty-sub">Recurring tasks are the backbone of building good habits and business systems.</p>
          <button className="btn btn-primary" onClick={() => onAddTask({ recurring: 'daily' })}>
            Create your first recurring task
          </button>
        </div>
      ) : (
        sorted.map(task => (
          <div key={task.id} className="recurring-task-row">
            <TaskCard task={task} date={today} onEdit={onEditTask} />
            <div className="recurring-meta">
              <span className="recurring-label">⟳ {recurrenceLabel(task)}</span>
              {getStreak(task) > 0 && (
                <span className="streak-badge">🔥 {getStreak(task)}-day streak</span>
              )}
            </div>
          </div>
        ))
      )}

      <div className="recurring-add">
        <button className="btn btn-ghost" onClick={() => onAddTask({ recurring: 'daily' })}>
          + Add recurring task
        </button>
      </div>
    </div>
  )
}
