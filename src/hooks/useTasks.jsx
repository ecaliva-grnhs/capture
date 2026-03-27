import React, { createContext, useContext, useState, useEffect } from 'react'
import { todayStr } from '../utils/dates'

const TaskContext = createContext(null)

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const SAMPLE_TASKS = [
  {
    id: 's1',
    title: 'Morning check-in: review today\'s priorities',
    notes: 'Pick your top 3 tasks for the day before opening email.',
    category: 'personal',
    priority: 'high',
    recurring: 'weekdays',
    recurringDays: [],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's2',
    title: 'Check and respond to emails',
    notes: 'Batch email time — morning only. Inbox zero.',
    category: 'admin',
    priority: 'high',
    recurring: 'weekdays',
    recurringDays: [],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's3',
    title: 'Weekly finance review',
    notes: 'Check P&L, outstanding invoices, upcoming expenses.',
    category: 'finance',
    priority: 'high',
    recurring: 'weekly',
    recurringDays: [1],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's4',
    title: 'Exercise / movement break',
    notes: 'At least 20 mins — walk, gym, stretching, anything.',
    category: 'health',
    priority: 'high',
    recurring: 'daily',
    recurringDays: [],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's5',
    title: 'Monday brain dump',
    notes: 'Write everything on your mind, then sort into tasks.',
    category: 'personal',
    priority: 'medium',
    recurring: 'weekly',
    recurringDays: [1],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's6',
    title: 'Review & plan next week',
    notes: 'Friday review: what shipped, what\'s blocked, next week priorities.',
    category: 'work',
    priority: 'medium',
    recurring: 'weekly',
    recurringDays: [5],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's7',
    title: 'Send client update',
    notes: 'Include last week\'s progress and upcoming milestones.',
    category: 'client',
    priority: 'high',
    recurring: false,
    recurringDays: [],
    completedDates: [],
    dueDate: todayStr(),
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 's8',
    title: 'Post on social media',
    notes: 'One piece of content — tip, behind-the-scenes, or update.',
    category: 'marketing',
    priority: 'medium',
    recurring: 'weekly',
    recurringDays: [2, 4],
    completedDates: [],
    dueDate: null,
    completed: false,
    createdAt: new Date().toISOString(),
  },
]

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState(() => {
    try {
      const stored = localStorage.getItem('focusflow-tasks')
      return stored ? JSON.parse(stored) : SAMPLE_TASKS
    } catch {
      return SAMPLE_TASKS
    }
  })

  useEffect(() => {
    localStorage.setItem('focusflow-tasks', JSON.stringify(tasks))
  }, [tasks])

  function addTask(data) {
    const task = {
      id: makeId(),
      title: '',
      notes: '',
      category: 'work',
      priority: 'medium',
      recurring: false,
      recurringDays: [],
      completedDates: [],
      dueDate: null,
      completed: false,
      createdAt: new Date().toISOString(),
      ...data,
    }
    setTasks(prev => [...prev, task])
    return task
  }

  function updateTask(id, updates) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  /** Toggle completion for a specific date (for recurring) or overall (for one-time) */
  function toggleComplete(id, dateStr) {
    const date = dateStr || todayStr()
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task
      if (task.recurring) {
        const completedDates = task.completedDates || []
        return completedDates.includes(date)
          ? { ...task, completedDates: completedDates.filter(d => d !== date) }
          : { ...task, completedDates: [...completedDates, date] }
      } else {
        return { ...task, completed: !task.completed }
      }
    }))
  }

  return (
    <TaskContext.Provider value={{ tasks, addTask, updateTask, deleteTask, toggleComplete }}>
      {children}
    </TaskContext.Provider>
  )
}

export function useTasks() {
  return useContext(TaskContext)
}
