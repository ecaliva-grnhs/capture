import React from 'react'
import { useTasks } from '../hooks/useTasks'
import { todayStr, isRecurringOn, isCompletedOn, formatDate } from '../utils/dates'

export default function Header({ onAddTask, onFocus }) {
  const { tasks } = useTasks()
  const today = todayStr()

  const todayTasks = tasks.filter(t => {
    if (t.recurring) return isRecurringOn(t, today)
    return t.dueDate === today
  })
  const doneTasks = todayTasks.filter(t => isCompletedOn(t, today))
  const pct = todayTasks.length ? Math.round((doneTasks.length / todayTasks.length) * 100) : 0

  const now = new Date()
  const greeting =
    now.getHours() < 12 ? 'Good morning' :
    now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-greeting">{greeting} 👋</h1>
        <p className="header-date">{formatDate(today)}</p>
      </div>

      <div className="header-center">
        {todayTasks.length > 0 && (
          <div className="progress-block">
            <div className="progress-label">
              <span>{doneTasks.length} / {todayTasks.length} today</span>
              <span className="progress-pct">{pct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="header-right">
        <button className="btn btn-ghost" onClick={onFocus} title="Focus timer">
          🍅 Focus
        </button>
        <button className="btn btn-primary" onClick={() => onAddTask()}>
          + Add Task
        </button>
      </div>
    </header>
  )
}
