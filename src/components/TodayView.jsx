import React, { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import {
  todayStr, isRecurringOn, isCompletedOn, isOverdue,
  CATEGORIES, PRIORITIES,
} from '../utils/dates'
import TaskCard from './TaskCard'

function Section({ title, count, children, accent, collapsed: defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div className="task-section">
      <button className="section-header" onClick={() => setCollapsed(c => !c)}>
        <span className="section-title" style={{ color: accent }}>{title}</span>
        <span className="section-count">{count}</span>
        <span className="section-chevron">{collapsed ? '›' : '⌄'}</span>
      </button>
      {!collapsed && <div className="section-body">{children}</div>}
    </div>
  )
}

export default function TodayView({ onEditTask, onAddTask }) {
  const { tasks, addTask, toggleComplete } = useTasks()
  const [quickTitle, setQuickTitle] = useState('')
  const today = todayStr()

  const overdue = tasks.filter(t =>
    !t.recurring && !t.completed && t.dueDate && isOverdue(t.dueDate)
  )

  const recurringToday = tasks.filter(t =>
    t.recurring && isRecurringOn(t, today)
  )

  const todayOnce = tasks.filter(t =>
    !t.recurring && t.dueDate === today
  )

  const doneToday = [...recurringToday, ...todayOnce].filter(t => isCompletedOn(t, today))
  const totalToday = recurringToday.length + todayOnce.length
  const donePct = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0

  // Sort: high priority first, then alphabetical
  function sortTasks(arr) {
    const order = { high: 0, medium: 1, low: 2 }
    return [...arr].sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1))
  }

  function handleQuickAdd(e) {
    e.preventDefault()
    if (!quickTitle.trim()) return
    addTask({ title: quickTitle.trim(), dueDate: today, category: 'work', priority: 'medium' })
    setQuickTitle('')
  }

  const allDone = totalToday > 0 && doneToday.length === totalToday

  return (
    <div className="view today-view">
      {/* Win banner */}
      {allDone && (
        <div className="win-banner">
          🎉 You crushed it today! All tasks complete.
        </div>
      )}

      {/* Quick add */}
      <form className="quick-add" onSubmit={handleQuickAdd}>
        <input
          className="quick-add-input"
          placeholder="⚡ Quick add a task for today..."
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary quick-add-btn">Add</button>
        <button type="button" className="btn btn-ghost" onClick={() => onAddTask({ dueDate: today })}>
          More options
        </button>
      </form>

      {/* Overdue */}
      {overdue.length > 0 && (
        <Section title="⚠️ Overdue" count={overdue.length} accent="var(--red)">
          {sortTasks(overdue).map(task => (
            <TaskCard key={task.id} task={task} date={today} onEdit={onEditTask} />
          ))}
        </Section>
      )}

      {/* Recurring today */}
      {recurringToday.length > 0 && (
        <Section title="🔁 Recurring" count={`${recurringToday.filter(t => isCompletedOn(t, today)).length}/${recurringToday.length}`} accent="var(--accent)">
          {sortTasks(recurringToday).map(task => (
            <TaskCard key={task.id} task={task} date={today} onEdit={onEditTask} />
          ))}
        </Section>
      )}

      {/* Today's one-time tasks */}
      {todayOnce.length > 0 && (
        <Section title="📌 Today's tasks" count={`${todayOnce.filter(t => isCompletedOn(t, today)).length}/${todayOnce.length}`} accent="var(--blue)">
          {sortTasks(todayOnce).map(task => (
            <TaskCard key={task.id} task={task} date={today} onEdit={onEditTask} />
          ))}
        </Section>
      )}

      {totalToday === 0 && overdue.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🌱</div>
          <p>No tasks scheduled for today.</p>
          <button className="btn btn-primary" onClick={() => onAddTask({ dueDate: today })}>
            Add your first task
          </button>
        </div>
      )}
    </div>
  )
}
