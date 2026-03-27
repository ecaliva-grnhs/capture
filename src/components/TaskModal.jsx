import React, { useState, useEffect, useRef } from 'react'
import { useTasks } from '../hooks/useTasks'
import { CATEGORIES, PRIORITIES, RECURRENCE_OPTIONS, DAYS, todayStr } from '../utils/dates'

export default function TaskModal({ task, defaults, onClose }) {
  const { addTask, updateTask } = useTasks()
  const isNew = !task?.id
  const titleRef = useRef(null)

  const [form, setForm] = useState({
    title: task?.title || '',
    notes: task?.notes || '',
    category: task?.category || defaults?.category || 'work',
    priority: task?.priority || defaults?.priority || 'medium',
    recurring: task?.recurring ?? defaults?.recurring ?? false,
    recurringDays: task?.recurringDays || defaults?.recurringDays || [],
    dueDate: task?.dueDate || defaults?.dueDate || (isNew ? todayStr() : null),
  })

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleRecurringDay(dow) {
    set('recurringDays', form.recurringDays.includes(dow)
      ? form.recurringDays.filter(d => d !== dow)
      : [...form.recurringDays, dow].sort())
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return

    const data = {
      ...form,
      title: form.title.trim(),
      notes: form.notes.trim(),
      dueDate: form.recurring ? null : (form.dueDate || null),
    }

    if (isNew) {
      addTask(data)
    } else {
      updateTask(task.id, data)
    }
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} onKeyDown={handleKeyDown}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isNew ? 'New Task' : 'Edit Task'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Title */}
          <div className="form-group">
            <label>Task</label>
            <input
              ref={titleRef}
              className="form-input"
              placeholder="What needs to happen?"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required
            />
          </div>

          {/* Notes */}
          <div className="form-group">
            <label>Notes <span className="label-hint">(optional)</span></label>
            <textarea
              className="form-input form-textarea"
              placeholder="Any extra details, links, context..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Category + Priority */}
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <div className="form-pills">
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button
                    type="button"
                    key={key}
                    className={`pill ${form.category === key ? 'active' : ''}`}
                    style={{ '--pill-color': cat.color }}
                    onClick={() => set('category', key)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Priority</label>
              <div className="form-pills">
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <button
                    type="button"
                    key={key}
                    className={`pill ${form.priority === key ? 'active' : ''}`}
                    style={{ '--pill-color': p.color }}
                    onClick={() => set('priority', key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div className="form-group">
            <label>Repeats?</label>
            <div className="form-pills">
              <button
                type="button"
                className={`pill ${!form.recurring ? 'active' : ''}`}
                style={{ '--pill-color': '#6c7086' }}
                onClick={() => set('recurring', false)}
              >
                One-time
              </button>
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  className={`pill ${form.recurring === opt.value ? 'active' : ''}`}
                  style={{ '--pill-color': '#cba6f7' }}
                  onClick={() => set('recurring', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly day picker */}
          {form.recurring === 'weekly' && (
            <div className="form-group">
              <label>Repeat on</label>
              <div className="day-picker">
                {DAYS.map((day, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`day-btn ${form.recurringDays.includes(i) ? 'active' : ''}`}
                    onClick={() => toggleRecurringDay(i)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly date picker */}
          {form.recurring === 'monthly' && (
            <div className="form-group">
              <label>Day of month</label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="31"
                value={form.recurringDays[0] || ''}
                onChange={e => set('recurringDays', e.target.value ? [parseInt(e.target.value)] : [])}
                placeholder="e.g. 1, 15, 28"
              />
            </div>
          )}

          {/* Due date for one-time tasks */}
          {!form.recurring && (
            <div className="form-group">
              <label>Due date <span className="label-hint">(optional)</span></label>
              <input
                type="date"
                className="form-input"
                value={form.dueDate || ''}
                onChange={e => set('dueDate', e.target.value || null)}
              />
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {isNew ? 'Add Task' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
