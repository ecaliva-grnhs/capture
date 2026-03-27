import React, { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import {
  getWeekDays, todayStr, isRecurringOn, isCompletedOn, DAYS, formatDate
} from '../utils/dates'
import TaskCard from './TaskCard'

export default function WeekView({ onEditTask, onAddTask }) {
  const { tasks } = useTasks()
  const today = todayStr()
  const weekDays = getWeekDays()
  const [selectedDay, setSelectedDay] = useState(today)

  function tasksForDay(dateStr) {
    const recurring = tasks.filter(t => t.recurring && isRecurringOn(t, dateStr))
    const once = tasks.filter(t => !t.recurring && t.dueDate === dateStr)
    return [...recurring, ...once]
  }

  function completedCount(dateStr) {
    return tasksForDay(dateStr).filter(t => isCompletedOn(t, dateStr)).length
  }

  const dayTasks = tasksForDay(selectedDay)
  const sortOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...dayTasks].sort((a, b) => (sortOrder[a.priority] ?? 1) - (sortOrder[b.priority] ?? 1))

  return (
    <div className="view week-view">
      {/* Day selector strip */}
      <div className="week-strip">
        {weekDays.map(dateStr => {
          const dayTasks = tasksForDay(dateStr)
          const done = completedCount(dateStr)
          const total = dayTasks.length
          const isToday = dateStr === today
          const isPast = dateStr < today
          const isSelected = dateStr === selectedDay
          const d = new Date(dateStr + 'T12:00:00')

          return (
            <button
              key={dateStr}
              className={`week-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
              onClick={() => setSelectedDay(dateStr)}
            >
              <span className="wdb-dow">{DAYS[d.getDay()]}</span>
              <span className="wdb-date">{d.getDate()}</span>
              {total > 0 && (
                <span className={`wdb-progress ${done === total ? 'complete' : ''}`}>
                  {done}/{total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day tasks */}
      <div className="week-day-detail">
        <div className="week-day-header">
          <h2 className="week-day-title">
            {selectedDay === today ? '⚡ Today — ' : ''}{formatDate(selectedDay)}
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => onAddTask({ dueDate: selectedDay })}>
            + Add
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state small">
            <p>Nothing scheduled.</p>
            <button className="btn btn-ghost btn-sm" onClick={() => onAddTask({ dueDate: selectedDay })}>
              Add a task for this day
            </button>
          </div>
        ) : (
          sorted.map(task => (
            <TaskCard key={task.id} task={task} date={selectedDay} onEdit={onEditTask} />
          ))
        )}
      </div>
    </div>
  )
}
