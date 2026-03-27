import React, { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { CATEGORIES, PRIORITIES, getStreak, isCompletedOn, relativeDate } from '../utils/dates'

export default function TaskCard({ task, date, onEdit }) {
  const { toggleComplete, deleteTask } = useTasks()
  const [confirming, setConfirming] = useState(false)

  const completed = isCompletedOn(task, date)
  const streak = task.recurring ? getStreak(task) : 0
  const cat = CATEGORIES[task.category] || CATEGORIES.work
  const pri = PRIORITIES[task.priority] || PRIORITIES.medium

  function handleToggle() {
    toggleComplete(task.id, date)
  }

  function handleDelete() {
    if (confirming) {
      deleteTask(task.id)
    } else {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2500)
    }
  }

  return (
    <div
      className={`task-card ${completed ? 'completed' : ''}`}
      style={{ '--cat-color': cat.color }}
    >
      <div className="task-card-left">
        <button
          className={`task-check ${completed ? 'checked' : ''}`}
          onClick={handleToggle}
          title={completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {completed ? '✓' : ''}
        </button>
      </div>

      <div className="task-card-body">
        <div className="task-card-top">
          <span className="task-title">{task.title}</span>
          <span className="task-priority-dot" style={{ background: pri.color }} title={pri.label + ' priority'} />
        </div>

        {task.notes && (
          <p className="task-notes">{task.notes}</p>
        )}

        <div className="task-meta">
          <span className="task-cat-badge" style={{ color: cat.color, borderColor: cat.color + '44', background: cat.color + '18' }}>
            {cat.label}
          </span>
          {task.recurring && (
            <span className="task-recurring-badge">🔁 recurring</span>
          )}
          {!task.recurring && task.dueDate && (
            <span className={`task-due ${task.dueDate < date ? 'overdue' : ''}`}>
              📅 {relativeDate(task.dueDate)}
            </span>
          )}
          {streak > 0 && (
            <span className="task-streak" title={`${streak}-day streak!`}>
              🔥 {streak}
            </span>
          )}
        </div>
      </div>

      <div className="task-card-actions">
        <button className="task-action-btn" onClick={() => onEdit(task)} title="Edit">✎</button>
        <button
          className={`task-action-btn danger ${confirming ? 'confirming' : ''}`}
          onClick={handleDelete}
          title={confirming ? 'Click again to confirm delete' : 'Delete'}
        >
          {confirming ? '!' : '×'}
        </button>
      </div>
    </div>
  )
}
